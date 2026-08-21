import assert from "node:assert/strict";
import { test } from "node:test";
import { cloneCommandFlags, DEFAULT_COMMANDS } from "./catalog.js";
import {
  createTimedMessage,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  resolveTimedChatText,
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
  assert.deepEqual(empty, {
    error: "Write the message to post in chat, or pick !help / a custom command.",
  });
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
  assert.equal(created.source, "text");
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

test("timed !help and custom sources resolve live text", () => {
  const helpTimer = createTimedMessage({ source: "help", intervalMinutes: 15, existing: [] });
  assert.ok(!("error" in helpTimer));
  if ("error" in helpTimer) {
    return;
  }
  assert.equal(helpTimer.source, "help");
  assert.equal(helpTimer.message, "");
  assert.equal(helpTimer.label, "!help");
  const flags = cloneCommandFlags(DEFAULT_COMMANDS);
  const helpText = resolveTimedChatText(helpTimer, { commands: flags, customCommands: [] });
  assert.match(helpText ?? "", /Anyone can use:/);
  assert.match(helpText ?? "", /!help/);

  const customTimer = createTimedMessage({
    source: "custom",
    customId: "c_discord",
    label: "!discord",
    existing: [],
  });
  assert.ok(!("error" in customTimer));
  if ("error" in customTimer) {
    return;
  }
  const missing = resolveTimedChatText(customTimer, { commands: flags, customCommands: [] });
  assert.equal(missing, null);
  const live = resolveTimedChatText(customTimer, {
    commands: flags,
    customCommands: [
      {
        id: "c_discord",
        trigger: "discord",
        reply: "Join discord.gg/example",
        sendReply: true,
        enabled: true,
        who: "anyone",
        chatHelp: "Discord invite",
      },
    ],
  });
  assert.equal(live, "Join discord.gg/example");
});
