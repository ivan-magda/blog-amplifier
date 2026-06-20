import { test } from "node:test";
import assert from "node:assert/strict";
import { sliceToBrackets, extractClaudeResult } from "./claude-cli.js";

test("extractClaudeResult reads the legacy single-object envelope", () => {
  const stdout = JSON.stringify({
    type: "result",
    result: "hello",
    session_id: "x",
  });
  assert.equal(extractClaudeResult(stdout), "hello");
});

test("extractClaudeResult reads the array-of-events envelope (CLI >= 2.1)", () => {
  const stdout = JSON.stringify([
    { type: "system", subtype: "init", session_id: "x" },
    {
      type: "assistant",
      message: { content: [{ type: "text", text: "ignored" }] },
    },
    { type: "rate_limit_event" },
    { type: "result", subtype: "success", result: "hello", is_error: false },
  ]);
  assert.equal(extractClaudeResult(stdout), "hello");
});

test("extractClaudeResult throws a clear error when no result string is present", () => {
  const stdout = JSON.stringify([{ type: "system", subtype: "init" }]);
  assert.throws(() => extractClaudeResult(stdout), /no string `result`/);
});

test("extractClaudeResult throws on non-JSON stdout", () => {
  assert.throws(
    () => extractClaudeResult("not json at all"),
    /Could not parse/,
  );
});

test("sliceToBrackets stops at the matching close, ignoring trailing prose", () => {
  const s = sliceToBrackets(
    '[{"index":0,"comment":"hi"}]\n\nNote: arrays use [ ].',
  );
  assert.equal(s, '[{"index":0,"comment":"hi"}]');
  assert.deepEqual(JSON.parse(s as string), [{ index: 0, comment: "hi" }]);
});

test("sliceToBrackets ignores brackets/braces inside string values", () => {
  const s = sliceToBrackets('[{"comment":"use [brackets] and a } here"}]');
  assert.deepEqual(JSON.parse(s as string), [
    { comment: "use [brackets] and a } here" },
  ]);
});

test("sliceToBrackets handles a leading ```json fence and trailing fence", () => {
  const s = sliceToBrackets(
    '```json\n[{"index":1,"relevance":90,"rationale":"x"}]\n```',
  );
  assert.deepEqual(JSON.parse(s as string), [
    { index: 1, relevance: 90, rationale: "x" },
  ]);
});

test("sliceToBrackets respects escaped quotes inside strings", () => {
  const s = sliceToBrackets('[{"comment":"a \\"quote\\" and ] bracket"}]');
  assert.deepEqual(JSON.parse(s as string), [
    { comment: 'a "quote" and ] bracket' },
  ]);
});

test("sliceToBrackets returns null when there is no opener or it never balances", () => {
  assert.equal(sliceToBrackets("no json here"), null);
  assert.equal(sliceToBrackets('[{"a":1}'), null);
});

test("sliceToBrackets is not fooled by a ']' inside a string before later elements + trailing prose", () => {
  // The old first-open/last-close scan would over-grab to the trailing ']';
  // the string-aware depth scan stops at the real structural close.
  const s = sliceToBrackets(
    '[{"comment":"closes here ]"}, {"x":1}] trailing ] prose',
  );
  assert.deepEqual(JSON.parse(s as string), [
    { comment: "closes here ]" },
    { x: 1 },
  ]);
});
