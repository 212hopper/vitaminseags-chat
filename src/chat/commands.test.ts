import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isChannelStaff,
  parseChatVisibilityCommand,
  parseDvdCommand,
  parseHelpCommand,
  parsePartyCommand,
  parsePresetCommand,
  parseSpotlightCommand,
  parseUsernameCommand,
} from "./commands.js";

test("parse username command", () => {
  assert.equal(parseUsernameCommand("hi"), null);
  assert.equal(parseUsernameCommand("!username"), "invalid");
  assert.deepEqual(parseUsernameCommand("!username sloppy212"), { alias: "sloppy212" });
});

test("parse visibility, party, and help", () => {
  assert.equal(parseChatVisibilityCommand("!showchat"), "show");
  assert.equal(parseChatVisibilityCommand("!hidechat"), "hide");
  assert.equal(parseChatVisibilityCommand("!show chat"), null);
  assert.equal(parsePartyCommand("!party"), true);
  assert.equal(parsePartyCommand("!forceparty"), false);
  assert.equal(parseDvdCommand("!dvd"), true);
  assert.equal(parseDvdCommand("!dvds"), false);
  assert.equal(parseSpotlightCommand("!sbon"), "on");
  assert.equal(parseSpotlightCommand("!sboff"), "off");
  assert.equal(parseSpotlightCommand("!sb on"), null);
  assert.deepEqual(parsePresetCommand("!preset"), { list: true });
  assert.deepEqual(parsePresetCommand("!preset Song Battle"), { name: "Song Battle" });
  assert.equal(parsePresetCommand("!presets"), null);
  assert.equal(parseHelpCommand("!help"), true);
});

test("channel staff is broadcaster or moderator", () => {
  assert.equal(isChannelStaff({ hasBadge: (name) => name === "broadcaster" }), true);
  assert.equal(isChannelStaff({ hasBadge: (name) => name === "moderator" }), true);
  assert.equal(isChannelStaff({ hasBadge: () => false }), false);
});
