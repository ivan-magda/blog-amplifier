# blog-amplifier

A command-line tool that finds existing conversations on **X/Twitter** and **LinkedIn** about something you want to promote — a **blog post** or a **GitHub repo** — ranks them by relevance, engagement, and recency, drafts a value-adding comment for each with AI, and routes everything through a human-review gate before you post **manually**.

It is built on one principle: discovery and commenting are separate problems. Every reliable scraper is read-only; every automated write path is cookie-based and ToS-risky. So this tool automates discovery → scoring → drafting and leaves posting to a human.

## Safety model

- **Read-only, cookie-free discovery.** Discovery runs through Apify actors (apidojo for X, HarvestAPI for LinkedIn) that need no login and no cookies. Your personal accounts are never handed to any tool.
- **Mandatory human review.** Every surfaced candidate lands in `data/review-queue.csv`. Nothing proceeds until you set the `decision` column by hand.
- **Manual posting.** The tool never posts. `record` prints a checklist; you post the approved comments yourself, at a human pace.
- **Ledger idempotency.** Every recorded action is appended to `data/actions.log.jsonl`. Re-running `record` never double-records, and a later `discover` run never re-surfaces a URL you have already engaged.

## Prerequisites

- **Node >= 20.12** (uses `process.loadEnvFile`, no `dotenv` dependency).
- `npm install`.
- `cp .env.example .env` and set `APIFY_TOKEN` (from https://console.apify.com/account/integrations).
- The `claude` CLI installed and logged in (`claude`, then `/login`). The judge shells out to `claude -p` and uses your local Claude Code subscription — **no metered API key**. Optional `.env` overrides: `JUDGE_MODEL` (default `sonnet`), `JUDGE_TIMEOUT_MS`.

## Commands

Run via the npm scripts (note the `--` before flags) or directly with `tsx src/cli.ts <command>`.

| Command | What it does |
|---|---|
| `add-subject --blog <path>` / `--repo <owner/name>` | Extract metadata → `subjects/<id>.json` |
| `subjects` | List saved subject ids |
| `discover --subject <id> [--platform x\|linkedin\|both]` | Discover, drop already-actioned URLs → `data/candidates/<id>-<ts>.candidates.json` |
| `judge --run <id\|latest\|path>` | Relevance-score + draft → `data/queue/<id>-<ts>.scored.json` + append to `review-queue.csv` |
| `record` | Read approved rows → append to ledger; print manual posting checklist |
| `pipeline --subject <id> [--platform ...]` | `discover` + `judge` in one step |
| `help` | Show usage |

### Example: a GitHub repo

```sh
npm run add-subject -- --repo ivan-magda/wwdc26-notes
npm run subjects
npm run discover -- --subject wwdc26-notes            # both platforms
npm run judge -- --run latest
# ...edit data/review-queue.csv: set `decision` to approve/reject...
npm run record
```

### Example: a blog post

```sh
npm run add-subject -- --blog ../blog/src/data/blog/wwdc26-foundation-models-year-two.md
npm run pipeline -- --subject wwdc26-foundation-models-year-two --platform x
# ...review data/review-queue.csv...
npm run record
```

## Data layout

```
subjects/<id>.json                       editable Subject (id, keywords, per-platform queries)
data/candidates/<id>-<ts>.candidates.json normalized Candidate[] from a discover run
data/queue/<id>-<ts>.scored.json          ranked ScoredCandidate[] with drafts
data/review-queue.csv                      THE HUMAN GATE — you edit this
data/actions.log.jsonl                     append-only ledger (idempotency + dedup)
```

## Where review happens

`judge` appends one row per surfaced candidate to `data/review-queue.csv`. Open it in Excel/Numbers/Sheets and edit two columns:

- `decision` — `approve`, `reject`, or blank (pending).
- `final_comment` — optional; blank means use the AI `draft_comment`.

`record` then reads the `approve` rows, takes `final_comment || draft_comment`, appends to the ledger, and prints what to post by hand.

## How scoring works

`score = 0.6·(relevance/100) + 0.25·engagement + 0.15·recency` — relevance is the judge's 0–100 verdict, engagement is a batch-normalized `log1p(likes + 2·replies + reposts)`, and recency decays with a 7-day half-life; rows below `minScore` are dropped and the top 15 are kept (all tunable in `src/config.ts`).

## More

Full design and acceptance criteria: [docs/PRD.md](docs/PRD.md).

**Phase 2 (documented, not built):** GitHub Actions for discovery on blog-publish and a weekly cron, plus `embeddings`/`ollama` judge backends behind the existing `Judge` interface for unattended runs.
