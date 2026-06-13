# blog-amplifier — Product Requirements & Design Spec

- **Status:** Approved design (v1 scope)
- **Date:** 2026-06-13
- **Owner:** Ivan Magda
- **Companion research:** `docs/research/apify-social-scrapers-blog-promo-deep-research-2026-06-13.md` (verified actor/pricing/ToS facts this spec relies on)

---

## 1. Overview

`blog-amplifier` is a reusable command-line tool that finds existing conversations on X/Twitter and LinkedIn about a *subject* you want to promote — a **blog post** or a **GitHub repo** — ranks them by topic relevance, engagement, and recency, drafts value-adding comments with AI, and routes everything through a **human-review gate** before you post **manually**.

It is built around one principle proven by the research: **discovery and commenting are separate problems.** Every reliable scraper is read-only; every automated write path is unofficial, cookie-based, and ToS-risky (one is already deprecated). So the tool automates discovery → scoring → drafting, and leaves posting to a human. Your X/LinkedIn accounts are never handed to any tool.

### Problem
After publishing, the author manually hunts for relevant threads to join — slow, ad hoc, and easy to abandon. There is no repeatable way to surface the *right* conversations (on-topic, active, recent) and join them with genuine value instead of spam.

### Goal
One command set that turns "I published X" (post or repo) into "here are 15 ranked, on-topic conversations with a drafted comment for each — review and post the good ones."

---

## 2. Users & use cases

Single user (the author). Two subject types from day one, handled by the same pipeline:

1. **Blog post** — e.g. `wwdc26-foundation-models-year-two`. Metadata from AstroPaper frontmatter (`title`, `tags`, `description`).
2. **GitHub repo** — e.g. `ivan-magda/wwdc26-notes`. Metadata from the GitHub REST API (`description`, `topics`) plus README mining (topics are often sparse — `wwdc26-notes` has only `wwdc26`).

Reusing for a new subject is: add one `subjects/<id>.json`, then run the pipeline. Nothing else changes.

---

## 3. Scope

### v1 (this spec) — local CLI MVP
Five hand-run commands plus two helpers:

| Command | Does |
|---|---|
| `add-subject --blog <path>` / `--repo <owner/name>` | Extract metadata → write `subjects/<id>.json` |
| `subjects` | List saved subjects |
| `discover --subject <id> [--platform x\|linkedin\|both]` | Run Apify actor(s), normalize, drop already-actioned URLs → `data/candidates/<id>-<ts>.candidates.json` |
| `judge --run <id\|latest>` | `claude -p` relevance scoring + drafts → `data/queue/<id>-<ts>.scored.json`, append to `review-queue.csv` |
| `record` | Read approved rows from `review-queue.csv` → append to ledger; print posting checklist |
| `pipeline --subject <id>` | `discover` + `judge` in one step |

### Non-goals (v1)
- **No auto-posting / auto-commenting.** Posting is manual. (No safe actor exists — verified.)
- **No GitHub Actions / scheduling.** → Phase 2.
- **No metered LLM API.** Judge uses local `claude -p` (subscription). No `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`.
- **No database.** Flat JSON/CSV/JSONL files.
- **No LinkedIn comment automation.** No actor can post LinkedIn comments; all LinkedIn commenting is manual.

---

## 4. Architecture

Pipeline of small, independently-testable modules communicating through typed data and flat files.

```
subjects/<id>.json
  │  extract/{blog,github}            (metadata → Subject)
  ▼
discover/{apify,twitter,linkedin}     (Apify actor → normalized Candidate[], minus ledgered URLs)
  ▼  data/candidates/<id>-<ts>.candidates.json
judge/claude-cli + score              (relevance 0–100 + rationale; blend with engagement+recency; draft top-N)
  ▼  data/queue/<id>-<ts>.scored.json
review/queue                          (→ data/review-queue.csv : HUMAN GATE)
  ▼  [human edits `decision`; posts approved comments manually]
log/ledger                            (record → data/actions.log.jsonl : idempotency)
```

### Components

| Module | Responsibility | Inputs → Output | External dep |
|---|---|---|---|
| `extract/blog.ts` | Frontmatter → `Subject` | `.md` path → `Subject` | `gray-matter` |
| `extract/github.ts` | Repo meta + README → `Subject` | `owner/name` → `Subject` | GitHub REST (no auth) |
| `extract/index.ts` | Subject load/save/list, query builder | — | — |
| `discover/apify.ts` | Run an actor, return dataset items | `(actorId, input)` → `unknown[]` | `apify-client` |
| `discover/twitter.ts` | Build apidojo input + normalize | `Subject` → `Candidate[]` | — |
| `discover/linkedin.ts` | Build harvestapi input + normalize | `Subject` → `Candidate[]` | — |
| `judge/index.ts` | `Judge` interface + factory | — | — |
| `judge/claude-cli.ts` | `claude -p` score + draft | `(Subject, Candidate[])` → relevance/drafts | `claude` CLI |
| `score/index.ts` | Blend signals, threshold, top-N | `ScoredInputs` → `ScoredCandidate[]` | — |
| `score/signals.ts` | Engagement norm + recency decay | numbers → numbers | — |
| `review/queue.ts` | Write/read review CSV | `ScoredCandidate[]` ⇄ approved rows | `csv-stringify`, `csv-parse` |
| `log/ledger.ts` | Append-only ledger, URL dedup | `LedgerEntry` / `Set<url>` | — |
| `cli.ts` | Subcommand dispatch | argv | — |
| `config.ts` | Actor IDs, weights, paths, judge cfg | — | — |
| `types.ts` | Shared data model | — | — |

**Isolation contract:** each module is replaceable behind its types. The `Judge` interface (`score()`, `draft()`) is the key seam — `claude-cli` is the only v1 implementation, but an `embeddings` or `ollama` backend can be added in Phase 2 without touching `discover`, `score`, or `review`.

---

## 5. Data model (`src/types.ts`)

```ts
type Platform = "x" | "linkedin";
type SubjectType = "blog" | "github";

interface Subject {
  id: string; type: SubjectType; url: string;
  title: string; description: string;
  keywords: string[];                 // distinctive terms
  queries: Record<Platform, string>;  // editable per-platform search query
}

interface Candidate {
  platform: Platform; url: string;
  author: string; authorFollowers?: number;
  text: string;
  likes: number; replies: number; reposts: number;
  views?: number;                     // X (xquik) only
  createdAt: string;                  // ISO 8601
}

interface ScoredCandidate extends Candidate {
  relevance: number;        // 0–100 (judge)
  rationale: string;        // one-line judge reason
  engagementScore: number;  // 0–1
  recencyScore: number;     // 0–1
  score: number;            // 0–1 blended
  draft?: string;           // comment (top-N only)
}

interface LedgerEntry {
  ts: string; subjectId: string; platform: Platform;
  url: string; comment: string; status: "posted";
}
```

---

## 6. Discovery

Both actors are run via `apify-client`; its `actor(id).call(input)` starts the run, waits for completion, and returns the run — then `dataset(run.defaultDatasetId).listItems()` returns the items. (This wraps the verified async start → poll → fetch-dataset flow; runs routinely exceed the 5-min sync limit.)

**X — `apidojo/tweet-scraper`** input:
```jsonc
{ "searchTerms": ["<subject.queries.x> since:<today-14d>"],
  "sort": "Latest", "maxItems": 50 }
```
Date is appended as a `since:` operator because the verified caveat is that date filtering works on the `searchTerms` path (not with `twitterHandles`).

**LinkedIn — `harvestapi/linkedin-post-search`** input:
```jsonc
{ "searchQueries": ["<subject.queries.linkedin>"],
  "postedLimit": "month", "sortBy": "relevance", "maxPosts": 50 }
```

**Normalization** maps each actor's output to `Candidate` defensively (actor field names drift — use optional chaining + fallbacks). X has no `views`; xquik (alt) does. After normalization, drop any candidate whose `url` is already in the ledger.

---

## 7. Judge (`claude -p`)

- Invocation: `claude -p --output-format json --model <judge.model>`, prompt delivered via **stdin** (avoids arg-length limits). Uses the local Claude Code subscription — **no API tokens**.
- **Two phases** (matches the `Judge` interface):
  1. `score(subject, candidates)` — one call, all candidates → JSON array `[{ index, relevance: 0–100, rationale }]`.
  2. `draft(subject, topN)` — one call, only the top-N after blending → JSON array `[{ index, comment }]`.
- **Output contract:** parse the `claude -p` JSON envelope, take `.result`, strip ``` fences, `JSON.parse`, validate with **zod**. On invalid JSON: one retry with a stricter "return ONLY a JSON array" instruction; then fail the run with a clear error.
- **Drafting guidance baked into the prompt:** lead with a concrete technical point from the subject; the link is secondary; ≤280 chars for X, longer for LinkedIn; no boilerplate; one comment per candidate. Drafts are starting points the human edits.

---

## 8. Scoring (`src/score/`)

```
engagement = normalize(  log1p(likes + 2·replies + reposts)  )   // min-max across batch; replies weighted ↑
recency    = exp( -ageDays / halfLife )                          // halfLife = 7d
score      = w.relevance·(relevance/100) + w.engagement·engagement + w.recency·recency
```
Defaults `w = {relevance .6, engagement .25, recency .15}`. Drop `score < minScore (0.45)`, sort desc, keep `topN (15)`. Replies weighted double — an active thread is worth more than a popular-but-dead one.

---

## 9. Review gate (`data/review-queue.csv`)

`judge` appends one row per surfaced candidate. Columns:

`run_id, subject_id, platform, score, relevance, engagement, recency, author, followers, created_at, url, post_text, draft_comment, decision, final_comment`

- `post_text` truncated (~280 chars) for readability.
- **Human edits two columns:** `decision` ∈ {`approve`, `reject`, *(blank = pending)*} and optionally `final_comment` (blank ⇒ use `draft_comment`).
- Open in Excel/Numbers/Sheets. CSV chosen over Sheet/Notion for v1: zero setup, offline, git-diffable, trivially scriptable.

`record` reads rows with `decision = approve`, takes `final_comment || draft_comment`, appends to the ledger (deduped by URL), and prints a posting checklist (URL + comment) for you to post by hand. Idempotent — re-running never double-records.

---

## 10. Action ledger (`data/actions.log.jsonl`)

Append-only JSONL, one `LedgerEntry` per posted comment. Two jobs: **idempotency** (re-running `record` skips URLs already present) and **dedup at discovery** (already-actioned URLs are filtered out of new candidate batches, so you never re-surface a post you've engaged). This is what makes the tool safely repeatable across many subjects and re-runs.

---

## 11. Configuration & environment

- `.env`: `APIFY_TOKEN` (required). Optional: `JUDGE_MODEL` (default `sonnet`), `JUDGE_TIMEOUT_MS`. Loaded via `process.loadEnvFile` (Node ≥ 20.12) — no `dotenv` dependency.
- `src/config.ts`: actor IDs + caps, scoring weights, recency half-life, `minScore`, `topN`, search windows, judge config, file paths.
- Tooling: TypeScript + `tsx` (no build step for dev); `npm run typecheck` / `build` available.

---

## 12. Safety & ToS posture

- **Discovery is cookie-free + read-only** (apidojo, HarvestAPI) → your personal accounts are never in scope. Scraping still breaches platform ToS in principle; volume is tiny and read-only, the defensible end of the spectrum.
- **Mandatory human gate**; **manual, human-paced posting** (a few thoughtful comments/day, not bursts). Matches X's ban on automated/keyword-triggered engagement.
- **AI drafts, human edits** — add a genuine technical point, lead with value not the link, never mass-post near-identical comments (platform + FTC pressure on AI endorsements).
- Don't republish scraped datasets; store only what's needed. *Not legal advice.*

---

## 13. Success criteria (acceptance)

From a clean checkout with only `APIFY_TOKEN` set and `claude` logged in:

1. `npm run add-subject -- --repo ivan-magda/wwdc26-notes` writes a sensible `subjects/wwdc26-notes.json` (keywords from topics + README, non-empty queries).
2. `npm run add-subject -- --blog ../blog/src/data/blog/wwdc26-foundation-models-year-two.md` writes a subject from frontmatter.
3. `npm run discover -- --subject wwdc26-notes` produces a normalized candidates file with real X + LinkedIn posts.
4. `npm run judge -- --run latest` produces a ranked `review-queue.csv` with relevance scores, rationales, and usable drafts — using **no API key**.
5. After hand-approving rows, `npm run record` appends to the ledger and prints a posting checklist; re-running produces no duplicates.
6. A second `discover` run never re-surfaces an already-recorded URL.

---

## 14. Phase 2 (documented, not built)

- **GitHub Actions**: discovery on blog-publish (push to posts path) + weekly cron, uploading a candidates artifact you judge locally.
- **Judge fallbacks**: `embeddings` (local MiniLM, ranking only) and/or `ollama` (local LLM, judge+draft) backends behind the existing `Judge` interface — for unattended/CI runs.
- **X reply-thread enrichment** (`apidojo` sibling / replies scraper) to find the liveliest sub-conversations under a high-signal tweet.
- **Alt actors as config flips**: `xquik/x-tweet-scraper` ($0.15/1k, exposes `views`); `scary_good_apis` LinkedIn fallback.

---

## 15. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Apify actor field-name drift | Defensive normalization (optional chaining + key fallbacks); a 10-item smoke test before trusting a run |
| `claude -p` returns non-JSON | zod validation + one stricter-prompt retry, then explicit failure |
| Claude subscription usage limits | Two calls/run, top-N drafting only; surfaced as a clear error if rate-limited |
| Weak/auto-generated queries | Queries live in the editable subject JSON; tune by hand |
| Actor pricing/rating changes | Pricing verified 2026-06-13; re-verify before budget commits (see research doc) |
| Cost creep | `maxItems` caps (50/platform/run); pay-per-result; est. ~$5–15/mo |

---

## 16. Open questions

- Default search window per platform (X 14d / LinkedIn `month`) — confirm after first real runs.
- Whether to also pull X reply threads in v1 or defer (currently deferred to Phase 2).
- Whether `record` should rewrite the CSV to mark recorded rows, or rely solely on ledger dedup (currently: ledger dedup only).
