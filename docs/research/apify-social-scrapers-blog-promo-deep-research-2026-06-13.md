# Apify Actors for Topic-Specific Post Discovery & Commenting — Verified Deep-Research Report

> **Method:** Fan-out web search across 6 angles → 29 sources fetched → 138 falsifiable claims extracted → 25 high-value claims adversarially verified (3-vote, 2/3 to kill) → 21 confirmed, 4 refuted.
> **Date verified:** 2026-06-13. **Scope:** updates and corrects the two prior pre-research reports in this folder (`*-claude-research-*`, `*-perplexity-research-*`).
> **Confidence legend:** ✅ confirmed 3-0 · ☑️ confirmed 2-1 · ❌ refuted.

---

## 0. What changed vs. your two pre-research reports (read this first)

You already have two solid pre-research reports. This pass **independently verified the load-bearing facts** and found four claims in the prior reports that are wrong or unsafe to build on:

| Prior-report claim | Verified verdict | What to do instead |
|---|---|---|
| **`hamdo/twitter-automation-api`** is a viable semi-auto reply tool (Perplexity report §1) | ❌ **DEPRECATED** — Apify shows two "Deprecated" badges + "See alternative Actors", 1 review, ~29 users, last updated ~4 months ago. Requires uploading your `ct0`+`auth_token` cookies. | Do **not** wire it in. Treat X commenting as **manual / human-posted**. |
| **`scary_good_apis/linkedin-search-posts`** is a strong *no-cookie* LinkedIn alternative (both reports) | ❌ Its **no-cookie / account-safety claim was refuted** (1-2). Also it's the priciest at **$3.55/1k** and lowest-rated (1.00/5). | Demote to last-resort fallback behind HarvestAPI. Don't rely on it for account safety. |
| **`GetXAPI create-tweet`** can post tweets/replies/threads for automated commenting | ❌ **Posting capability refuted** (1-2). Auth is still cookie-based (`auth_token`). | Don't rely on it for reliable automated posting. |
| Chain actors by passing `${resource.defaultDatasetId}` in the webhook payload → `Actor.openDataset(id)` downstream (implied in Claude report's "actor-to-actor chaining") | ❌ **Refuted 0-3** — that exact template-variable wiring is not the documented mechanism. | Webhook chaining via `ACTOR.RUN.SUCCEEDED` works, but **verify the real payload variables** before relying on them. Simplest: orchestrate in your own code, don't chain actors. |

What the prior reports got **right** and this pass **confirms**: apidojo Tweet Scraper V2 and HarvestAPI LinkedIn Post Search are the correct primary discovery actors; xquik is a valid cheaper X alternative; scrapers expose engagement *thresholds* but **not semantic relevance** (you must score topic-relevance yourself); the embedding-based hybrid ranking design is sound; cookie-free managed actors keep your personal accounts out of scope for *discovery*.

**The single most important architectural finding:** **discovery and commenting are separate problems.** Every reliable actor found is **read-only**. Every *write* path found is unofficial, cookie-based, ToS-risky, and in one case already deprecated. So the correct design is **human-in-the-loop**: automate discovery → scoring → draft generation, then a human reviews and **posts manually**. Don't build auto-posting.

---

## 1. Recommended discovery actors (verified pricing & capabilities)

### Twitter/X — primary: `apidojo/tweet-scraper` ("Tweet Scraper V2") ✅
- **Price:** from **$0.40 / 1,000 tweets**, pay-per-result; "price gets lower the higher subscription plan you have" (a mirror shows ~$0.30/1k at higher tiers). Source: <https://apify.com/apidojo/tweet-scraper>.
- **Search:** full X advanced-search operators — `searchTerms` (keywords/hashtags), `twitterHandles` + `from:`, `mentioning`/`@user`, `start`/`end` date fields plus inline `since:YYYY-MM-DD until:YYYY-MM-DD`, and engagement floors `minimumRetweets` / `minimumFavorites` / `minimumReplies`.
- **Read-only & a hard limit:** verbatim — *"Single tweet fetching and conversation scraping are not allowed on this actor."* (For reply-thread mining of a found tweet, you'd need the sibling *Twitter Scraper Unlimited*.)
- **⚠️ Verified caveat:** date filtering works on the **search path** (`searchTerms`) but **not** when combined with `twitterHandles` (that returns a raw user timeline). For recency control, **use advanced-search syntax**, not the handle path.
- **No view-count field** in output — engagement scoring relies on likes / replies / retweets / quotes.

### Twitter/X — cheaper alternative: `xquik/x-tweet-scraper` ☑️
- **Price:** **$0.15 / 1,000 results**, pay-per-result, "No subscriptions, no hidden fees." Source: <https://apify.com/xquik/x-tweet-scraper>.
- **Richer output:** returns `likeCount / retweetCount / replyCount / quoteCount / **viewCount** / bookmarkCount` plus `author{followers, verified}` — **notably the `viewCount` that apidojo lacks**, useful for engagement-rate ranking. Supports `since:`/`until:` and `lang` (ISO 639-1).
- **Trust trade-off:** rating **3.70/5 (~1,310 users)** vs apidojo's larger, higher-trust base. The marketed "50+ filters" is puffery (page contradicts itself 40+ vs 50+), but every concrete operator maps to a real native X operator.
- **Verdict:** use apidojo as default; switch to xquik if you want view counts or to cut X cost ~60%.

### LinkedIn — primary: `harvestapi/linkedin-post-search` ✅
- **No cookies / no account — the decisive safety feature:** verbatim *"No cookies or account required: Access profile data without sharing cookies or risking account restrictions."* Repo: `HarvestAPI/apify-linkedin-post-search`. Source: <https://apify.com/harvestapi/linkedin-post-search>.
- **Price:** **from $1.50 / 1,000 posts** (page) — **$2/1k is the base** headline rate (GitHub/API title), "from $1.50" is the volume-discounted floor. Pay-per-event: *"not charged for the Apify platform usage, but only a fixed price for specific events."*
- **Search (input schema, verified):** `searchQueries` ("same query as you would use in the LinkedIn search bar", 85-char limit), `postedLimit` ∈ {any, 1h, 24h, week, month, 3months, 6months, year}, `sortBy` ∈ {relevance, date}, plus author/company/industry filters (`authorUrls`, `authorKeywords`, `authorsCompanies`, `mentioningCompany`, `authorsIndustryId`).
- **Read-only:** *"This is a read-only search and scraping tool, not for posting or automation."* The whole HarvestAPI suite (post-comments, reactions, profile-comments) is GET/scrape-only — the "Post comments" endpoint *reads* existing comments.

### LinkedIn — last-resort fallback only: `scary_good_apis/linkedin-search-posts` ✅price / ❌safety
- **Price:** **$0.0035/post + $0.05/run** → 1,000 posts = **$3.55**; failed/empty searches free. Source: <https://apify.com/scary_good_apis/linkedin-search-posts>.
- **Why fallback only:** its **no-cookie/account-safety claim was refuted**, it's ~2× HarvestAPI's price, and it's the lowest-rated. Keep it as a price-comparison data point, not a recommendation.

---

## 2. Commenting / posting — there is no safe, reliable, fully-automated actor

| Actor | Capability | Auth | Price | Status | Verdict |
|---|---|---|---|---|---|
| `hamdo/twitter-automation-api` | post, reply, like (≤5), retweet (≤5) | **your `ct0` + `auth_token` cookies** (only option) | $15/1k events | ❌ **DEPRECATED**, 1 review | Avoid |
| `getxapi/create-tweet` | claims post/reply/thread | **`auth_token` cookie** | — | ❌ posting capability **refuted** | Avoid |
| HarvestAPI suite / scary_good_apis (LinkedIn) | — | — | — | **read-only** | Cannot post at all |

**Consequences for the design:**
1. **X commenting:** the only paths are cookie-injection, unofficial, and violate the spirit of X's ToS — *"Anyone with your cookies can access your account."* Suspension risk is real regardless of actor. → **post manually**, or at most paste an approved draft yourself.
2. **LinkedIn commenting:** **no Apify actor can post comments.** Every option is read-only. → LinkedIn commenting is **100% manual** in this workflow. (PhantomBuster-style tools exist but run on *your* session cookie with documented restriction rates — out of scope for an account-safe design.)
3. Therefore the pipeline's last automated step is **"draft + queue for review."** Posting is human.

---

## 3. Relevance / recency / engagement ranking (you must compute relevance yourself)

Scrapers give you **engagement thresholds** (`minimumFavorites`, etc.) and **engagement counts** — but **not topic relevance**. Compute relevance downstream:

**Hybrid score (per candidate):**
```
score = w_sem · semantic_similarity(blog, post)      # cosine of embeddings
      + w_eng · norm(log1p(likes + 2·replies + reposts))  # replies weighted ↑ (active convo)
      + w_rec · exp(-age_days / τ)                    # recency decay, τ ≈ 7d
```
Starting weights `w_sem=0.6, w_eng=0.25, w_rec=0.15`. `norm()` = min-max across the batch.

- **Embeddings:** OpenAI `text-embedding-3-small` ($0.02/1M tokens) or **local `all-MiniLM-L6-v2`** (free, zero data egress). At your volume (3–5 posts/mo × ~50 candidates × 2 platforms) embedding cost is a fraction of a cent — effectively free either way.
- **Keyword/BM25 boost** for jargon the embedding may under-weight: `Foundation Models`, `LanguageModelSession`, `@Generable`, `Private Cloud Compute`, `Dynamic Profiles`, `#WWDC26`. (Pull these straight from your post `tags` + `title` + `description`.)
- **Build the blog vector** from `title + description + first N paragraphs`.

---

## 4. Recommended project structure (refined)

Your proposed `actors/twitter-searcher/` + `actors/linkedin-searcher/` implied *building your own Apify actors*. **You don't need to** — you call existing Store actors. So replace those with thin **client wrappers**, add a **scoring** module, a **human-review queue**, and an **append-only action log** (for idempotency — never comment on the same URL twice):

```
blog-amplifier/
├── posts/                      # one file per blog post you're amplifying
│   └── <slug>.json             #   {slug, url, title, tags, description, queries:{x,linkedin}}
├── src/
│   ├── config.js               # actor IDs, scoring weights, thresholds, caps (maxItems)
│   ├── extract.js              # blog frontmatter (tags+title+description) → per-platform queries
│   ├── discover/
│   │   ├── apify.js            # apify-client wrapper: start run → poll → fetch dataset items
│   │   ├── twitter.js          # build apidojo/xquik input, normalize → common schema
│   │   └── linkedin.js         # build harvestapi input, normalize → common schema
│   ├── score.js                # hybrid relevance+recency+engagement ranking
│   ├── draft.js                # Claude API: draft a value-add comment per top-N candidate
│   ├── review.js               # write ranked shortlist + drafts to review-queue.csv
│   └── log.js                  # append-only ledger; dedup by post URL (idempotency)
├── data/
│   ├── candidates/             # raw scraped datasets, timestamped per run
│   ├── review-queue.csv        # the HUMAN GATE (status: pending|approved|rejected|posted)
│   └── actions.log.jsonl       # {platform, url, timestamp, comment, result}
├── scripts/
│   └── run-discovery.js        # CLI: extract → discover → score → draft → queue
├── .github/workflows/
│   └── amplify.yml             # trigger on publish + weekly re-scan
├── .env.example                # APIFY_TOKEN, ANTHROPIC_API_KEY  (+ OPENAI_API_KEY if used)
├── package.json
└── README.md
```

**Why this shape:** discovery (`src/discover/`) is fully automatable and uses managed cookie-free actors → safe. Scoring/draft are local and cheap. `review.js` is the firewall between automation and your accounts. `log.js` makes the tool **reusable for any post or GitHub repo** and **idempotent** — re-running never double-comments. To reuse for a repo, just drop a `posts/<repo>.json` with that repo's keywords; nothing else changes.

---

## 5. End-to-end pipeline (verified orchestration mechanics)

```
Blog post published  (push to blog repo src/data/blog/**)
  │
  ├─[TRIGGER]  GitHub Actions: on push to posts path  OR  workflow_dispatch
  │            + a weekly Schedule (Apify cron or GH cron) to re-scan older posts
  │            → conversations keep appearing after publish day
  │
  ├─[EXTRACT]  Parse frontmatter: tags + title + description → query strings
  │            X:  ("Foundation Models" OR LanguageModelSession OR #WWDC26) lang:en
  │            LI: "Apple Foundation Models on-device LLM"   (≤85 chars)
  │
  ├─[DISCOVER] ASYNC (scraping runs routinely exceed 5 min):
  │   POST https://api.apify.com/v2/actors/<ACTOR_ID>/runs?token=$APIFY_TOKEN
  │        body = actor input JSON;  query params = memory/build/timeout/maxItems
  │   then EITHER poll  GET .../actor-runs/<id>  every ~5s until SUCCEEDED|FAILED
  │        OR     webhook ACTOR.RUN.SUCCEEDED → your endpoint
  │   then        GET https://api.apify.com/v2/datasets/<id>/items  → JSON items[]
  │   (use the official `apify-client` — Python v3.0.2 / Node — not hand-rolled HTTP)
  │
  ├─[NORMALIZE] Map both platforms to one schema:
  │   {platform, url, author, followers, text, likes, replies, reposts, views?, createdAt}
  │
  ├─[SCORE]    Hybrid rank (§3); drop below threshold; keep top-N per platform
  │
  ├─[DRAFT]    Claude API → one value-add comment per candidate, referencing your post
  │            (technical insight first, link second; ≤280 chars X / longer LI)
  │
  ├─[REVIEW]   Write shortlist+drafts → review-queue.csv  (status=pending)
  │
  ├═[HUMAN GATE]  You edit / approve / reject.  ← automation STOPS here
  │
  ├─[POST]     MANUAL in X / LinkedIn UI (safest).  No auto-posting actor is safe.
  │
  └─[LOG]      Append to actions.log.jsonl; dedup by URL so you never repeat a comment
```

### Per-step: trigger · tool · data-passing (verified)

| Step | Trigger | Tool | Data in → out |
|---|---|---|---|
| Trigger | push to `src/data/blog/**` / `workflow_dispatch` / weekly cron | GitHub Actions; Apify **Schedules** for re-scans | git event → run |
| Extract | — | `extract.js` (gray-matter) | frontmatter → query strings + blog text |
| Discover | — | **`apify-client`** (official, Python v3.0.2 / Node) | input JSON → **dataset `items[]`** via async start-poll/webhook + dataset-items GET |
| Score | — | `score.js` + embeddings (MiniLM local or `text-embedding-3-small`) | items → ranked shortlist |
| Draft | — | **Claude API** (`claude-opus-4-8` / `claude-sonnet-4-6`) | post + candidate → comment text |
| Review | — | CSV / Google Sheet / Notion | drafts → human-approved rows |
| Post | — | **manual** (you, in the platform UI) | approved row → live comment |
| Log | — | `log.js` (JSONL) | result → ledger (idempotency) |

**Data-passing rule (verified):** runs ≤5 min *may* use the sync endpoint (`run-sync-get-dataset-items`, HTTP 408 after 300s); scraping runs typically exceed that, so **use async** (start → poll `GET` run until `SUCCEEDED`/`FAILED`, or `ACTOR.RUN.SUCCEEDED` webhook), then `GET /v2/datasets/<id>/items`. **Do not** rely on actor-to-actor chaining via `${resource.defaultDatasetId}` (refuted) — orchestrate in your own code and pass dataset items through local files (`data/candidates/`).

---

## 6. Cost estimate (well under budget)

| Item | Volume (3–5 posts/mo) | Unit | Monthly |
|---|---|---|---|
| X discovery (apidojo) | ~250–500 tweets/run | $0.40/1k | ~$0.10–0.40/run |
| X discovery (xquik alt) | same | $0.15/1k | ~$0.04–0.15/run |
| LinkedIn (HarvestAPI) | ~150–250 posts/run | $1.50–2/1k | ~$0.30–0.50/run |
| Embeddings | ~100k tokens/mo | $0.02/1M (or $0 local) | ~$0 |
| Comment drafts | ~50–100 short gens/mo | Claude API | a few cents |

**Total realistic Apify spend ≈ $5–15/mo** — comfortably under $50. The Apify free tier ($5 credit/mo, no card) covers early testing. ⚠️ **Free-tier pricing trap (from prior reports, still true):** some actors bill far higher on the free tier than the advertised rate — verify the live price on your plan before a production run.

---

## 7. ToS & account-safety guidance

- **Discovery = low risk to *you*.** All recommended discovery actors run on managed/residential infra and require **no login or cookies** → your personal X/LinkedIn accounts are never in scope. Scraping still breaches both platforms' ToS in principle, but enforcement targets large-scale resale operations, not a low-volume reader.
- **LinkedIn litigates aggressively** (hiQ; Proxycurl shut down; Nubela/ProAPIs suits) — but the targets ran fake accounts at scale. Cookie-free, read-only, low-volume discovery for manual outreach is the defensible end of the spectrum. Don't republish scraped datasets; respect GDPR/CCPA; store only what you need.
- **Commenting = where the real account risk lives.** Every write path is cookie-based and unofficial; X explicitly bans keyword-triggered auto-replies and automated engagement. **Keep posting manual and human-paced** (a few thoughtful comments/day, not a burst). This also produces better comments.
- **AI-comment authenticity & disclosure:** platforms and the FTC are tightening on AI-generated endorsements. Use AI to *draft*, always edit to add a genuine technical point, lead with value (not the link), and don't mass-produce near-identical comments. The human gate is both a safety control and a quality control.
- *Not legal advice.*

---

## 8. Open questions (from verification — worth a follow-up before building the "post" step)

1. **Is there any currently-maintained actor (or non-Apify tool) for posting replies/comments** to X and LinkedIn, given hamdo is deprecated and GetXAPI's posting is unverified — and what are real-world cookie-auth ban rates?
2. **What are the actual webhook payload template variables** for passing an upstream dataset ID downstream (the `${resource.defaultDatasetId}` recipe was refuted)?
3. **Is there a sanctioned API path** (X API v2 paid write tiers, LinkedIn partner APIs) for compliant comment posting that avoids cookie injection, and how does its cost compare?
4. **For LinkedIn specifically — must commenting be entirely manual?** (Current finding: yes; every LinkedIn actor found is read-only.)

---

## Appendix — primary sources (verified)

- apidojo Tweet Scraper V2 — <https://apify.com/apidojo/tweet-scraper>
- xquik X Tweet Scraper — <https://apify.com/xquik/x-tweet-scraper> · repo <https://github.com/Xquik-dev/x-twitter-scraper>
- HarvestAPI LinkedIn Post Search — <https://apify.com/harvestapi/linkedin-post-search> · repo <https://github.com/HarvestAPI/apify-linkedin-post-search>
- scary_good_apis LinkedIn Search Posts — <https://apify.com/scary_good_apis/linkedin-search-posts>
- hamdo Twitter Automation (DEPRECATED) — <https://apify.com/hamdo/twitter-automation-api>
- GetXAPI Create Tweet — <https://apify.com/getxapi/create-tweet>
- Run actor & retrieve data via API — <https://docs.apify.com/academy/api/run-actor-and-retrieve-data-via-api>
- Run Actor (POST) — <https://docs.apify.com/api/v2/act-runs-post> · Dataset items (GET) — <https://docs.apify.com/api/v2/dataset-items-get>
- Webhooks & events — <https://docs.apify.com/platform/integrations/webhooks> · <https://docs.apify.com/platform/integrations/webhooks/events>
- apify-client Python — <https://github.com/apify/apify-client-python> · <https://pypi.org/project/apify-client>
