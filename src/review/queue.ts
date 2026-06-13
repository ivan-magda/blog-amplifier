import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { config } from "../config.js";
import type { Platform, ScoredCandidate } from "../types.js";

/** CSV column order for the human-review queue (PRD §9). Do not reorder. */
const COLUMNS = [
  "run_id",
  "subject_id",
  "platform",
  "score",
  "relevance",
  "engagement",
  "recency",
  "author",
  "followers",
  "created_at",
  "url",
  "post_text",
  "draft_comment",
  "decision",
  "final_comment",
] as const;

/** Max characters of post body to surface in the CSV (kept readable). */
const POST_TEXT_LIMIT = 280;

/** Round to 3 decimal places. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) : text;
}

function toRecord(row: ScoredCandidate, meta: { runId: string; subjectId: string }) {
  return {
    run_id: meta.runId,
    subject_id: meta.subjectId,
    platform: row.platform,
    score: round3(row.score),
    relevance: round3(row.relevance),
    engagement: round3(row.engagementScore),
    recency: round3(row.recencyScore),
    author: row.author,
    followers: row.authorFollowers ?? "",
    created_at: row.createdAt,
    url: row.url,
    post_text: truncate(row.text, POST_TEXT_LIMIT),
    draft_comment: row.draft ?? "",
    decision: "",
    final_comment: "",
  };
}

/**
 * Append scored candidates to the review-queue CSV (the human gate). Writes a
 * header + rows when the file is new; appends headerless rows otherwise.
 * `decision` / `final_comment` are left blank for the human to fill in.
 */
export async function appendToReviewQueue(
  rows: ScoredCandidate[],
  meta: { runId: string; subjectId: string },
  opts?: { file?: string },
): Promise<void> {
  const file = opts?.file ?? config.paths.reviewQueue;
  const records = rows.map((row) => toRecord(row, meta));

  let exists = true;
  try {
    await fs.access(file);
  } catch {
    exists = false;
  }

  const csv = stringify(records, {
    header: !exists,
    columns: COLUMNS as unknown as string[],
  });

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, csv, "utf8");
}

/** A review-queue row the human approved, ready to record + post. */
export interface ApprovedRow {
  subjectId: string;
  platform: Platform;
  url: string;
  comment: string;
}

/**
 * Read approved rows from the review-queue CSV. Keeps rows whose `decision`
 * is "approve" (case/space-insensitive). Comment falls back to `draft_comment`
 * when `final_comment` is blank. Missing file → [].
 */
export async function readApprovedRows(opts?: { file?: string }): Promise<ApprovedRow[]> {
  const file = opts?.file ?? config.paths.reviewQueue;

  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  const approved: ApprovedRow[] = [];
  for (const rec of records) {
    if (String(rec.decision ?? "").trim().toLowerCase() !== "approve") continue;

    const finalComment = rec.final_comment;
    const comment =
      finalComment && finalComment.trim() ? finalComment : (rec.draft_comment ?? "");

    approved.push({
      subjectId: rec.subject_id ?? "",
      platform: rec.platform as Platform,
      url: rec.url ?? "",
      comment,
    });
  }

  return approved;
}
