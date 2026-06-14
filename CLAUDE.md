# blog-amplifier

CLI that finds existing X/LinkedIn conversations about a blog post or repo, ranks them, drafts comments, and routes them through a human-review gate. Posting is always manual.

- Using/driving the CLI -> the packed skill at `.claude/skills/blog-amplifier/`.
- Design rationale + acceptance criteria -> `docs/PRD.md`. Scraper research -> `docs/research/`.

## Commands

- Typecheck: `npm run typecheck`. Tests: `npm test` (`node --import tsx --test`).
- Run the CLI in dev: `tsx src/cli.ts <command>`.
- Validate a ranking/precision change with a live before/after -> `scripts/eval-precision.ts` (`EVAL_CANDS` / `EVAL_GOLD` / `EVAL_SUBJECT`).
- Recover candidates from an aborted/partial Apify run (discover refuses non-`SUCCEEDED`) without re-paying -> `scripts/recover-run.ts <runId> <subjectId>`.

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
- Owner exclusion: `subject.ownerHandles` makes `discover` drop the owner's own posts (normalized + token-subset match, cross-platform); X also takes `-from:` in `queries.x`. `config.dedupeByAuthor` (default on) caps one row per author in the top-N. Both live in discover/score because the judge prompt never includes the author — never try to filter self/duplicate authors in the judge.

## Gotchas

- Apify `client.actor(id).call()` resolves even for FAILED/ABORTED/TIMED-OUT runs; check `run.status` (done in `src/discover/apify.ts`).
- `xquik` on the FREE plan ABORTS large X runs (seen ~460 of a 500-item run, ~284 persisted); keep `maxItems` modest and recover the partial dataset with `scripts/recover-run.ts` instead of re-scraping.
- The judge batches one `claude -p` per ~25 candidates (one call over ~100 times out) via `Promise.allSettled` (a failed chunk doesn't wipe the run) but with NO concurrency cap: ~1000 candidates spawn ~40 parallel `claude -p`, and a failed chunk silently scores its candidates 0 (the all-failed warning fires only if EVERY chunk fails). At scale keep `maxItems` modest or judge platforms separately.
