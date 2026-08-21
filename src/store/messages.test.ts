import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { capJsonlLines, loadMessageStore, type StoredChatMessage } from "./messages.js";

test("capJsonlLines keeps the newest lines when over the limit", () => {
  const raw = ["a", "b", "c", "d", "e"].join("\n") + "\n";
  assert.equal(capJsonlLines(raw, 3), "c\nd\ne\n");
  assert.equal(capJsonlLines(raw, 10), null);
});

test("message store trims using an in-memory count", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "vseags-messages-"));
  try {
    const store = await loadMessageStore(dir, 3);
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
    await store.append(row("d"));
    await store.append(row("e"));
    const listed = await store.listByUser("1");
    assert.deepEqual(
      listed.map((message) => message.id),
      ["c", "d", "e"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
