import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isPublicPath, loadSessionStore, parseCookies, safeNextPath } from "./session.js";

test("parseCookies and safeNextPath", () => {
  assert.equal(parseCookies("a=1; b=two")["b"], "two");
  assert.equal(safeNextPath("/dashboard/"), "/dashboard/");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil"), "/");
});

test("health and overlay stay public", () => {
  assert.equal(isPublicPath("/health"), true);
  assert.equal(isPublicPath("/overlays/chat/"), true);
  assert.equal(isPublicPath("/ws"), true);
  assert.equal(isPublicPath("/oauth/callback"), true);
  assert.equal(isPublicPath("/oauth"), false);
  assert.equal(isPublicPath("/dashboard/"), false);
  assert.equal(isPublicPath("/api/commands"), false);
});

test("sessions survive a reload from disk", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "vseags-sessions-"));
  const filePath = path.join(dir, "sessions.json");
  try {
    const first = await loadSessionStore(filePath);
    const token = first.create({ username: "phil", role: "admin" });
    await first.flush();
    const onDisk = await readFile(filePath, "utf8");
    assert.equal(onDisk.includes(token), false);
    const cookie = `vseags_session=${token}`;
    assert.equal(first.resolve(cookie)?.username, "phil");

    const second = await loadSessionStore(filePath);
    assert.equal(second.resolve(cookie)?.username, "phil");
    assert.equal(second.resolve(cookie)?.role, "admin");
    second.destroy(cookie);
    await second.flush();

    const third = await loadSessionStore(filePath);
    assert.equal(third.resolve(cookie), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
