import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTimedMessage,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  sanitizeIntervalMinutes,
  sanitizeTimedMessage,
} from "./timed.js";

test("interval is clamped to 1–180 minutes", () => {
  assert.equal(sanitizeIntervalMinutes(0, 15), MIN_INTERVAL_MINUTES);
  assert.equal(sanitizeIntervalMinutes(999, 15), MAX_INTERVAL_MINUTES);
  assert.equal(sanitizeIntervalMinutes("12", 15), 12);
  assert.equal(sanitizeIntervalMinutes("nope", 15), 15);
});

test("createTimedMessage requires a body and defaults live-only on", () => {
  const empty = createTimedMessage({ message: "  ", existing: [] });
  assert.deepEqual(empty, { error: "Write the message to post in chat." });
  const created = createTimedMessage({
    label: "Merch",
    message: "Grab merch at example.com",
    intervalMinutes: 20,
    existing: [],
  });
  assert.ok(!("error" in created));
  if ("error" in created) {
    return;
  }
  assert.equal(created.label, "Merch");
  assert.equal(created.intervalMinutes, 20);
  assert.equal(created.liveOnly, true);
  assert.equal(created.enabled, true);
});

test("sanitizeTimedMessage keeps fallback on garbage input", () => {
  const created = createTimedMessage({ message: "hello chat", existing: [] });
  assert.ok(!("error" in created));
  if ("error" in created) {
    return;
  }
  assert.equal(sanitizeTimedMessage(null, created)?.message, "hello chat");
  const patched = sanitizeTimedMessage({ ...created, intervalMinutes: 1, liveOnly: false }, created);
  assert.equal(patched?.intervalMinutes, 1);
  assert.equal(patched?.liveOnly, false);
});
