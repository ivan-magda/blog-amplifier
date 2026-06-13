import { spawn } from "node:child_process";
import { z, type ZodType } from "zod";
import { config } from "../config.js";
import type { Subject, Candidate, RelevanceResult, DraftResult } from "../types.js";
import type { Judge } from "./index.js";

/** Zod shape for the `score()` JSON array the model must return. */
const relevanceArraySchema = z.array(
  z.object({
    index: z.number().int(),
    relevance: z.number(),
    rationale: z.string(),
  }),
);

/** Zod shape for the `draft()` JSON array the model must return. */
const draftArraySchema = z.array(
  z.object({
    index: z.number().int(),
    comment: z.string(),
  }),
);

/**
 * v1 Judge backend: shells out to the local Claude Code CLI (`claude -p`),
 * which uses the user's subscription — no API token is involved. Two calls per
 * run (score, then draft top-N), each delivered over stdin to dodge
 * arg-length limits, parsed from the `--output-format json` envelope, and
 * validated with zod (one stricter-prompt retry on invalid JSON, per PRD §7).
 */
export class ClaudeCliJudge implements Judge {
  async score(subject: Subject, candidates: Candidate[]): Promise<RelevanceResult[]> {
    if (candidates.length === 0) return [];

    // Score in parallel batches: one `claude -p` call per ~25 candidates keeps
    // each call's output small and fast (a single call over 100 candidates
    // blows the timeout). Indices in each chunk are local (0-based), so offset
    // them by the chunk's start position to map back to the full array.
    const chunks: Array<{ start: number; chunk: Candidate[] }> = [];
    for (let start = 0; start < candidates.length; start += SCORE_BATCH) {
      chunks.push({ start, chunk: candidates.slice(start, start + SCORE_BATCH) });
    }

    const perChunk = await Promise.all(
      chunks.map(async ({ start, chunk }) => {
        const prompt = this.buildScorePrompt(subject, chunk);
        const parsed = await this.runWithRetry(prompt, relevanceArraySchema);
        return parsed
          .filter((r) => r.index >= 0 && r.index < chunk.length)
          .map((r) => ({
            index: start + r.index,
            relevance: r.relevance,
            rationale: r.rationale,
          }));
      }),
    );

    return perChunk.flat();
  }

  async draft(subject: Subject, candidates: Candidate[]): Promise<DraftResult[]> {
    if (candidates.length === 0) return [];

    const prompt = this.buildDraftPrompt(subject, candidates);
    const parsed = await this.runWithRetry(prompt, draftArraySchema);

    return parsed.map((d) => ({
      index: d.index,
      comment: d.comment,
    }));
  }

  /**
   * Run the prompt, parse + validate the result, and on JSON failure retry once
   * with a stricter "return ONLY the JSON array" instruction before throwing.
   */
  private async runWithRetry<T>(prompt: string, schema: ZodType<T>): Promise<T> {
    const first = await this.runClaude(prompt);
    try {
      return this.extractJson(first, schema);
    } catch (firstErr) {
      const retryPrompt =
        prompt + "\n\nYour previous output was not valid JSON. Return ONLY the JSON array.";
      const second = await this.runClaude(retryPrompt);
      try {
        return this.extractJson(second, schema);
      } catch (secondErr) {
        const detail = secondErr instanceof Error ? secondErr.message : String(secondErr);
        throw new Error(
          `Judge returned invalid JSON after one retry: ${detail}. ` +
            `First attempt error: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}`,
        );
      }
    }
  }

  /**
   * Invoke `claude -p --output-format json --model <judge.model>`, sending the
   * prompt over stdin. Returns the assistant text held in the envelope's
   * `.result`. Throws a clear, actionable error on spawn failure or non-zero
   * exit.
   */
  private runClaude(prompt: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        "claude",
        ["-p", "--output-format", "json", "--model", config.judge.model],
        { timeout: config.judge.timeoutMs },
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        const hint =
          err.code === "ENOENT"
            ? " — is the `claude` CLI installed and logged in?"
            : "";
        reject(new Error(`Failed to spawn \`claude\`: ${err.message}${hint}`));
      });

      child.on("close", (code, signal) => {
        if (code !== 0) {
          const why = signal
            ? `terminated by signal ${signal} (timeout ${config.judge.timeoutMs}ms?)`
            : `exited with code ${code}`;
          reject(
            new Error(
              `\`claude\` ${why} — is the \`claude\` CLI installed and logged in?` +
                (stderr.trim() ? `\nstderr: ${stderr.trim()}` : ""),
            ),
          );
          return;
        }

        let envelope: unknown;
        try {
          envelope = JSON.parse(stdout);
        } catch {
          reject(
            new Error(
              `Could not parse \`claude\` JSON envelope from stdout. ` +
                `Got: ${stdout.slice(0, 500)}`,
            ),
          );
          return;
        }

        const result = (envelope as { result?: unknown }).result;
        if (typeof result !== "string") {
          reject(
            new Error(
              `\`claude\` JSON envelope had no string \`result\` field. ` +
                `Envelope: ${JSON.stringify(envelope).slice(0, 500)}`,
            ),
          );
          return;
        }

        resolve(result);
      });

      child.stdin.on("error", (err: Error) => {
        reject(new Error(`Failed to write prompt to \`claude\` stdin: ${err.message}`));
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  /**
   * Pull a JSON value out of model text: strip ```json / ``` fences, slice from
   * the first `[`/`{` to the matching last `]`/`}`, `JSON.parse`, then validate
   * with the supplied zod schema. Throws on any failure.
   */
  private extractJson<T>(text: string, schema: ZodType<T>): T {
    const unfenced = text
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim();

    const slice = sliceToBrackets(unfenced);
    if (slice === null) {
      throw new Error(`No JSON array/object found in judge output: ${unfenced.slice(0, 300)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(slice);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`JSON.parse failed on judge output: ${detail}`);
    }

    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Judge output failed schema validation: ${validated.error.message}`);
    }
    return validated.data;
  }

  private buildScorePrompt(subject: Subject, candidates: Candidate[]): string {
    return [
      "You are scoring how relevant social-media posts are to a subject I want to promote.",
      "",
      "SUBJECT",
      `Title: ${subject.title}`,
      `Description: ${subject.description}`,
      `Keywords: ${subject.keywords.join(", ")}`,
      `URL: ${subject.url}`,
      "",
      "CANDIDATES (one per line, formatted `INDEX: [platform] text`):",
      numberCandidates(candidates),
      "",
      "For each candidate, rate topic relevance to the SUBJECT from 0 to 100 and give a SHORT rationale (max 8 words).",
      'Return ONLY a JSON array, no prose, no code fences: [{"index":N,"relevance":0-100,"rationale":"..."}]',
    ].join("\n");
  }

  private buildDraftPrompt(subject: Subject, candidates: Candidate[]): string {
    return [
      "You are drafting reply comments for social-media posts to promote a subject of mine.",
      "",
      "SUBJECT",
      `Title: ${subject.title}`,
      `Description: ${subject.description}`,
      `Keywords: ${subject.keywords.join(", ")}`,
      `URL: ${subject.url}`,
      "",
      "CANDIDATES (one per line, formatted `INDEX: [platform] text`):",
      numberCandidates(candidates),
      "",
      "For each candidate, draft a single value-adding reply that makes a genuine technical point and",
      `naturally references the subject (include the link ${subject.url}).`,
      "Guidance: lead with the insight, keep the link secondary, no boilerplate, one comment per candidate.",
      "X (platform `x`) replies MUST be <= 280 characters; LinkedIn replies may be longer.",
      'Return ONLY a JSON array, no prose, no code fences: [{"index":N,"comment":"..."}]',
    ].join("\n");
  }
}

/** Max characters of candidate text to include per line in a judge prompt. */
const CANDIDATE_TEXT_LIMIT = 240;

/** How many candidates to score per `claude -p` call (batches run in parallel). */
const SCORE_BATCH = 25;

/** Render candidates as a numbered `INDEX: [platform] text` list (text trimmed). */
function numberCandidates(candidates: Candidate[]): string {
  return candidates
    .map((c, i) => {
      const text = c.text.replace(/\s+/g, " ").trim().slice(0, CANDIDATE_TEXT_LIMIT);
      return `${i}: [${c.platform}] ${text}`;
    })
    .join("\n");
}

/**
 * Slice a string from its first top-level `[`/`{` to the matching last `]`/`}`.
 * Picks whichever bracket type appears first; returns null if no opener exists.
 */
function sliceToBrackets(text: string): string | null {
  const firstArr = text.indexOf("[");
  const firstObj = text.indexOf("{");

  let open: number;
  let closeChar: string;
  if (firstArr === -1 && firstObj === -1) return null;
  else if (firstArr === -1) {
    open = firstObj;
    closeChar = "}";
  } else if (firstObj === -1) {
    open = firstArr;
    closeChar = "]";
  } else if (firstArr < firstObj) {
    open = firstArr;
    closeChar = "]";
  } else {
    open = firstObj;
    closeChar = "}";
  }

  const close = text.lastIndexOf(closeChar);
  if (close <= open) return null;
  return text.slice(open, close + 1);
}
