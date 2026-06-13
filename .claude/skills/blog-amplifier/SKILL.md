---
name: blog-amplifier
description: Use when promoting a blog post or GitHub repo by finding and joining existing X/Twitter or LinkedIn conversations with this repo's CLI — running add-subject, discover, judge, pipeline, or record; editing a subject's search query in subjects/<id>.json; or troubleshooting an empty review queue, a "scored 0 of N candidates" warning, Apify free-plan limits, or the claude -p judge.
---

# blog-amplifier

## Overview

A CLI that **finds** existing X/Twitter + LinkedIn conversations about a subject you want to promote (a blog post or a GitHub repo), **ranks** them, **drafts** a value-adding comment for each with AI, and routes everything through a **human-review gate** before you post **by hand**.

**Core principle:** discovery and posting are separate problems. Discovery is read-only and cookie-free (Apify actors, no social login). The tool **never posts** — it prints a checklist and you post manually, at a human pace.

## When to use

- You published a blog post or repo and want to join real conversations about it.
- You're editing a subject's keywords/search query, or re-running discovery.
- You hit an error: empty review queue, `scored 0 of N candidates`, an Apify pricing/plan issue, or the `claude` judge failing.

Not for: auto-posting (doesn't exist by design), or scraping someone's private/cookie'd timeline.

## Invoking commands

Run via npm scripts **with `--` before flags**, or call `tsx` directly (no `--`):

```sh
npm run pipeline -- --subject wwdc26-notes --platform x   # npm form needs --
tsx src/cli.ts pipeline --subject wwdc26-notes --platform x  # direct form
```

⚠️ **There is no `npm run help` script.** For usage, run `tsx src/cli.ts help` or the CLI with no command. Only these have npm scripts: add-subject, subjects, discover, judge, record, pipeline.

## Prerequisites

- Node ≥ 20.12, `npm install`.
- `cp .env.example .env` and set `APIFY_TOKEN` (console.apify.com/account/integrations).
- The `claude` CLI **installed and logged in** (`claude` then `/login`) — the judge shells out to `claude -p` using your Claude Code **subscription, not a metered API key**. No `ANTHROPIC_API_KEY` anywhere. Optional: `JUDGE_MODEL` (default `sonnet`), `JUDGE_TIMEOUT_MS` (default 180000).

## The pipeline (run in order)

1. `add-subject --blog <path>` or `--repo <owner/name>` → writes `subjects/<id>.json`. Idempotent. The `<id>` is the blog's frontmatter slug (or filename) / the repo name — run `subjects` to see the exact id.
2. *(optional)* hand-tune `subjects/<id>.json` — see **Tuning the query** below.
3. `discover --subject <id> [--platform x|linkedin|both]` → runs the actors, drops already-actioned + duplicate URLs, writes `data/candidates/<id>-<ts>.candidates.json`. Default platform: both.
4. `judge --run <id|latest|path>` → AI relevance score + draft, writes `data/queue/<id>-<ts>.scored.json` and **appends rows to `data/review-queue.csv`**.
5. **HUMAN GATE (manual, mandatory):** open `data/review-queue.csv`, set the `decision` column to `approve`/`reject` (blank = pending). Optionally fill `final_comment` to override the AI `draft_comment`.
6. `record` → reads the `approve` rows, appends to the ledger, and prints a **"POST THESE MANUALLY"** checklist. You post each comment yourself.

`pipeline --subject <id> [--platform ...]` does steps 3+4 in one go. Then you still do 5 and 6.

## Commands & cost

| Command | Does | Cost |
|---|---|---|
| `add-subject --blog <path>` / `--repo <owner/name>` | metadata → `subjects/<id>.json` | GitHub API (free) |
| `subjects` | list saved subject ids | free / local |
| `discover --subject <id> [--platform ...]` | run actors → candidates JSON | ⚠️ **spends Apify credits** |
| `judge --run <id\|latest\|path>` | score + draft → review-queue.csv | `claude` subscription (no Apify, no API key) |
| `pipeline --subject <id> [--platform ...]` | discover + judge | ⚠️ Apify credits + `claude` |
| `record` | approved rows → ledger + manual checklist | free / local |

`--run latest` = newest candidates file; `<id>` = newest for that subject; or pass an explicit path. **Re-running `judge` reuses the saved candidates and spends no Apify credits.**

## Tuning the query (the load-bearing gotcha)

A subject's per-platform search lives in `subjects/<id>.json` under `queries.x` / `queries.linkedin`. It's passed nearly verbatim to the actor (`discover` appends only ` since:<date>`).

**On X, an unquoted hyphen is the exclusion operator** — `foundation-models` searches `foundation AND NOT models`. Always write multi-word topics as **quoted phrases**:

```json
"queries": {
  "x": "(\"foundation models\" OR \"on-device\") lang:en",
  "linkedin": "foundation models on-device apple"
}
```

Keep `lang:en`. Bare ambiguous words over-match (e.g. `swift` matches Taylor Swift) — add context terms. After editing, just re-run `discover` (or `pipeline`) — no need to re-run `add-subject`. `discover` **refuses a subject with zero keywords** (an unbounded query would waste credits).

## Free Apify plan

- X uses `xquik/x-tweet-scraper` — chosen because it runs on the **free plan**. **Do NOT swap to `apidojo/tweet-scraper`** (config.ts) while on free: it blocks free-plan API access. Same output fields, so it's a paid-plan-only swap.
- LinkedIn uses `harvestapi/linkedin-post-search` (no cookies/account). If staying strictly on free credits, prefer `--platform x`.
- Re-verify live Store pricing before committing budget — prices drift. Discovery is billed per result; do a tightly-scoped `--platform x` run before a full `both` run to gauge credit use.

## Troubleshooting

| Symptom | Meaning / fix |
|---|---|
| `judge: WARNING — scored 0 of N candidates` | The judge **failed** — every `claude` batch errored. **NOT** "no relevant conversations." Look for `judge: scoring chunk X–Y failed … <reason>` lines printed above it. Usually `claude` isn't logged in (`claude` → `/login`) or timed out (`terminated by signal … (timeout …)` → raise `JUDGE_TIMEOUT_MS`, e.g. `300000`). Then re-run `judge --run latest` (no Apify cost). The `N` is candidate count, not the top-15 cap. |
| Review queue empty after judge | Same cause as above, or all rows scored below `minScore` (0.45). Check the per-chunk error lines printed above the warning. |
| `APIFY_TOKEN is not set` | Set it in `.env` (step in Prerequisites). |
| `Failed to spawn claude` / non-zero exit | The `claude` CLI isn't installed or logged in. |
| `npm run help` → "Missing script" | Expected — use `tsx src/cli.ts help`. |
| `record` says "No approved rows" | You haven't set `decision` to `approve` in the CSV yet (step 5). |

## Common mistakes

- Forgetting `--` before flags with `npm run`.
- Expecting the tool to post — it never does; posting is step 6, by hand.
- Skipping the CSV gate (step 5) — `judge` surfacing rows is not approval.
- Writing slug-style hyphenated topics into `queries.x` (silently excludes terms).
- Reading `scored 0` as "nothing relevant" instead of "the judge broke."
