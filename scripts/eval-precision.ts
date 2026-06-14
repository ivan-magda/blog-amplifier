/**
 * P4 validation harness — live e2e A/B of the precision change on a FROZEN
 * candidate batch, so any delta is the change, not a different scrape.
 *
 *   baseline = current pipeline  (judge with no disambiguation, gate off)
 *   after    = new pipeline      (judge with focus/notSubject + topicClass,
 *                                 relevance gate + per-platform norm + views tiebreak)
 *
 * Both use the REAL `claude -p` judge. Precision is measured against the
 * independently gold-labelled candidates (on_topic / adjacent / off_topic).
 *
 * Run: tsx scripts/eval-precision.ts
 */
import fs from "node:fs";
import { getJudge } from "../src/judge/index.js";
import { rankCandidates } from "../src/score/index.js";
import { loadSubject } from "../src/extract/index.js";
import type { Candidate, Subject, ScoredCandidate } from "../src/types.js";

// Parameterized: EVAL_CANDS=<candidates.json> EVAL_GOLD=<gold.json> EVAL_SUBJECT=<id>
const CANDS_FILE =
  process.env.EVAL_CANDS ??
  "data/candidates/wwdc26-foundation-models-year-two-2026-06-13T05-58-58-352Z.candidates.json";
const GOLD_FILE = process.env.EVAL_GOLD ?? "/tmp/gold.json";
const SUBJECT_ID = process.env.EVAL_SUBJECT ?? "wwdc26-foundation-models-year-two";

const candidates: Candidate[] = JSON.parse(fs.readFileSync(CANDS_FILE, "utf8")).candidates;
const gold: { idx: number; label: "on_topic" | "adjacent" | "off_topic" }[] = JSON.parse(
  fs.readFileSync(GOLD_FILE, "utf8"),
);
// gold[i].idx === i (same order as the saved batch); map url -> gold label.
const goldByUrl = new Map<string, string>();
candidates.forEach((c, i) => goldByUrl.set(c.url, gold[i]?.label ?? "off_topic"));

function summary(label: string, ranked: ScoredCandidate[]) {
  const x = ranked.filter((r) => r.platform === "x");
  const all = ranked;
  const cnt = (rows: ScoredCandidate[], want: string[]) =>
    rows.filter((r) => want.includes(goldByUrl.get(r.url) ?? "off_topic")).length;
  const pct = (n: number, d: number) => (d === 0 ? "—" : `${((100 * n) / d).toFixed(0)}%`);
  console.log(`\n## ${label}`);
  console.log(`  surfaced: ${all.length} total (${x.length} X, ${all.length - x.length} LinkedIn)`);
  console.log(
    `  X precision  on_topic: ${pct(cnt(x, ["on_topic"]), x.length)}` +
      `   on+adjacent: ${pct(cnt(x, ["on_topic", "adjacent"]), x.length)}` +
      `   (off_topic surfaced: ${cnt(x, ["off_topic"])})`,
  );
  console.log(
    `  ALL precision on_topic: ${pct(cnt(all, ["on_topic"]), all.length)}` +
      `   on+adjacent: ${pct(cnt(all, ["on_topic", "adjacent"]), all.length)}` +
      `   (off_topic surfaced: ${cnt(all, ["off_topic"])})`,
  );
  console.log(
    `  top X rows: ` +
      x
        .slice(0, 8)
        .map((r) => `@${r.author}[${goldByUrl.get(r.url)}/${r.relevance}${r.topicClass ? "/" + r.topicClass : ""}]`)
        .join(" "),
  );
}

async function main() {
  const judge = getJudge();
  const now = new Date("2026-06-13T20:30:00Z");

  // enriched = the subject as configured (with focus/notSubject); base = the
  // same subject with disambiguation stripped, i.e. today's behavior.
  const enriched: Subject = await loadSubject(SUBJECT_ID);
  const base: Subject = { ...enriched, focus: undefined, notSubject: undefined };
  console.log(`Subject: ${SUBJECT_ID}  | candidates: ${candidates.length}  | gold: ${GOLD_FILE}`);

  console.log(`Gold: ${gold.filter((g) => g.label === "on_topic").length} on_topic, ` +
    `${gold.filter((g) => g.label === "adjacent").length} adjacent, ` +
    `${gold.filter((g) => g.label === "off_topic").length} off_topic (of ${gold.length})`);

  console.log("\nJudging BASELINE (no disambiguation)…");
  const relBase = await judge.score(base, candidates);
  console.log("Judging AFTER (focus + notSubject)…");
  const relNew = await judge.score(enriched, candidates);
  fs.writeFileSync("/tmp/eval_rel.json", JSON.stringify({ relBase, relNew }));

  // Mean relevance by gold class — does the new judge SEPARATE classes better?
  const meanByClass = (rel: typeof relBase) => {
    const acc: Record<string, { sum: number; n: number }> = {};
    rel.forEach((r) => {
      const g = gold[r.index]?.label ?? "off_topic";
      (acc[g] ??= { sum: 0, n: 0 });
      acc[g].sum += r.relevance;
      acc[g].n++;
    });
    return Object.fromEntries(
      Object.entries(acc).map(([k, v]) => [k, Math.round(v.sum / v.n)]),
    );
  };
  const mb = meanByClass(relBase), mn = meanByClass(relNew);
  console.log(`\nMean relevance by gold class:`);
  console.log(`  baseline  on_topic=${mb.on_topic}  adjacent=${mb.adjacent}  off_topic=${mb.off_topic}  (separation on−off=${mb.on_topic - mb.off_topic})`);
  console.log(`  after     on_topic=${mn.on_topic}  adjacent=${mn.adjacent}  off_topic=${mn.off_topic}  (separation on−off=${mn.on_topic - mn.off_topic})`);

  // topicClass accuracy of the new judge vs gold (where it emitted a class)
  let classified = 0, correct = 0;
  relNew.forEach((r) => {
    if (!r.topicClass) return;
    classified++;
    const g = gold[r.index]?.label;
    if (g === r.topicClass) correct++;
  });
  console.log(
    `\nNew judge topicClass vs gold: ${correct}/${classified} exact (${((100 * correct) / Math.max(1, classified)).toFixed(0)}%)`,
  );

  const baseline = rankCandidates(candidates, relBase, {
    now,
    gateMode: "off",
    engagementNormalization: "batch",
    tiebreakViewsWeight: 0,
    // Reproduce the ORIGINAL blend: dedupeByAuthor now defaults true in config,
    // so pin it off here or the baseline silently dedups too and the A/B can't
    // isolate any one change.
    dedupeByAuthor: false,
  });
  const after = rankCandidates(candidates, relNew, {
    now,
    gateMode: "drop_off_topic",
    engagementNormalization: "per_platform",
    tiebreakViewsWeight: 0.03,
    dedupeByAuthor: true,
  });

  summary("BASELINE (current pipeline)", baseline);
  summary("AFTER (new pipeline)", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
