import assert from "node:assert/strict";
import { test } from "node:test";
import { cloneCommandFlags, DEFAULT_COMMANDS } from "../chat/catalog.js";
import { DEFAULT_FONT } from "../config.js";
import { sanitizeOverlaySettings, type OverlaySettings } from "./settings.js";

function base(): OverlaySettings {
  return {
    maxMessages: 14,
    holdMs: 25_000,
    fadeOutMs: 600,
    hideCommands: true,
    chatVisible: true,
    fontFamily: DEFAULT_FONT,
    fontSizePx: 17,
    posX: 16,
    posY: 200,
    boxWidth: 420,
    boxHeight: 860,
    commands: cloneCommandFlags(DEFAULT_COMMANDS),
    customCommands: [],
    timedMessages: [],
  };
}

test("overlay settings clamp layout and ignore bad fonts", () => {
  const next = sanitizeOverlaySettings(
    {
      maxMessages: 99,
      fontSizePx: 3,
      fontFamily: "Comic Sans; background: red",
      posX: -40,
    },
    base(),
  );
  assert.equal(next.maxMessages, 50);
  assert.equal(next.fontSizePx, 10);
  assert.equal(next.fontFamily, DEFAULT_FONT);
  assert.equal(next.posX, 0);
});

test("legacy boolean command flags still enable or disable", () => {
  const next = sanitizeOverlaySettings({ commands: { party: false } as never }, base());
  assert.equal(next.commands.party.enabled, false);
  assert.equal(next.commands.party.staffGuarantee, true);
});
