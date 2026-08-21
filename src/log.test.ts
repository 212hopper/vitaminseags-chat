import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLogLevel } from "./log.js";

test("parseLogLevel accepts the advertised set only", () => {
  assert.equal(parseLogLevel("info"), "info");
  assert.equal(parseLogLevel("WARN"), "warn");
  assert.equal(parseLogLevel("error"), "error");
  assert.equal(parseLogLevel("debug"), "info");
  assert.equal(parseLogLevel("trace"), "info");
  assert.equal(parseLogLevel("fatal"), "info");
  assert.equal(parseLogLevel("nope"), "info");
});
