import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadActionedUrls } from "./ledger.js";

test("loadActionedUrls skips a malformed line and still returns the good URLs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ledger-"));
  const file = path.join(dir, "actions.log.jsonl");
  await writeFile(
    file,
    JSON.stringify({ url: "https://a.test/1", status: "posted" }) +
      "\n" +
      "{ this is not valid json\n" + // unparseable -> skipped
      "42\n" + // valid JSON but not an object, no url -> adds nothing, no throw
      '"plain string"\n' + // ditto
      "null\n" + // null.url access is guarded
      JSON.stringify({ url: "https://a.test/2", status: "posted" }) +
      "\n" +
      "{ truncated at EOF, no newline", // malformed final line without trailing \n
  );

  const urls = await loadActionedUrls({ file });
  assert.ok(urls.has("https://a.test/1"));
  assert.ok(urls.has("https://a.test/2"));
  assert.equal(urls.size, 2);

  await rm(dir, { recursive: true, force: true });
});
