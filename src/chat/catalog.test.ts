import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canUseWho,
  cloneCommandFlags,
  commandHits,
  commandWho,
  createCustomCommand,
  DEFAULT_COMMANDS,
  findCustomCommand,
  isCommandEnabled,
  normalizeTrigger,
  publicCommandHelp,
  reservedTriggers,
  sanitizeCommandState,
} from "./catalog.js";

test("who locks", () => {
  assert.equal(canUseWho("anyone", false), true);
  assert.equal(canUseWho("mods", false), false);
  assert.equal(canUseWho("mods", true), true);
});

test("legacy boolean command state keeps who and help", () => {
  const fallback = DEFAULT_COMMANDS.party;
  const next = sanitizeCommandState(false, fallback);
  assert.equal(next.enabled, false);
  assert.equal(next.staffGuarantee, fallback.staffGuarantee);
  assert.equal(next.who, "anyone");
});

test("party staff guarantee skips the roll", () => {
  const flags = cloneCommandFlags(DEFAULT_COMMANDS);
  flags.party.staffGuarantee = true;
  const original = Math.random;
  Math.random = () => 0.99;
  try {
    assert.equal(commandHits(flags, "party", true), true);
    assert.equal(commandHits(flags, "party", false), false);
  } finally {
    Math.random = original;
  }
});

test("custom commands reject built-ins and match chat text", () => {
  assert.equal(normalizeTrigger("!Discord"), "discord");
  assert.equal(reservedTriggers().has("party"), true);
  const created = createCustomCommand({
    trigger: "discord",
    reply: "Join the Discord: https://example.com",
    existing: [],
  });
  assert.ok(!("error" in created));
  if ("error" in created) {
    return;
  }
  assert.equal(findCustomCommand([created], "!discord please")?.id, created.id);
  assert.equal(findCustomCommand([created], "!discordant"), null);
  const clash = createCustomCommand({ trigger: "party", reply: "nope", existing: [] });
  assert.deepEqual(clash, { error: "!party is already a built-in command." });
});

test("!help lists enabled anyone commands and skips mods-only", () => {
  const flags = cloneCommandFlags(DEFAULT_COMMANDS);
  flags.showchat.who = "mods";
  flags.username.enabled = false;
  const text = publicCommandHelp(flags, [
    {
      id: "c_test1",
      trigger: "discord",
      reply: "discord.gg/example",
      enabled: true,
      who: "anyone",
      chatHelp: "Discord invite",
    },
    {
      id: "c_test2",
      trigger: "modonly",
      reply: "secret",
      enabled: true,
      who: "mods",
      chatHelp: "hidden",
    },
  ]);
  assert.match(text, /!colour/);
  assert.match(text, /!discord — Discord invite/);
  assert.doesNotMatch(text, /!username/);
  assert.doesNotMatch(text, /!showchat/);
  assert.doesNotMatch(text, /modonly/);
});

test("commandWho falls back to catalog defaults", () => {
  const flags = cloneCommandFlags(DEFAULT_COMMANDS);
  assert.equal(commandWho(flags, "showchat"), "mods");
  assert.equal(isCommandEnabled(flags, "help"), true);
});
