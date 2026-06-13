import { test } from "node:test";
import assert from "node:assert/strict";
import { distinctivePhrases } from "./text.js";

test("distinctivePhrases extracts a CamelCase API token", () => {
  assert.ok(
    distinctivePhrases("Working with LanguageModelSession in Swift").includes("LanguageModelSession"),
  );
});

test("distinctivePhrases extracts a Title-Case multiword phrase", () => {
  assert.ok(
    distinctivePhrases("Foundation Models, Year Two: On-Device API").includes("Foundation Models"),
  );
});

test("distinctivePhrases extracts a quoted span", () => {
  assert.ok(
    distinctivePhrases('A post about "Private Cloud Compute" today').includes("Private Cloud Compute"),
  );
});

test("distinctivePhrases works for a non-Apple subject (no topic hardcoding)", () => {
  // A Rust HTTP client repo — the extractor must surface its distinctive names
  // by ORTHOGRAPHY alone, with nothing Apple-specific baked in.
  const got = distinctivePhrases("ReqwestClient: a fast async HTTP client built on Tokio");
  assert.ok(got.includes("ReqwestClient"), `expected CamelCase token, got: ${got}`);
});

test("distinctivePhrases ignores generic lowercase prose", () => {
  assert.deepEqual(distinctivePhrases("the quick brown fox jumps over"), []);
});

test("distinctivePhrases caps the number of phrases", () => {
  const many = distinctivePhrases(
    '"Alpha Beta" "Gamma Delta" "Epsilon Zeta" "Eta Theta" SomeName OtherName',
  );
  assert.ok(many.length <= 3, `expected <= 3, got ${many.length}: ${many}`);
});
