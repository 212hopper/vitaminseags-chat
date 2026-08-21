import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { capJsonlLines, jsonlLineCount, loadMessageStore, type StoredChatMessage } from "./messages.js";

test("capJsonlLines keeps the newest lines when over the limit", () => {
  const raw = ["a", "b", "c", "d", "e"].join("\n") + "\n";
  assert.equal(capJsonlLines(raw, 3), "c\nd\ne\n");
  assert.equal(capJsonlLines(raw, 10), null);
});

test("jsonlLineCount does not require a trailing newline", () => {
  assert.equal(jsonlLineCount("a\nb\nc"), 3);
  assert.equal(jsonlLineCount("a\nb\nc\n"), 3);
  assert.equal(jsonlLineCount(""), 0);
});

test("append past the cap does not rewrite until slack is exceeded", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "vseags-messages-"));
  try {
    const store = await loadMessageStore(dir, 3, 2);
    const row = (id: string): StoredChatMessage => ({
      id,
      userId: "1",
      login: "phil",
      displayName: "Phil",
      text: id,
      ts: Date.now(),
    });
    await store.append(row("a"));
    await store.append(row("b"));
    await store.append(row("c"));
    const filePath = path.join(dir, "1.jsonl");
    const atCap = await stat(filePath);

    await store.append(row("d"));
    const pastCap = await stat(filePath);
    assert.ok(pastCap.size > atCap.size);
    assert.deepEqual(
      (await store.listByUser("1")).map((message) => message.id),
      ["a", "b", "c", "d"],
    );

    await store.append(row("e"));
    await store.append(row("f"));
    assert.deepEqual(
      (await store.listByUser("1")).map((message) => message.id),
      ["d", "e", "f"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
