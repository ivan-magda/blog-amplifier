import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeByUrl, selectCandidatesFile } from "./cli-helpers.js";

const T = "2026-06-13T08-30-00-000Z-a1b2"; // a stamp()-shaped suffix
const files = [
  `wwdc26-notes-${T}.candidates.json`,
  `wwdc26-notes-deep-dive-${T}.candidates.json`,
  `react-2024-${T}.candidates.json`, // sibling id that ends in -<4 digits>
];

test("selectCandidatesFile matches only the exact id's timestamped file", () => {
  // --run wwdc26-notes must NOT match wwdc26-notes-deep-dive-...
  assert.equal(selectCandidatesFile(files, "wwdc26-notes"), `wwdc26-notes-${T}.candidates.json`);
});

test("selectCandidatesFile does not treat a sibling id ending in -YYYY as a timestamp", () => {
  // --run react must NOT match react-2024-... (2024- is an id segment, not a stamp)
  assert.equal(selectCandidatesFile(files, "react"), null);
  // the full id still resolves
  assert.equal(selectCandidatesFile(files, "react-2024"), `react-2024-${T}.candidates.json`);
});

test("selectCandidatesFile 'latest' returns the newest overall, ignores non-candidates", () => {
  const fs = [
    `a-2026-06-10T00-00-00-000Z-zzzz.candidates.json`,
    `b-2026-06-13T00-00-00-000Z-aaaa.candidates.json`,
    `notes.txt`,
  ];
  assert.equal(selectCandidatesFile(fs, "latest"), `b-2026-06-13T00-00-00-000Z-aaaa.candidates.json`);
  assert.equal(selectCandidatesFile([], "latest"), null);
});

test("dedupeByUrl drops intra-list duplicates and anything in the exclude set", () => {
  const items = [
    { url: "https://a/1", n: 1 },
    { url: "https://a/2", n: 2 },
    { url: "https://a/1", n: 3 }, // dup of #1
    { url: "https://a/3", n: 4 },
  ];
  const exclude = new Set(["https://a/2"]); // already actioned
  const out = dedupeByUrl(items, exclude);
  assert.deepEqual(
    out.map((i) => i.url),
    ["https://a/1", "https://a/3"],
  );
  assert.ok(exclude.has("https://a/2") && exclude.size === 1, "exclude set must not be mutated");
});
