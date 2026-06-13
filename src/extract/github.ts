import type { Subject } from "../types.js";
import { buildQueries } from "./index.js";
import { asString, asStringArray, dedupe, STOPWORDS } from "./text.js";

const GITHUB_API = "https://api.github.com";
const HEADERS = {
  "User-Agent": "blog-amplifier",
  Accept: "application/vnd.github+json",
};

interface RepoResponse {
  name?: unknown;
  description?: unknown;
  topics?: unknown;
  html_url?: unknown;
}

/**
 * Build a `Subject` from a GitHub repo (`owner/name`) via the public REST API.
 *
 * Topics are often sparse (e.g. `ivan-magda/wwdc26-notes` only has `wwdc26`),
 * so we also mine the description and README headings for distinctive phrases.
 * README fetching is best-effort — a missing/unreadable README is non-fatal.
 */
export async function fromGitHubRepo(repo: string): Promise<Subject> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(
      `GitHub repo lookup failed for "${repo}": ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as RepoResponse;

  const name = asString(data.name) || repo.split("/").pop() || repo;
  const description = asString(data.description);
  const topics = asStringArray(data.topics);
  const htmlUrl = asString(data.html_url) || `https://github.com/${repo}`;

  const readme = await fetchReadme(repo);
  const headingKeywords = mineKeywords(readmeHeadings(readme), description);
  const nameWords = name
    .split(/[-_]+/)
    .map((w) => w.trim())
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()));

  const keywords = dedupe([...topics, ...nameWords, ...headingKeywords]);

  return {
    id: name,
    type: "github",
    url: htmlUrl,
    title: name,
    description,
    keywords,
    queries: buildQueries(keywords, topics),
  };
}

/** Fetch the raw README text. Best-effort: returns "" on any failure. */
async function fetchReadme(repo: string): Promise<string> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/readme`, {
      headers: { ...HEADERS, Accept: "application/vnd.github.raw" },
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

/** Extract markdown heading texts (lines starting with one or more `#`). */
function readmeHeadings(readme: string): string[] {
  if (!readme) return [];
  const headings: string[] = [];
  for (const line of readme.split(/\r?\n/)) {
    const m = /^#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (m && m[1]) headings.push(m[1]);
  }
  return headings;
}

/**
 * Mine 3-8 distinctive keyword phrases from README headings + the description.
 * Prefers multi-word phrases (heading text minus stopwords, capped at three
 * words), backfilling with distinctive single words. Generic words are dropped.
 */
function mineKeywords(headings: string[], description: string): string[] {
  const phrases: string[] = [];
  const singles: string[] = [];

  const sources = [...headings, description].filter(Boolean);
  for (const source of sources) {
    const words = significantWords(source);
    if (words.length >= 2) {
      phrases.push(words.slice(0, 3).join(" "));
    } else if (words.length === 1 && words[0]) {
      singles.push(words[0]);
    }
  }

  return dedupe([...phrases, ...singles]).slice(0, 8);
}

/** Words from `text` with possessives, markdown punctuation and stopwords stripped. */
function significantWords(text: string): string[] {
  return text
    .replace(/['’]s\b/gi, "") // possessive 's -> drop (so "Apple's" -> "Apple", "What's" -> "What")
    .replace(/['’]/g, "") // stray apostrophes
    .replace(/[`*_~()[\]{}#>|]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w.toLowerCase()));
}

