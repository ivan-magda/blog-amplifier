import { test } from "node:test";
import assert from "node:assert/strict";
import { sliceToBrackets } from "./claude-cli.js";

test("sliceToBrackets stops at the matching close, ignoring trailing prose", () => {
  const s = sliceToBrackets('[{"index":0,"comment":"hi"}]\n\nNote: arrays use [ ].');
  assert.equal(s, '[{"index":0,"comment":"hi"}]');
  assert.deepEqual(JSON.parse(s as string), [{ index: 0, comment: "hi" }]);
});

test("sliceToBrackets ignores brackets/braces inside string values", () => {
  const s = sliceToBrackets('[{"comment":"use [brackets] and a } here"}]');
  assert.deepEqual(JSON.parse(s as string), [{ comment: "use [brackets] and a } here" }]);
});

test("sliceToBrackets handles a leading ```json fence and trailing fence", () => {
  const s = sliceToBrackets('```json\n[{"index":1,"relevance":90,"rationale":"x"}]\n```');
  assert.deepEqual(JSON.parse(s as string), [{ index: 1, relevance: 90, rationale: "x" }]);
});

test("sliceToBrackets respects escaped quotes inside strings", () => {
  const s = sliceToBrackets('[{"comment":"a \\"quote\\" and ] bracket"}]');
  assert.deepEqual(JSON.parse(s as string), [{ comment: 'a "quote" and ] bracket' }]);
});

test("sliceToBrackets returns null when there is no opener or it never balances", () => {
  assert.equal(sliceToBrackets("no json here"), null);
  assert.equal(sliceToBrackets('[{"a":1}'), null);
});

test("sliceToBrackets is not fooled by a ']' inside a string before later elements + trailing prose", () => {
  // The old first-open/last-close scan would over-grab to the trailing ']';
  // the string-aware depth scan stops at the real structural close.
  const s = sliceToBrackets('[{"comment":"closes here ]"}, {"x":1}] trailing ] prose');
  assert.deepEqual(JSON.parse(s as string), [{ comment: "closes here ]" }, { x: 1 }]);
});
