import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadHiddenStore, sanitizeHiddenLogin } from "./hidden.js";

test("sanitizeHiddenLogin accepts Twitch logins", () => {
  assert.equal(sanitizeHiddenLogin("@Nightbot"), "nightbot");
  assert.equal(sanitizeHiddenLogin("streamelements"), "streamelements");
  assert.equal(sanitizeHiddenLogin("no"), null);
});

test("hidden store persists logins and matches case-insensitively", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "vseags-hidden-"));
  const filePath = path.join(dir, "hidden.json");
  try {
    const first = await loadHiddenStore(filePath);
    assert.deepEqual(await first.add("Nightbot"), { login: "nightbot" });
    assert.equal(await first.add("nightbot"), "exists");
    assert.deepEqual(await first.add("StreamElements"), { login: "streamelements" });
    assert.equal(first.has("NIGHTBOT"), true);
    assert.equal(first.has("moobot"), false);

    const second = await loadHiddenStore(filePath);
    assert.deepEqual(second.list(), ["nightbot", "streamelements"]);
    assert.equal(await second.remove("nightbot"), true);
    assert.equal(second.has("nightbot"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
