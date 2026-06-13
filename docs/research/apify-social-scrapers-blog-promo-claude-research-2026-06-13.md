# Discovery & Relevance-Scoring Toolkit for an Apple-AI / Swift Blogger: Apify Actors, Alternatives, and a Sub-$50/Month Pipeline

## TL;DR
- **For X/Twitter discovery, use `apidojo/tweet-scraper` ("Tweet Scraper V2," $0.40/1,000 tweets, no login/cookies, full text + engagement metrics); for LinkedIn discovery use `harvestapi/linkedin-post-search` ($2/1,000 posts, no cookies, true keyword search).** Both run on the maintainer's own managed infrastructure, so your personal X and LinkedIn accounts are never touched — your single most important requirement.
- **Relevance scoring is trivially cheap and easily fits the budget.** Embed your blog post + each candidate post with OpenAI `text-embedding-3-small` ($0.02 per 1M tokens) or, for $0 and zero ToS exposure, the local `all-MiniLM-L6-v2` sentence-transformer. At your volume (3–5 posts/month × 20–50 candidates × 2 platforms) embedding cost is a fraction of a cent per month. Rank with a hybrid score = weighted semantic similarity + normalized engagement + recency decay.
- **Total realistic spend: roughly $5–15/month of Apify usage + ~$0 embeddings = comfortably under $50.** The whole pipeline can be triggered from GitHub Actions on blog publish, orchestrated in Python or Node, and the discovery-only, manual-outreach design keeps you on the lowest-risk side of both platforms' ToS.

## Key Findings

1. **The official X API is no longer a realistic option for a solo dev.** On February 6, 2026, X replaced its tiered model with pay-per-use as the default ($0.005 per post read, capped at 2 million reads/month), closed Basic/Pro to new signups, and the free tier (~1,500 reads) has no usable search. (An April 20, 2026 update cut "owned reads" to $0.001 and raised standard writes to $0.015.) Third-party scrapers and resale APIs are now the only affordable discovery route.
2. **Apify Store hosts 30,000+ actors; the X/Twitter category is crowded but a few mature actors dominate.** `apidojo/tweet-scraper` is the most-used X actor (live listing ~61K total users, ~4.1★, 177 reviews, issues response ~12 hours, "Maintained by Community"), supports full advanced-search syntax, requires no cookies, and returns all fields needed for scoring.
3. **LinkedIn is the hard problem.** LinkedIn aggressively litigates scrapers (Proxycurl shut down July 4, 2025; ProAPIs sued late 2025). The safe path is a **no-cookie, managed-infrastructure** keyword post-search actor. HarvestAPI and apimaestro both offer these; they never ask for your `li_at` session cookie.
4. **Relevance scoring is a solved, cheap problem at this volume.** Both OpenAI embeddings and free local sentence-transformers produce cosine-similarity scores that work well for short social text. Engagement and recency are simple normalizations layered on top.
5. **snscrape is effectively unreliable for X in 2025–2026**; the official free tier won't do search; `twitterapi.io` ($0.15/1k) and `GetXAPI` ($0.05/1k) are the strongest non-Apify discovery alternatives.
6. **Your manual-outreach design materially lowers risk.** You are not auto-posting, auto-liking, auto-DMing or running fake engagement — the behaviors X and LinkedIn most aggressively ban. You read public data and decide by hand where to join.

## Details

### Section 1 — Twitter/X scraping via Apify (discovery focus)

The X scraper market on Apify clusters around a handful of serious actors plus many cheap clones. Evaluated leaders:

**`apidojo/tweet-scraper` — "🏯 Tweet Scraper V2"** (https://apify.com/apidojo/tweet-scraper)
- **Maintainer:** API Dojo (community-maintained, not official Apify). Live Store listing: ~4.1★ (177 reviews), ~61K total users, ~5.9K monthly active, issues response ~12 hours, last modified within hours — actively maintained. (Cached snapshots vary 44K–61K users and 3.6–4.4★, so cite the live figure at run time.)
- **Search modes:** keyword, hashtag, full Twitter advanced-search syntax, user timeline, list, URL. Filters: `tweetLanguage`, `minimumRetweets`, `minimumFavorites`, `minimumReplies`, date range (`start`/`end`), verified-only, media-only, `author`, `mentioning`, geo.
- **Auth/account safety:** **No login, cookies, or auth tokens required for search.** The full input schema contains no auth/cookie/token field; it runs on the actor's own infrastructure ("No Proxy Required ✔️"). Your personal account is never involved. This is the decisive feature.
- **Output (JSON/CSV/Excel):** `text`, `author.userName` (handle), `url` (tweet URL), `replyCount`, `likeCount`, `retweetCount`, `quoteCount`, `bookmarkCount`, `createdAt` (timestamp), `lang`, author metadata (followers, verification). Note: **no view/impression count** is documented in the output schema.
- **Pricing:** **$0.40 per 1,000 tweets**, pay-per-result. Vendor states verbatim: "At $0.40 per 1000 tweets, and 30-80 tweets per second, it is ideal for researchers, entrepreneurs, and businesses!" (treat the speed claim as marketing).
- **Constraint:** **minimum 50 tweets per query.** For fewer/single tweets use the sibling.
- **ToS/stability:** scrapes directly (not the official API). Vendor notes Twitter "may change search behavior… at any time," and shadow-banned tweets may be missing.

**`apidojo/twitter-scraper-lite` — "Scraper Unlimited"** (https://apify.com/apidojo/twitter-scraper-lite)
- Same developer, same output schema and no-cookie model. **Event-based pricing**: ~$0.016 per standard query (first ~40 tweets included), then ~$0.0004–$0.002 per item by batch tier; single-tweet query $0.05. **No 50-tweet minimum.** ~4.4★, ~23K users. Best when you want small, precise pulls (e.g., exactly 20–50 results per keyword) — which fits your target of 20–50 posts/topic better than the 50-minimum main actor.

**Other credible options:** `xtdata/twitter-x-scraper`, `watcher.data/search-x-by-keywords`, `altimis/scweet` ($0.20/1k, deduplicated billing, "no cookies"), `mikolabs/x-twitter-advanced-search-tweet-scraper`. Several ultra-cheap clones advertise $0.15–0.25/1k (kaitoeasyapi, Xquik) but have shorter track records.

**Account-ban risk:** As long as you use a managed-infrastructure actor that requires no login (apidojo, scweet, xtdata), there is **no exposure to your personal X account** — you never hand over credentials or cookies. The risk shifts to the actor operator's proxy pool. Avoid any X actor whose input schema asks for `authTokens`/`auth_token`/`ct0` cookies (e.g., `epctex/twitter-search-scraper` explicitly requires "your own Twitter/X authentication tokens") — those can implicate whatever account the tokens belong to.

### Section 2 — LinkedIn scraping via Apify (discovery focus)

LinkedIn post *search* (by keyword/topic, not just a known profile) is the exact capability you need, and only a few actors do it cookie-free.

**`harvestapi/linkedin-post-search` — "Linkedin Post Search Scraper (No Cookies)"** (https://apify.com/harvestapi/linkedin-post-search)
- **$2 per 1,000 posts.** No cookies/account required; runs on HarvestAPI's managed infrastructure.
- Input: list of search queries (Boolean operators supported, 85-char LinkedIn limit). Filters: `postedLimit`/`postedLimitDate` (1h–year), `sortBy` (`relevance` or `date`), `maxPosts`, optional author-company filters. Optional comment/reaction scraping (billed separately).
- Output: post content, author details, reactions, comments count, media, post URL, timestamp. Fresh data, no caching.
- HarvestAPI publishes its actors as open source on GitHub (`HarvestAPI/apify-linkedin-post-search`). This is the **recommended LinkedIn actor** — cheapest of the keyword-search options and transparent.

**`apimaestro/linkedin-posts-search-scraper-no-cookies` — "Posts Search Scraper for LinkedIn | No Cookies"** (https://apify.com/apimaestro/linkedin-posts-search-scraper-no-cookies)
- **$5 per 1,000 results.** 4.5★ (24 reviews), ~7K users, last modified ~2 months ago. No login required.
- Keyword search with `relevance` (default) or `date_posted` sort; can filter by author company URNs / industry URNs (e.g., Software Development industry, or Apple/Microsoft company URNs). Returns post content, reactions, comments count, author, media. Engagement counts are "as-rendered" and can lag.

**Why these two:** They are the only widely-used actors that combine (a) true keyword post *search* (not just scraping a profile you already know) with (b) no-cookie, managed infrastructure. Profile-post actors (`harvestapi/linkedin-profile-posts`, `apimaestro/linkedin-profile-posts`, both $2/1k) are excellent but require you to already know whose posts to pull — useful as a *second pass* once your scoring surfaces specific high-signal authors (e.g., Apple-Intelligence developers you want to track).

**Hard rule:** **Never use a LinkedIn actor that requires your `li_at` session cookie.** Cookie-based actors carry direct account-restriction/ban risk; Apify community guidance is explicit: "Stop using primary accounts; prefer dedicated test accounts." Since both recommended actors are cookie-free, you avoid this entirely.

### Section 3 — Comparison and relevance-scoring architecture

**Side-by-side (top 3 X, top 3 LinkedIn):**

| Actor | Platform | $/1k | Cookies? | Keyword search | Freshness | ToS risk | Integration |
|---|---|---|---|---|---|---|---|
| apidojo/tweet-scraper | X | $0.40 | No | Full advanced syntax | Real-time | Medium | Excellent (API/SDK) |
| apidojo/twitter-scraper-lite | X | ~$0.016/query | No | Full syntax, no min | Real-time | Medium | Excellent |
| altimis/scweet | X | $0.20 | No | Keyword/geo/date | Real-time | Medium | Good |
| harvestapi/linkedin-post-search | LinkedIn | $2 | No | Boolean keyword | Real-time | Medium-High | Excellent |
| apimaestro/linkedin-posts-search-no-cookies | LinkedIn | $5 | No | Keyword + URN filters | Near-real-time (lag) | Medium-High | Good |
| harvestapi/linkedin-profile-posts | LinkedIn | $2 | No | Profile-only (no keyword) | Real-time | Medium | Excellent |

X ToS risk is "medium" because X's ToS prohibit scraping but you touch no account; LinkedIn is "medium-high" because LinkedIn litigates aggressively even though you're cookie-free and read-only.

**Relevance-scoring approach (the core of your workflow):**

*(a) Embedding-based semantic similarity — recommended primary signal.* Embed your blog post's title+topic+key paragraphs into one vector `B`; embed each candidate post into vector `P_i`; score with cosine similarity. Recommended models:
- **OpenAI `text-embedding-3-small`** — $0.02 per 1M tokens (Batch API $0.01), 1536-dim, 8,191-token context. The default cost/performance choice.
- **`text-embedding-3-large`** ($0.13/1M) or Cohere Embed — higher precision, unnecessary at your scale.
- **`sentence-transformers/all-MiniLM-L6-v2`** — free, local, 384-dim, ~80MB, ~22.7M params, ~14,000 sentences/sec on CPU, outputs L2-normalized vectors so dot product = cosine. Zero API cost and zero data leaves your machine. Hugging Face reports 200M+ downloads/month, making it the de-facto default for this task.

*(b) Keyword / BM25 overlap — cheap secondary signal.* Compute lexical overlap of your tracked terms (`Foundation Models`, `LanguageModelSession`, `@Generable`, `PrivateCloudComputeLanguageModel`, `Private Cloud Compute`, `#WWDC26`, etc.) against each post to catch exact-term matches embeddings might under-weight in a jargon-heavy niche.

*(c) Hybrid score — recommended final rank:*

```
score_i = w_sem · sim_i
        + w_eng · norm(log1p(likes_i + 2·replies_i + retweets_i))
        + w_rec · exp(-Δdays_i / τ)
```

Recommended starting weights `w_sem=0.6, w_eng=0.25, w_rec=0.15`, with recency half-life `τ ≈ 7 days`. Replies are weighted higher than likes because they signal an active conversation worth joining. `norm()` is min-max scaling across the candidate batch.

**Cost confirmation:** A blog post (~1,500 tokens) + 100 candidate posts (~80 tokens each ≈ 8,000 tokens) ≈ ~10K tokens per run. Five runs/month × 2 platforms ≈ 100K tokens/month. At `text-embedding-3-small`'s $0.02/1M that is **~$0.002/month** — effectively free. With local MiniLM it is exactly $0. Either way, embeddings are a rounding error against the $50 budget.

### Section 4 — End-to-end pipeline (discovery + scoring, NO auto-posting)

**Recommended architecture:**
1. **Trigger:** Blog post published → commit/CI event fires a **GitHub Actions** workflow (`on: push` to your posts directory, or `workflow_dispatch`).
2. **Extract topic/keywords:** Parse the new post's title, tags, and body; build (i) a query string of your tracked keywords/hashtags and (ii) the blog embedding `B`.
3. **Discover:** Call Apify actors via REST (`run-sync-get-dataset-items`, max 300s) or the official `apify-client` (Python/Node) — `apidojo/twitter-scraper-lite` (or `apidojo/tweet-scraper`) for X and `harvestapi/linkedin-post-search` for LinkedIn. Cap with `maxItems`/`maxPosts` at ~50/platform.
4. **Collect:** Read items from each run's default dataset (JSON).
5. **Score:** Embed candidates, compute the hybrid score above, sort descending.
6. **Output a ranked shortlist:** Write CSV/JSON artifact (GitHub Actions artifact), append to a Notion database, or a Google Sheet. You review and decide where to comment manually.

**Most useful Apify features for this:** **Schedules** (cron alternative to GitHub Actions); **Webhooks** (`ACTOR.RUN.SUCCEEDED` → your endpoint, payload carries `defaultDatasetId`); **Storage datasets** (clean JSON/CSV via `/v2/datasets/{id}/items`); **Actor-to-Actor integrations / chaining** (run scraper → run a scoring actor); native **Notion, Google Sheets, Make, n8n, Zapier** integrations and a maintained **n8n Apify node** (`@apify/n8n-nodes-apify`). For your case, GitHub Actions calling `apify-client` directly is simplest and keeps orchestration in your repo. (Note: Apify named storages persist indefinitely; **unnamed default storages expire after 7 days** — name your dataset if you want history.)

**Existing open-source references implementing "find related social posts → rank/score":**
- `M4n1shG/semantic-relevance` (https://github.com/M4n1shG/semantic-relevance) — Node, local `all-MiniLM-L6-v2` via `@xenova/transformers`, composite score Relevance 45% + Recency 35% + Engagement 20%, with decay-based novelty tracking. **Closest match to your need** — you can adopt its weighting scheme directly.
- `sankalp1999/semantweet-search` (https://github.com/sankalp1999/semantweet-search) — Python, OpenAI embeddings + LanceDB, pre-filter by likes/retweets/time then semantic search.
- `dbasch/semantic-search-tweets` (https://github.com/dbasch/semantic-search-tweets) — Python semantic queries over tweet history.

### Section 5 — Non-Apify alternatives (discovery half)

- **`twitterapi.io`** (https://twitterapi.io) — $0.15/1,000 tweets, pay-as-you-go, no X developer account, advanced-search endpoint, $1 trial credit, real-time. Strong, cheap, reliable; not affiliated with X (ToS risk similar to scraping).
- **`GetXAPI`** (https://www.getxapi.com) — per its pricing page, "$0.05 per 1,000 tweets ($0.001 per call, ~20 tweets per call)… 100x cheaper" than the official API; new accounts get "$0.10 in credits (~2,000 tweets)." Cheapest mainstream X data, but younger than twitterapi.io.
- **Official X API v2** — pay-per-use $0.005/read since Feb 2026; Basic/Pro closed to new signups; free tier ~1,500 reads, **no search**. Compliant but expensive and search-limited. Avoid for discovery.
- **snscrape** (https://github.com/JustAnotherArchivist/snscrape) — free/open source but **degraded and frequently broken** against X since the 2023 API changes; login walls block it. Not reliable for production in 2025–2026.
- **Tweepy + official API** — only as good as your tier; free tier can't search other users' content (403 "you currently have access to a subset of… endpoints"). Not viable for discovery.
- **Bright Data LinkedIn datasets** (https://brightdata.com/products/datasets/linkedin/posts) — ToS-cautious, public-data, from ~$250/100K records ($0.0025/record). **Over budget and over-volume** for a solo blogger; pre-collected snapshots also aren't fresh keyword search. (Bright Data survived Meta/X scraping suits, so it's the most legally defensible LinkedIn route if you ever scale.)
- **Phantombuster** — LinkedIn Phantoms typically run via **your cookies** (account risk) at ~80 profiles/day; pricing ~$56–128/mo. **Avoid** — violates your account-protection requirement.
- **ScraperAPI / Oxylabs / ScrapeGraphAI** — generic scraping infra; you'd build and maintain the LinkedIn/X logic yourself. More work, more fragility.

**Ranked top 3 non-Apify discovery approaches:**
1. **twitterapi.io (X)** — cheap, reliable, no account, easy REST. Con: third-party ToS gray area.
2. **GetXAPI (X)** — cheapest per tweet, but younger/less proven.
3. **Bright Data (LinkedIn, only if you ever need bulk)** — most compliant LinkedIn route, but cost/volume mismatch for your use case.

For your specific niche and budget, **Apify actors beat all of these on convenience** (managed infra, schedules, webhooks, datasets, no account risk) while staying cheap.

### Section 6 — Legal & ethical considerations (2025–2026)

- **X:** Updated ToS (effective Sept 29, 2023) expressly prohibit "crawling or scraping the Services in any form, for any purpose without our prior written consent," and removed the old robots.txt allowance. In 2025 X added developer-agreement language barring use of its data to train AI models. X has sued scrapers (John Doe defendants, 2023; Bright Data). **Risk profile: medium** — scraping breaches ToS, but enforcement against a low-volume reader who never posts automatically and never touches an account is minimal; the main exposure sits with the actor operator.
- **LinkedIn:** The richest but most aggressively defended platform. *hiQ v. LinkedIn* (9th Cir. 2022; settled Nov 2022) held that scraping public data isn't a CFAA violation **but that hiQ breached LinkedIn's User Agreement** — public-data access is defensible, contractual breach is not. LinkedIn then prevailed against **Proxycurl** (suit filed Jan 24, 2025, N.D. Cal. Case No. 3:25-cv-00828, alleging "hundreds of thousands of fake accounts" scraping "millions of LinkedIn member profiles"; Proxycurl shut down permanently July 4, 2025, after ~$10M ARR) and sued **ProAPIs** (late 2025). LinkedIn also unilaterally removed Apollo.io's and Seamless.ai's company pages. **Risk profile: medium-high** — but the targets are commercial resale operations running fake accounts at scale, not a solo blogger reading public posts for manual outreach.
- **Why your design is low-risk:** You are **not** auto-commenting, auto-liking, auto-DMing, or running coordinated/fake engagement — exactly the behaviors X's and LinkedIn's 2026 automation rules ban and detect. You're scoring public posts to decide, by hand, where to join conversations. Use cookie-free managed actors, keep volume tiny, don't republish scraped datasets, respect GDPR/CCPA for any personal data, and don't store more than you need. This is not legal advice.

## Quick Start

**Best Apify actor per platform + sample input config:**

**X — `apidojo/twitter-scraper-lite`** (event-based, no 50-tweet minimum — ideal for 20–50 results/topic):
```json
{
  "searchTerms": [
    "(\"Foundation Models\" OR LanguageModelSession OR #FoundationModels) lang:en",
    "(\"Apple Intelligence\" OR \"Private Cloud Compute\" OR #WWDC26) (Swift OR on-device) lang:en"
  ],
  "sort": "Latest",
  "maxItems": 50,
  "minimumFavorites": 2
}
```
*(If you prefer pay-per-result and don't mind the 50-tweet floor, swap to `apidojo/tweet-scraper` with the same `searchTerms`.)*

**LinkedIn — `harvestapi/linkedin-post-search`:**
```json
{
  "queries": [
    "Apple Foundation Models",
    "on-device LLM Apple Intelligence",
    "Private Cloud Compute iOS 27"
  ],
  "sortBy": "relevance",
  "postedLimit": "month",
  "maxPosts": 50
}
```

**Relevance-scoring snippet (Python, free local embeddings — drop-in):**
```python
import math, datetime as dt
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer("all-MiniLM-L6-v2")  # free, local, 384-dim

def hybrid_rank(blog_text, posts, w_sem=0.6, w_eng=0.25, w_rec=0.15, tau=7.0):
    """posts: list of dicts with keys text, likes, replies, retweets, created_at (datetime), url"""
    blog_vec = model.encode(blog_text, convert_to_tensor=True, normalize_embeddings=True)
    texts = [p["text"] for p in posts]
    vecs = model.encode(texts, convert_to_tensor=True, normalize_embeddings=True)
    sims = util.cos_sim(blog_vec, vecs)[0].tolist()      # cosine similarity, 0..1

    raw_eng = [math.log1p(p.get("likes",0) + 2*p.get("replies",0) + p.get("retweets",0)) for p in posts]
    e_min, e_max = min(raw_eng), max(raw_eng) or 1
    now = dt.datetime.now(dt.timezone.utc)

    ranked = []
    for p, sim, eng in zip(posts, sims, raw_eng):
        eng_n = (eng - e_min) / (e_max - e_min) if e_max > e_min else 0.0
        age_days = (now - p["created_at"]).total_seconds() / 86400.0
        rec = math.exp(-age_days / tau)                  # recency decay, half-life ~tau
        score = w_sem*sim + w_eng*eng_n + w_rec*rec
        ranked.append({**p, "sim": round(sim,3), "score": round(score,3)})
    return sorted(ranked, key=lambda x: x["score"], reverse=True)

# shortlist = hybrid_rank(my_blog_markdown, candidate_posts)[:25]
```
To switch to OpenAI embeddings, replace the two `model.encode(...)` calls with `client.embeddings.create(model="text-embedding-3-small", input=...)` and cosine over the returned vectors — still effectively free at your volume.

**Apify call (Python `apify-client`):**
```python
from apify_client import ApifyClient
client = ApifyClient("APIFY_TOKEN")
run = client.actor("apidojo/twitter-scraper-lite").call(run_input={...})
posts = list(client.dataset(run["defaultDatasetId"]).iterate_items())
```

## Recommendations

**Stage 1 — Stand up the minimum pipeline (week 1).**
- Create a free Apify account ($5/month credits, no card).
- Wire `apidojo/twitter-scraper-lite` (X) and `harvestapi/linkedin-post-search` (LinkedIn) via `apify-client`. Cap `maxItems`/`maxPosts` at 50 per keyword set per platform.
- Score with **local `all-MiniLM-L6-v2`** first (zero cost, zero data egress). Use the hybrid formula with `w_sem=0.6, w_eng=0.25, w_rec=0.15`, `τ=7d`.
- Output ranked CSV as a GitHub Actions artifact.

**Stage 2 — Trigger on publish (week 2).** Add a GitHub Actions workflow on push to your posts folder that runs the script and posts the shortlist to Notion or a Sheet.

**Stage 3 — Tune (ongoing).** If MiniLM relevance feels weak on jargon-heavy Apple/Swift terms, switch the embedding call to OpenAI `text-embedding-3-small` (still ~free). Add a keyword/BM25 boost for exact terms like `LanguageModelSession`, `@Generable`, `PrivateCloudComputeLanguageModel`.

**Benchmarks that would change the plan:**
- If a recommended actor's rating drops, it goes >2–3 months without updates, or runs start failing → switch to the sibling/alternative (`apidojo/tweet-scraper`; `apimaestro/...` for LinkedIn).
- If Apify spend approaches ~$25/month → you're scraping far more than 50 posts/run; tighten `maxItems` or move X discovery to `twitterapi.io`.
- If embedding volume ever exceeds ~5M tokens/month → revisit batch pricing (still pennies).

## Caveats
- **Actor details drift.** Apify actors are updated/deprecated frequently and user/rating counts vary between cached snapshots (apidojo/tweet-scraper showed 44K–61K users and 3.6–4.4★ across sources). Pricing, ratings, and "last modified" were verified against the live Store in June 2026 — re-check each actor's Pricing and Input tabs and do a 10–20 item test run before any production run.
- **Vendor marketing.** Throughput claims ("30–80 tweets/sec") and "100% reliability" are self-reported; the apidojo page itself disclaims that recorded metrics may not reflect reality. No independent uptime data exists.
- **No view-count field** is documented for the apidojo X output — engagement scoring should rely on likes/replies/retweets.
- **LinkedIn coverage is partial.** Cookie-free actors only see publicly visible posts and "as-rendered" engagement counts that can lag real numbers.
- **ToS remains gray.** Scraping breaches both platforms' terms regardless of tool; the recommendations minimize but do not eliminate legal/enforcement risk.
- **The X official free tier genuinely cannot do search** — don't burn time trying to make Tweepy/free-tier work for discovery.