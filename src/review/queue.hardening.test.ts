import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { appendToReviewQueue, readApprovedRows } from "./queue.js";
import type { ScoredCandidate } from "../types.js";

function cand(over: Partial<ScoredCandidate> = {}): ScoredCandidate {
  return {
    platform: "x",
    url: "https://x.test/1",
    author: "alice",
    text: "hello world",
    likes: 1,
    replies: 0,
    reposts: 0,
    createdAt: "2026-06-13T00:00:00Z",
    relevance: 90,
    rationale: "on topic",
    engagementScore: 0.5,
    recencyScore: 0.9,
    score: 0.8,
    draft: "great post",
    ...over,
  };
}

const HEADER =
  "run_id,subject_id,platform,score,relevance,engagement,recency,author,followers,created_at,url,post_text,draft_comment,decision,final_comment";

async function tmpFile(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  return path.join(dir, "review-queue.csv");
}

test("appendToReviewQueue writes a header even when the file pre-exists as 0 bytes", async () => {
  const file = await tmpFile("queue-empty-");
  await writeFile(file, ""); // simulate an interrupted/empty prior write
  await appendToReviewQueue([cand()], { runId: "r1", subjectId: "s1" }, { file });

  const raw = await readFile(file, "utf8");
  assert.ok(raw.startsWith("run_id,subject_id,platform"), `expected header, got: ${raw.slice(0, 40)}`);

  // And the row is recoverable (not consumed as the header).
  const withApprove = raw.replace(/,,\n?$/, ",approve,\n");
  await writeFile(file, withApprove);
  const approved = await readApprovedRows({ file });
  assert.equal(approved.length, 1);

  await rm(path.dirname(file), { recursive: true, force: true });
});

test("appendToReviewQueue neutralizes =,+,-,@ formula-injection cells (incl. draft)", async () => {
  const file = await tmpFile("queue-formula-");
  await appendToReviewQueue(
    [cand({ author: '=HYPERLINK("http://evil","x")', text: "+cmd|'/c calc'!A1", draft: "-2+3", url: "@x" })],
    { runId: "r1", subjectId: "s1" },
    { file },
  );
  const raw = await readFile(file, "utf8");
  assert.ok(raw.includes("'=HYPERLINK"), "= author cell should be apostrophe-prefixed");
  assert.ok(raw.includes("'+cmd"), "+ text cell should be apostrophe-prefixed");
  assert.ok(raw.includes("'-2+3"), "- draft cell should be apostrophe-prefixed");
  assert.ok(raw.includes("'@x"), "@ url cell should be apostrophe-prefixed");

  await rm(path.dirname(file), { recursive: true, force: true });
});

test("readApprovedRows strips the formula-guard apostrophe so the posted comment is intact", async () => {
  const file = await tmpFile("queue-roundtrip-");
  // A draft that begins with @ gets escaped on write; the posted comment must not keep the '.
  await appendToReviewQueue(
    [cand({ draft: "@alice great point — also -1 and =42" })],
    { runId: "r1", subjectId: "s1" },
    { file },
  );
  let raw = await readFile(file, "utf8");
  raw = raw.replace(/,,\n?$/, ",approve,\n"); // approve the row (decision col)
  await writeFile(file, raw);

  const approved = await readApprovedRows({ file });
  assert.equal(approved.length, 1);
  assert.equal(approved[0]?.comment, "@alice great point — also -1 and =42");

  await rm(path.dirname(file), { recursive: true, force: true });
});

test("appendToReviewQueue inserts a separator newline when the file lost its trailing one", async () => {
  const file = await tmpFile("queue-newline-");
  await appendToReviewQueue([cand({ url: "https://x.test/a" })], { runId: "r1", subjectId: "s1" }, { file });
  // Simulate a hand-edit that dropped the trailing newline.
  await writeFile(file, (await readFile(file, "utf8")).replace(/\n+$/, ""));
  // Next batch appends headerless rows.
  await appendToReviewQueue([cand({ url: "https://x.test/b" })], { runId: "r2", subjectId: "s1" }, { file });

  const rows = parse(await readFile(file, "utf8"), { columns: true, skip_empty_lines: true });
  assert.equal(rows.length, 2, "rows must stay separate, not glue into one over-long line");
  assert.deepEqual(
    rows.map((r: Record<string, string>) => r.url),
    ["https://x.test/a", "https://x.test/b"],
  );

  await rm(path.dirname(file), { recursive: true, force: true });
});

test("readApprovedRows tolerates a malformed row instead of throwing", async () => {
  const file = await tmpFile("queue-malformed-");
  const good = `r1,s1,x,0.8,90,0.5,0.9,alice,100,2026-06-13,https://x.test/ok,hi,draftA,approve,`;
  const malformed = `r1,s1,x,oops,too,few`; // wrong column count
  await writeFile(file, `${HEADER}\n${good}\n${malformed}\n`);

  // Must not throw; the valid approved row is still returned.
  const approved = await readApprovedRows({ file });
  assert.equal(approved.length, 1);
  assert.equal(approved[0]?.url, "https://x.test/ok");

  await rm(path.dirname(file), { recursive: true, force: true });
});

test("readApprovedRows keeps valid platforms and skips invalid ones", async () => {
  const file = await tmpFile("queue-platform-");
  const rows = [
    `r1,s1,x,0.8,90,0.5,0.9,alice,100,2026-06-13,https://x.test/ok,hi,draftA,approve,`,
    `r1,s1,twitter,0.8,90,0.5,0.9,bob,100,2026-06-13,https://x.test/bad,hi,draftB,approve,`,
  ];
  await writeFile(file, `${HEADER}\n${rows.join("\n")}\n`);

  const approved = await readApprovedRows({ file });
  assert.equal(approved.length, 1);
  assert.equal(approved[0]?.platform, "x");
  assert.equal(approved[0]?.url, "https://x.test/ok");

  await rm(path.dirname(file), { recursive: true, force: true });
});
