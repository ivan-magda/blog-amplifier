#!/usr/bin/env node
/**
 * blog-amplifier CLI (PRD §3, §4, §9, §10, §13).
 *
 * argv dispatch: `process.argv.slice(2)`, first token is the command, the rest
 * are `--key value` / `--key=value` flags. Every command runs inside an async
 * `main()` wrapped in try/catch; failures print to stderr and set
 * `process.exitCode = 1` (so the process still flushes cleanly).
 *
 * Pipeline:
 *   add-subject → subjects → discover → judge → [human edits CSV] → record
 * `pipeline` chains discover + judge in one go.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { config } from "./config.js";
import {
  fromBlogPost,
  fromGitHubRepo,
  loadSubject,
  listSubjects,
  saveSubject,
} from "./extract/index.js";
import { discover } from "./discover/index.js";
import { getJudge } from "./judge/index.js";
import { rankCandidates } from "./score/index.js";
import { appendToReviewQueue, readApprovedRows } from "./review/queue.js";
import { appendLedger, loadActionedUrls } from "./log/ledger.js";
import { dedupeByUrl, selectCandidatesFile } from "./cli-helpers.js";
import { PLATFORMS } from "./types.js";
import type {
  CandidateBatch,
  LedgerEntry,
  Platform,
  ScoredBatch,
  ScoredCandidate,
  Subject,
} from "./types.js";

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

type Flags = Record<string, string | boolean>;

/**
 * Parse `--key value` and `--key=value` into a flat map. A `--flag` with no
 * following value (or followed by another `--flag`) is treated as boolean true.
 * Non-flag positionals are ignored — every command here is flag-driven.
 */
function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined || !token.startsWith("--")) continue;

    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }
  return flags;
}

/** Read a flag as a required non-empty string, or throw a clear error. */
function requireString(flags: Flags, key: string): string {
  const value = flags[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required flag --${key}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filesystem-safe ISO-ish timestamp with a short random suffix, e.g.
 * 2026-06-13T08-30-00-000Z-a1b2. The suffix prevents two same-millisecond runs
 * of one subject from overwriting each other's output. Always begins with the
 * 4-digit year, which resolveCandidatesFile relies on.
 */
function stamp(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  return `${iso}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Resolve `--platform x|linkedin|both` (default both) to a Platform[]. */
function resolvePlatforms(flags: Flags): Platform[] {
  const raw = flags["platform"];
  const value = typeof raw === "string" ? raw.toLowerCase() : "both";
  if (value === "both") return [...PLATFORMS];
  if (value === "x" || value === "linkedin") return [value];
  throw new Error(`Invalid --platform "${value}" (expected x | linkedin | both)`);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a `--run <id|latest|path>` argument to a candidates file path:
 *   1. an existing path (taken verbatim);
 *   2. else the newest `*.candidates.json` whose name starts with `<id>-`;
 *   3. else (only for "latest") the newest `*.candidates.json` overall.
 */
async function resolveCandidatesFile(run: string): Promise<string> {
  if (await pathExists(run)) return run;

  const dir = config.paths.candidates;
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  const selected = selectCandidatesFile(entries, run);
  if (selected) return path.join(dir, selected);

  throw new Error(
    `No candidates file found for --run "${run}". Run \`discover\` first.`,
  );
}

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

async function cmdAddSubject(flags: Flags): Promise<void> {
  const blog = flags["blog"];
  const repo = flags["repo"];

  let subject: Subject;
  if (typeof blog === "string" && blog.trim() !== "") {
    subject = await fromBlogPost(blog);
  } else if (typeof repo === "string" && repo.trim() !== "") {
    subject = await fromGitHubRepo(repo);
  } else {
    throw new Error("add-subject requires --blog <path> or --repo <owner/name>");
  }

  const file = await saveSubject(subject);
  console.log(`Saved subject "${subject.id}" → ${file}`);
}

async function cmdSubjects(): Promise<void> {
  const ids = await listSubjects();
  if (ids.length === 0) {
    console.log("(none)");
    return;
  }
  for (const id of ids) console.log(id);
}

/**
 * Discover candidates, drop already-actioned URLs (ledger dedup, PRD §10), and
 * write a CandidateBatch JSON. Returns the run id + written path so `pipeline`
 * can chain straight into `judge` without re-reading the file.
 */
async function runDiscover(flags: Flags): Promise<{ id: string; file: string }> {
  const id = requireString(flags, "subject");
  const platforms = resolvePlatforms(flags);

  const subject = await loadSubject(id);
  const found = await discover(subject, platforms);

  // Drop URLs already actioned (ledger dedup) AND duplicates within this batch
  // (actors can return the same post twice; a URL can appear on both platforms).
  const actioned = await loadActionedUrls();
  const kept = dedupeByUrl(found, actioned);

  const batch: CandidateBatch = {
    subjectId: subject.id,
    runAt: new Date().toISOString(),
    candidates: kept,
  };

  const file = path.join(config.paths.candidates, `${id}-${stamp()}.candidates.json`);
  await writeJson(file, batch);

  console.log(
    `discover [${platforms.join(", ")}]: found ${found.length}, ` +
      `kept ${kept.length} after ledger dedup → ${file}`,
  );
  return { id, file };
}

async function cmdDiscover(flags: Flags): Promise<void> {
  await runDiscover(flags);
}

/**
 * Score + draft a candidates batch and write the review queue (PRD §7–§9).
 * Two judge calls: `score()` over all candidates, then `draft()` over the
 * post-blend top-N. Drafts are merged back into the ranked rows by `index`.
 */
async function runJudge(candidatesFile: string): Promise<void> {
  const batch = await readJson<CandidateBatch>(candidatesFile);
  const subject = await loadSubject(batch.subjectId);

  const judge = getJudge();
  const relevance = await judge.score(subject, batch.candidates);
  if (relevance.length === 0 && batch.candidates.length > 0) {
    console.error(
      `judge: WARNING — scored 0 of ${batch.candidates.length} candidates. ` +
        "Every scoring batch failed (see errors above); the review queue will be empty. " +
        "This is NOT the same as 'no relevant candidates'.",
    );
  }
  const ranked: ScoredCandidate[] = rankCandidates(batch.candidates, relevance);

  const drafts = await judge.draft(subject, ranked);
  for (const d of drafts) {
    const target = ranked[d.index];
    if (target) target.draft = d.comment;
  }

  const runId = `${batch.subjectId}-${stamp()}`;

  const scoredBatch: ScoredBatch = {
    subjectId: batch.subjectId,
    runAt: new Date().toISOString(),
    scored: ranked,
  };
  const scoredFile = path.join(config.paths.queue, `${runId}.scored.json`);
  await writeJson(scoredFile, scoredBatch);

  await appendToReviewQueue(ranked, { runId, subjectId: batch.subjectId });

  console.log(`judge: surfaced ${ranked.length} candidate(s) → ${scoredFile}`);
  console.log(`Review queue: ${config.paths.reviewQueue}`);
  console.log(
    'Next: open the CSV, set the `decision` column to "approve"/"reject" ' +
      "(optionally edit `final_comment`), then run `record`.",
  );
}

async function cmdJudge(flags: Flags): Promise<void> {
  const run = requireString(flags, "run");
  const file = await resolveCandidatesFile(run);
  await runJudge(file);
}

/**
 * Read approved review-queue rows, append them to the ledger (deduped by URL),
 * and print a manual posting checklist. Idempotent: re-running never
 * double-records because the ledger dedups on `url` (PRD §9, §10).
 */
async function cmdRecord(): Promise<void> {
  const approved = await readApprovedRows();
  if (approved.length === 0) {
    console.log(
      'No approved rows found. Set `decision` to "approve" in ' +
        `${config.paths.reviewQueue} first.`,
    );
    return;
  }

  // Only the rows not already in the ledger (and not duplicated within this
  // run) are new. The checklist lists exactly these, so re-running `record`
  // never tells you to re-post something you've already posted.
  const existing = await loadActionedUrls();
  const fresh = dedupeByUrl(approved, existing);

  const ts = new Date().toISOString();
  const entries: LedgerEntry[] = fresh.map((row) => ({
    ts,
    subjectId: row.subjectId,
    platform: row.platform,
    url: row.url,
    comment: row.comment,
    status: "posted",
  }));

  const recorded = await appendLedger(entries);
  console.log(
    `Recorded ${recorded} new action(s) to ${config.paths.ledger} ` +
      `(${approved.length - recorded} already recorded or duplicate, skipped).`,
  );

  if (fresh.length === 0) {
    console.log("\nNothing new to post — every approved row is already in the ledger.");
    return;
  }

  console.log("\n=== POST THESE MANUALLY ===");
  for (const row of fresh) {
    console.log(`\n[${row.platform}] ${row.url}`);
    console.log(`  ${row.comment}`);
  }
  console.log("\n(Re-running `record` is safe — already-recorded rows are skipped.)");
}

async function cmdPipeline(flags: Flags): Promise<void> {
  const { file } = await runDiscover(flags);
  await runJudge(file);
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const USAGE = `blog-amplifier — find, rank, draft & review conversations to join.

Usage: <command> [flags]

Commands:
  add-subject --blog <path> | --repo <owner/name>
        Extract metadata into subjects/<id>.json.
  subjects
        List saved subject ids.
  discover --subject <id> [--platform x|linkedin|both]
        Run discovery (default: both), drop already-actioned URLs, and write
        data/candidates/<id>-<ts>.candidates.json.
  judge --run <id|latest|path>
        Relevance-score + draft a candidates batch; write the scored JSON and
        append to data/review-queue.csv (the human gate).
  record
        Read approved rows from the review queue, append to the ledger
        (deduped), and print a manual posting checklist.
  pipeline --subject <id> [--platform x|linkedin|both]
        Run discover then judge in one step.
  help
        Show this message.

Posting is always manual. Discovery is read-only and cookie-free; the review
queue is a mandatory human gate. See docs/PRD.md.`;

function printUsage(): void {
  console.log(USAGE);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const flags = parseFlags(argv.slice(1));

  switch (command) {
    case "add-subject":
      await cmdAddSubject(flags);
      break;
    case "subjects":
      await cmdSubjects();
      break;
    case "discover":
      await cmdDiscover(flags);
      break;
    case "judge":
      await cmdJudge(flags);
      break;
    case "record":
      await cmdRecord();
      break;
    case "pipeline":
      await cmdPipeline(flags);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printUsage();
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
