import assert from "node:assert/strict";
import { test } from "node:test";
import { cloneCommandFlags, DEFAULT_COMMANDS } from "../chat/catalog.js";
import { DEFAULT_FONT } from "../config.js";
import { cloneSpotlightHoles, DEFAULT_SPOTLIGHT_COUNT, DEFAULT_SPOTLIGHT_HOLES } from "./presets.js";
import { sanitizeOverlaySettings, type OverlaySettings } from "./settings.js";

function base(): OverlaySettings {
  return {
    maxMessages: 14,
    holdMs: 25_000,
    fadeOutMs: 600,
    hideCommands: true,
    chatVisible: true,
    spotlightEnabled: false,
    spotlightDarknessPct: 40,
    spotlightCount: DEFAULT_SPOTLIGHT_COUNT,
    spotlightHoles: cloneSpotlightHoles(DEFAULT_SPOTLIGHT_HOLES),
    layoutPresets: [],
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

test("spotlight darkness clamps and missing values keep defaults", () => {
  const clamped = sanitizeOverlaySettings({ spotlightDarknessPct: 180, spotlightEnabled: true }, base());
  assert.equal(clamped.spotlightDarknessPct, 100);
  assert.equal(clamped.spotlightEnabled, true);
  const fromDisk = JSON.parse("{}") as Partial<OverlaySettings>;
  const next = sanitizeOverlaySettings(fromDisk, base());
  assert.equal(next.spotlightEnabled, false);
  assert.equal(next.spotlightDarknessPct, 40);
  assert.equal(next.spotlightCount, 3);
  assert.equal(next.spotlightHoles.length, 6);
  assert.equal(next.layoutPresets.length, 0);
});

test("spotlight count and holes sanitize, and presets can be stored", () => {
  const next = sanitizeOverlaySettings(
    {
      spotlightCount: 9,
      spotlightHoles: [{ x: 100, y: 200, r: 80 }],
      layoutPresets: [
        {
          id: "p_song",
          name: "Song battle",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSizePx: 18,
          posX: 20,
          posY: 40,
          boxWidth: 400,
          boxHeight: 800,
          spotlightDarknessPct: 55,
          spotlightCount: 3,
          spotlightHoles: [{ x: 100, y: 200, r: 80 }],
        },
      ],
    } as unknown as Partial<OverlaySettings>,
    base(),
  );
  assert.equal(next.spotlightCount, 6);
  assert.equal(next.spotlightHoles[0]?.x, 100);
  assert.equal(next.spotlightHoles[0]?.w, 160);
  assert.equal(next.spotlightHoles[0]?.h, 160);
  assert.equal(next.spotlightHoles[0]?.shape, "circle");
  assert.equal(next.spotlightHoles[0]?.feather, 70);
  assert.equal(next.spotlightHoles[2]?.x, 960);
  assert.equal(next.layoutPresets.length, 1);
  assert.equal(next.layoutPresets[0]?.name, "Song battle");
  assert.equal(next.layoutPresets[0]?.spotlightHoles.length, 6);
});

test("legacy boolean command flags still enable or disable", () => {
  const fromDisk = JSON.parse('{"commands":{"party":false}}') as Partial<OverlaySettings>;
  const next = sanitizeOverlaySettings(fromDisk, base());
  assert.equal(next.commands.party.enabled, false);
  assert.equal(next.commands.party.staffGuarantee, true);
  assert.equal(next.commands.party.chancePct, 1);
});

test("stored hit chance is kept and new chance commands are filled in", () => {
  const fromDisk = JSON.parse(
    '{"commands":{"party":{"enabled":true,"who":"anyone","staffGuarantee":true,"chatHelp":"party","chancePct":25}}}',
  ) as Partial<OverlaySettings>;
  const next = sanitizeOverlaySettings(fromDisk, base());
  assert.equal(next.commands.party.chancePct, 25);
  assert.equal(next.commands.dvd.enabled, true);
  assert.equal(next.commands.dvd.chancePct, 4);
  assert.equal(next.commands.dvd.staffGuarantee, true);
});
