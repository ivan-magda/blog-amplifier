import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

test("appendToReviewQueue neutralizes spreadsheet formula-injection cells", async () => {
  const file = await tmpFile("queue-formula-");
  await appendToReviewQueue(
    [cand({ author: '=HYPERLINK("http://evil","x")', text: "+cmd|'/c calc'!A1" })],
    { runId: "r1", subjectId: "s1" },
    { file },
  );
  const raw = await readFile(file, "utf8");
  assert.ok(raw.includes("'=HYPERLINK"), "formula author cell should be prefixed with an apostrophe");
  assert.ok(raw.includes("'+cmd"), "formula text cell should be prefixed with an apostrophe");

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
