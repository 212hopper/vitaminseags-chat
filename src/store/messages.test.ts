import assert from "node:assert/strict";
import { test } from "node:test";
import { capJsonlLines } from "./messages.js";

test("capJsonlLines keeps the newest lines when over the limit", () => {
  const raw = ["a", "b", "c", "d", "e"].join("\n") + "\n";
  assert.equal(capJsonlLines(raw, 3), "c\nd\ne\n");
  assert.equal(capJsonlLines(raw, 10), null);
});
