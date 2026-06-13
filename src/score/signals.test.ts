import { test } from "node:test";
import assert from "node:assert/strict";
import { engagementRaw, minMaxNormalize, recencyScore } from "./signals.js";

test("engagementRaw weights replies double", () => {
  // 1 reply (×2) should equal 2 likes (×1).
  assert.equal(
    engagementRaw({ likes: 0, replies: 1, reposts: 0 }),
    engagementRaw({ likes: 2, replies: 0, reposts: 0 }),
  );
  // Reposts count single, like likes.
  assert.equal(
    engagementRaw({ likes: 1, replies: 0, reposts: 1 }),
    engagementRaw({ likes: 2, replies: 0, reposts: 0 }),
  );
});

test("minMaxNormalize scales to 0..1", () => {
  assert.deepEqual(minMaxNormalize([1, 2, 3]), [0, 0.5, 1]);
});

test("minMaxNormalize returns all 0 when there is no spread", () => {
  assert.deepEqual(minMaxNormalize([5, 5]), [0, 0]);
  assert.deepEqual(minMaxNormalize([7]), [0]);
});

test("minMaxNormalize of empty array is empty", () => {
  assert.deepEqual(minMaxNormalize([]), []);
});

test("recencyScore is ~1 for a post created now", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");
  assert.ok(Math.abs(recencyScore(now.toISOString(), 7, now) - 1) < 1e-9);
});

test("recencyScore is ~exp(-1) at one half-life", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  assert.ok(Math.abs(recencyScore(sevenDaysAgo, 7, now) - Math.exp(-1)) < 1e-9);
});

test("recencyScore treats future timestamps as age 0", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");
  const future = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  assert.equal(recencyScore(future, 7, now), 1);
});

test("recencyScore returns 0 for unparseable input", () => {
  assert.equal(recencyScore("not-a-date", 7, new Date()), 0);
});
