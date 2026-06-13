import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeCliJudge } from "./claude-cli.js";
import type { Candidate, Subject } from "../types.js";

const baseSubject: Subject = {
  id: "s",
  type: "blog",
  url: "https://example.test/post",
  title: "t",
  description: "d",
  keywords: ["Foundation Models"],
  queries: { x: "", linkedin: "" },
};

function cand(text: string): Candidate {
  return {
    platform: "x",
    url: "https://x.test/1",
    author: "a",
    text,
    likes: 0,
    replies: 0,
    reposts: 0,
    createdAt: "2026-06-13T00:00:00Z",
  };
}

class StubJudge extends ClaudeCliJudge {
  prompts: string[] = [];
  constructor(private responder: (p: string) => string) {
    super();
  }
  protected override runClaude(p: string): Promise<string> {
    this.prompts.push(p);
    return Promise.resolve(this.responder(p));
  }
}

test("score() injects focus + notSubject + a classify instruction and carries topicClass through when the subject defines disambiguation", async () => {
  const subject: Subject = {
    ...baseSubject,
    focus: "Apple's Swift Foundation Models framework for iOS developers",
    notSubject: ["generic ML foundation models", "consumer Apple Intelligence news"],
  };
  let seen = "";
  const judge = new StubJudge((p) => {
    seen = p;
    return JSON.stringify([{ index: 0, relevance: 90, topicClass: "on_topic", rationale: "about the framework" }]);
  });
  const out = await judge.score(subject, [cand("Using LanguageModelSession on-device")]);

  assert.ok(seen.includes("Apple's Swift Foundation Models framework for iOS developers"), "focus must be injected verbatim");
  assert.ok(seen.includes("generic ML foundation models"), "notSubject must be injected");
  assert.ok(/on_topic/.test(seen) && /off_topic/.test(seen), "classify instruction must be present");
  assert.equal(out[0]?.topicClass, "on_topic", "topicClass must be carried through");
  assert.equal(out[0]?.relevance, 90);
});

test("score() prompt is unchanged (no classify lines, no topicClass) when the subject has no focus/notSubject", async () => {
  let seen = "";
  const judge = new StubJudge((p) => {
    seen = p;
    return JSON.stringify([{ index: 0, relevance: 50, rationale: "x" }]);
  });
  const out = await judge.score(baseSubject, [cand("hello")]);

  assert.ok(!/on_topic|off_topic/.test(seen), "no classify instruction when disambiguation is absent");
  assert.ok(seen.includes("Keywords:"), "keeps the original Keywords line when no disambiguation");
  assert.equal(out[0]?.topicClass, undefined, "no topicClass when the model omits it");
  assert.equal(out[0]?.relevance, 50);
});

test("draft() injects focus so drafts stay on the true subject", async () => {
  const subject: Subject = {
    ...baseSubject,
    focus: "Apple's Swift Foundation Models framework for iOS developers",
  };
  let seen = "";
  const judge = new StubJudge((p) => {
    seen = p;
    return JSON.stringify([{ index: 0, comment: "great point" }]);
  });
  await judge.draft(subject, [cand("Using LanguageModelSession on-device")]);
  assert.ok(seen.includes("Apple's Swift Foundation Models framework for iOS developers"), "focus must be injected into the draft prompt");
});
