# blog-amplifier

Find existing X/Twitter and LinkedIn conversations about your blog post or GitHub repo, rank them, draft a comment for each, and review the queue before you post by hand.

## Why it works this way

Scrapers read public posts without a login. Automated posting needs your account cookies and breaks platform rules. This tool automates the safe half (find, rank, draft) and leaves posting to you:

- **Read-only discovery.** Apify actors (xquik for X, HarvestAPI for LinkedIn) fetch public posts with no login and no cookies. Your accounts stay out of it.
- **A human gate.** The judge writes each candidate to `data/review-queue.csv`. Nothing moves forward until you set the `decision` column yourself.
- **Manual posting.** `record` prints a checklist. You post the approved comments at your own pace.
- **An idempotent ledger.** `data/actions.log.jsonl` records what you posted. Re-running `record` never double-records, and the next `discover` skips URLs you already engaged.

## Requirements

- Node 20.12 or newer. The CLI loads `.env` with `process.loadEnvFile`, so there is no `dotenv` dependency.
- An Apify token, from https://console.apify.com/account/integrations.
- The `claude` CLI, installed and logged in. The judge runs `claude -p` against your Claude Code subscription, so no metered API key is involved.

## Setup

```sh
npm install
cp .env.example .env      # then set APIFY_TOKEN
claude                    # then run /login once, to authenticate the judge
```

Two optional judge overrides go in `.env`: `JUDGE_MODEL` (default `sonnet`) and `JUDGE_TIMEOUT_MS` (default `180000`).

## Quick start

Promote a GitHub repo across both platforms:

```sh
npm run add-subject -- --repo acme/widget-cli
npm run subjects                              # confirm the subject id
npm run pipeline -- --subject widget-cli      # discover + judge
# open data/review-queue.csv and set `decision` to approve or reject
npm run record                                # prints what to post
```

Promote a blog post on X only:

```sh
npm run add-subject -- --blog ../blog/posts/rate-limiting-explained.md
npm run pipeline -- --subject rate-limiting-explained --platform x
# review data/review-queue.csv, then:
npm run record
```

Put flags after `--` when you run an npm script. To call the CLI directly, drop the `--`: `tsx src/cli.ts pipeline --subject widget-cli`.

## Commands

| Command | What it does |
|---|---|
| `add-subject --blog <path>` or `--repo <owner/name>` | Read metadata and write `subjects/<id>.json`. |
| `subjects` | List saved subject ids. |
| `discover --subject <id> [--platform x\|linkedin\|both]` | Run the actors, drop URLs you already actioned, and write `data/candidates/<id>-<ts>.candidates.json`. Default platform is both. |
| `judge --run <id\|latest\|path>` | Score relevance, draft comments, write `data/queue/<id>-<ts>.scored.json`, and append rows to `data/review-queue.csv`. |
| `record` | Read the approved rows, append them to the ledger, and print a manual posting checklist. |
| `pipeline --subject <id> [--platform ...]` | Run `discover` then `judge` in one step. |

For usage text, run `tsx src/cli.ts help` (there is no `npm run help` script).

Which calls cost money: `discover` and `pipeline` spend Apify credits. `judge` uses your `claude` subscription and touches no paid API, so re-running it against saved candidates costs nothing. `add-subject`, `subjects`, and `record` make no paid calls.

## The review gate

`judge` writes one row per candidate to `data/review-queue.csv`. Open it in a spreadsheet or editor and set two columns:

- `decision`: `approve`, `reject`, or blank for pending.
- `final_comment`: optional. Leave it blank to use the AI `draft_comment`.

`record` then reads the `approve` rows, takes `final_comment` or falls back to `draft_comment`, appends each to the ledger, and prints the comments for you to post by hand.

## How ranking works

```
score = 0.6 · (relevance / 100) + 0.25 · engagement + 0.15 · recency
```

Relevance is the judge's 0-to-100 verdict. Engagement is a batch-normalized `log1p(likes + 2·replies + reposts)`. Recency decays on a 7-day half-life. Rows below `minScore` (0.45) drop out, and the judge keeps the top 15. The weights live in `src/config.ts`.

## Tuning a subject

`add-subject` writes a starting query, but you will get better results by editing `subjects/<id>.json`. Each subject holds a per-platform query under `queries`:

```json
"queries": {
  "x": "(\"rate limiting\" OR \"token bucket\") lang:en",
  "linkedin": "rate limiting token bucket api"
}
```

Write multi-word topics as quoted phrases. On X an unquoted hyphen means exclusion, so `rate-limiting` searches for `rate` and *not* `limiting`. Keep `lang:en` on the X query. After editing, re-run `discover`; there is no need to re-run `add-subject`. A subject with zero keywords is rejected, because an empty query would scan every recent post and burn credits.

## Data layout

```
subjects/<id>.json                          the subject you edit (keywords, per-platform queries)
data/candidates/<id>-<ts>.candidates.json   normalized candidates from one discover run
data/queue/<id>-<ts>.scored.json            ranked candidates with drafts
data/review-queue.csv                       the human gate you edit
data/actions.log.jsonl                      append-only ledger for idempotency and dedup
```

## Apify on the free plan

The defaults run on Apify's free plan:

- X uses `xquik/x-tweet-scraper`, about $0.15 per 1,000 results. On a paid plan you can swap it for `apidojo/tweet-scraper` in `src/config.ts`, which returns the same output fields. That actor blocks free-plan API access, so leave the default in place while you are on free.
- LinkedIn uses `harvestapi/linkedin-post-search`, from about $1.50 per 1,000 results, with no cookies or account.

Both search a window of roughly one week. Store prices drift, so check the live rate before a large run and try a scoped `--platform x` run first to gauge credit use.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `judge: WARNING — scored 0 of N candidates` | Every `claude` batch failed, so nothing was scored (not the same as finding no relevant posts). Confirm `claude` is logged in, raise `JUDGE_TIMEOUT_MS` if the error mentions a timeout, then re-run `judge --run latest`, which spends no Apify credits. |
| `APIFY_TOKEN is not set` | Set it in `.env`. |
| `Failed to spawn claude` | Install the `claude` CLI and run `/login`. |
| `record` reports no approved rows | Set `decision` to `approve` in the CSV first. |

## Using this with Claude Code

A packed skill lives at `.claude/skills/blog-amplifier/`. Open this repo in Claude Code and it loads the skill, so the agent knows the workflow and the query gotchas without rereading the source.
