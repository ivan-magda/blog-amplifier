import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQueries } from "./index.js";

test("buildQueries: x query always carries the lang:en operator", () => {
  const { x } = buildQueries(
    ["Foundation Models", "apple-intelligence", "swift"],
    ["wwdc", "swift"],
  );
  assert.ok(x.includes("lang:en"), `expected lang:en in x query, got: ${x}`);
});

test("buildQueries: multi-word keywords are quoted in the x query", () => {
  const { x } = buildQueries(["Foundation Models"], []);
  assert.ok(
    x.includes('"Foundation Models"'),
    `expected quoted phrase in x query, got: ${x}`,
  );
});

test("buildQueries: linkedin query stays within the 85-char search limit", () => {
  const { linkedin } = buildQueries(
    [
      "Foundation Models",
      "Private Cloud Compute",
      "Dynamic Profiles",
      "Apple Intelligence",
      "LanguageModelSession",
      "swift",
      "ai-agents",
      "wwdc26",
    ],
    [],
  );
  assert.ok(
    linkedin.length <= 85,
    `expected linkedin query <= 85 chars, got ${linkedin.length}: ${linkedin}`,
  );
});

test("buildQueries: empty keywords still yields lang:en and an empty-ish linkedin query", () => {
  const { x, linkedin } = buildQueries([], []);
  assert.ok(x.includes("lang:en"), `expected lang:en even with no keywords, got: ${x}`);
  assert.ok(linkedin.length <= 85);
});
