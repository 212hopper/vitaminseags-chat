import assert from "node:assert/strict";
import { test } from "node:test";
import { parseColour, parseColourCommand } from "./colour.js";

test("parseColour accepts names and hex", () => {
  assert.equal(parseColour("red"), "#ff0000");
  assert.equal(parseColour(" #ABC "), "#aabbcc");
  assert.equal(parseColour("00ff00"), "#00ff00");
  assert.equal(parseColour("not-a-colour"), null);
});

test("parseColourCommand only matches !colour / !color", () => {
  assert.equal(parseColourCommand("hello"), null);
  assert.equal(parseColourCommand("!colour"), "invalid");
  assert.deepEqual(parseColourCommand("!color coral"), { color: "#ff7f50" });
  assert.equal(parseColourCommand("!colour nope"), "invalid");
});
