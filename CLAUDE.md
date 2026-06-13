# blog-amplifier

CLI that finds existing X/LinkedIn conversations about a blog post or repo, ranks them, drafts comments, and routes them through a human-review gate. Posting is always manual.

- Using/driving the CLI -> the packed skill at `.claude/skills/blog-amplifier/`.
- Design rationale + acceptance criteria -> `docs/PRD.md`. Scraper research -> `docs/research/`.

## Commands

- Typecheck: `npm run typecheck`. Tests: `npm test` (`node --import tsx --test`).
- Run the CLI in dev: `tsx src/cli.ts <command>`.
- Validate a ranking/precision change with a live before/after -> `scripts/eval-precision.ts` (`EVAL_CANDS` / `EVAL_GOLD` / `EVAL_SUBJECT`).

## Hard constraints (violating these is a real bug, not a style choice)

- Free Apify plan only. X actor is `xquik/x-tweet-scraper`; do NOT switch to `apidojo/tweet-scraper`, which blocks free-plan API access.
- No metered LLM API. The judge shells out to local `claude -p`; never add `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` or an SDK call.
- Posting is always manual; never add an auto-poster. No safe cookie-free write path exists.

## Conventions & seams

- Node >= 20.12, TypeScript ESM (strict). Relative imports use `.js` extensions (NodeNext) even though sources are `.ts`.
- Actor ids, scoring weights, paths, and judge model/timeout are centralized in `src/config.ts`; change them there, not inline.
- Extend scoring/drafting through the `Judge` interface (`src/judge`); `embeddings`/`ollama` are Phase-2 drop-ins behind it, not edits to `claude-cli`.
- Topic specificity lives only in `subjects/<id>.json` (`focus`/`notSubject`); keep extract/judge/score topic-agnostic — no subject/topic string literals in code (a hardcoded title-phrase list was a real bug).
- `focus`/`notSubject` make the judge emit an optional `topicClass`; the relevance gate (`config.gate`, default `drop_off_topic`) keys off it and is a no-op when absent, so subjects without disambiguation rank exactly as before. Keep `topicClass` optional on `RelevanceResult` (Phase-2 seam).

## Gotchas

- Apify `client.actor(id).call()` resolves even for FAILED/ABORTED/TIMED-OUT runs; check `run.status` (done in `src/discover/apify.ts`).
- The judge must batch: one `claude -p` over ~100 candidates times out. Batches use `Promise.allSettled` so one failed call does not wipe the run.
