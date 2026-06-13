import { test } from "node:test";
import assert from "node:assert/strict";
import { num, obj, sinceDate, str } from "./normalize.js";

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

test("str coerces and returns undefined for nullish", () => {
  assert.equal(str("x"), "x");
  assert.equal(str(123), "123");
  assert.equal(str(null), undefined);
  assert.equal(str(undefined), undefined);
});

test("obj returns records and undefined for non-objects", () => {
  assert.deepEqual(obj({ a: 1 }), { a: 1 });
  assert.equal(obj(null), undefined);
  assert.equal(obj("x"), undefined);
  assert.equal(obj(5), undefined);
});

test("sinceDate is a UTC YYYY-MM-DD string daysAgo in the past", () => {
  const d = sinceDate(7);
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  // 7 days ago is strictly before today's date
  assert.ok(d < new Date().toISOString().slice(0, 10));
});
