import { test } from "node:test";
import assert from "node:assert/strict";
import { num } from "./normalize.js";

test("num parses plain numbers and numeric strings", () => {
  assert.equal(num(1234), 1234);
  assert.equal(num("1234"), 1234);
  assert.equal(num("  42 "), 42);
});

test("num parses grouping separators and k/m/b abbreviations", () => {
  assert.equal(num("1,234"), 1234);
  assert.equal(num("1.2K"), 1200);
  assert.equal(num("3.4M"), 3_400_000);
  assert.equal(num("2b"), 2_000_000_000);
});

test("num clamps negatives to 0 and rejects junk", () => {
  assert.equal(num("-5"), 0);
  assert.equal(num(-5), 0);
  assert.equal(num("abc"), 0);
  assert.equal(num("1.2.3"), 0);
  assert.equal(num({}), 0);
  assert.equal(num(null), 0);
  assert.equal(num(undefined), 0);
});
