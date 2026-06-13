import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates } from "./index.js";
import type { Candidate, RelevanceResult } from "../types.js";

const NOW = new Date("2026-06-13T00:00:00Z");

function cand(over: Partial<Candidate> & { url: string }): Candidate {
  return {
    platform: "x",
    author: "a",
    text: "t",
    likes: 0,
    replies: 0,
    reposts: 0,
    createdAt: "2026-06-13T00:00:00Z",
    ...over,
  };
}

function find(scored: ReturnType<typeof rankCandidates>, url: string) {
  return scored.find((s) => s.url === url);
}

test("default gate drops an off_topic-classified candidate", () => {
  const cands = [cand({ url: "a" })];
  const rel: RelevanceResult[] = [{ index: 0, relevance: 90, rationale: "", topicClass: "off_topic" }];
  const out = rankCandidates(cands, rel, { now: NOW });
  assert.equal(find(out, "a"), undefined, "default gate (drop_off_topic) must drop off_topic");
});

test("default gate leaves candidates WITHOUT a topicClass untouched (clean subjects unchanged)", () => {
  // A subject with no focus/notSubject => judge emits no topicClass => the gate
  // must not touch it, even with a low-ish relevance, so behavior matches today.
  const cands = [cand({ url: "a" })];
  const rel: RelevanceResult[] = [{ index: 0, relevance: 90, rationale: "" }];
  const out = rankCandidates(cands, rel, { now: NOW });
  assert.ok(find(out, "a"), "no topicClass => gate is a no-op (clean subjects behave as before)");
});

test("gateMode 'drop_off_topic' drops off_topic but keeps on_topic", () => {
  const cands = [cand({ url: "on" }), cand({ url: "off" })];
  const rel: RelevanceResult[] = [
    { index: 0, relevance: 90, rationale: "", topicClass: "on_topic" },
    { index: 1, relevance: 90, rationale: "", topicClass: "off_topic" },
  ];
  const out = rankCandidates(cands, rel, { now: NOW, gateMode: "drop_off_topic" });
  assert.ok(find(out, "on"), "on_topic kept");
  assert.equal(find(out, "off"), undefined, "off_topic dropped");
});

test("gateMode 'drop_off_topic_and_adjacent' also drops adjacent", () => {
  const cands = [cand({ url: "on" }), cand({ url: "adj" })];
  const rel: RelevanceResult[] = [
    { index: 0, relevance: 90, rationale: "", topicClass: "on_topic" },
    { index: 1, relevance: 90, rationale: "", topicClass: "adjacent" },
  ];
  const out = rankCandidates(cands, rel, { now: NOW, gateMode: "drop_off_topic_and_adjacent" });
  assert.ok(find(out, "on"));
  assert.equal(find(out, "adj"), undefined, "adjacent dropped under the strict gate");
});

test("relevanceFloor gates a candidate that has no topicClass (scalar fallback)", () => {
  // lo has high engagement so it clears minScore (0.45) on its own; only the
  // relevanceFloor can drop it — isolating the floor from the existing minScore.
  const cands = [cand({ url: "lo", likes: 100 }), cand({ url: "hi", likes: 0 })];
  const rel: RelevanceResult[] = [
    { index: 0, relevance: 30, rationale: "" },
    { index: 1, relevance: 80, rationale: "" },
  ];
  const noFloor = rankCandidates(cands, rel, { now: NOW });
  assert.ok(find(noFloor, "lo"), "without a floor, lo clears minScore and is kept");

  const out = rankCandidates(cands, rel, { now: NOW, relevanceFloor: 50 });
  assert.equal(find(out, "lo"), undefined, "below floor dropped");
  assert.ok(find(out, "hi"), "above floor kept");
});

test("per-platform engagement normalization normalizes within each platform", () => {
  const cands = [
    cand({ url: "x1", platform: "x", likes: 0 }),
    cand({ url: "x2", platform: "x", likes: 100 }),
    cand({ url: "li", platform: "linkedin", likes: 10 }),
  ];
  const rel: RelevanceResult[] = cands.map((_, i) => ({ index: i, relevance: 100, rationale: "" }));

  const batch = rankCandidates(cands, rel, { now: NOW, engagementNormalization: "batch" });
  // batch: log1p over [0,100,10] => li sits mid-range, well above 0
  assert.ok((find(batch, "li")?.engagementScore ?? 0) > 0.4, "batch normalizes li against x rows");

  const perPlat = rankCandidates(cands, rel, { now: NOW, engagementNormalization: "per_platform" });
  // per-platform: li is the only linkedin row, so it normalizes to 0
  assert.equal(find(perPlat, "li")?.engagementScore, 0, "lone linkedin row normalizes to 0 within its platform");
  assert.equal(find(perPlat, "x2")?.engagementScore, 1, "top x row normalizes to 1 within x");
});

test("views tiebreaker lifts the higher-views X row only when weight > 0", () => {
  const cands = [
    cand({ url: "lowv", platform: "x", views: 100, likes: 0 }),
    cand({ url: "hiv", platform: "x", views: 10000, likes: 0 }),
  ];
  const rel: RelevanceResult[] = cands.map((_, i) => ({ index: i, relevance: 80, rationale: "" }));

  const off = rankCandidates(cands, rel, { now: NOW, tiebreakViewsWeight: 0 });
  assert.equal(find(off, "lowv")?.score, find(off, "hiv")?.score, "weight 0 => no views effect (tie)");

  const on = rankCandidates(cands, rel, { now: NOW, tiebreakViewsWeight: 0.1 });
  assert.ok((find(on, "hiv")?.score ?? 0) > (find(on, "lowv")?.score ?? 0), "weight>0 lifts higher-views row");
  assert.equal(on[0]?.url, "hiv", "higher-views row ranks first");
});
