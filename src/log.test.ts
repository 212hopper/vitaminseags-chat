import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFastifyLogLevel, parseLogLevel, takeCompleteLines } from "./log.js";

test("parseLogLevel accepts the advertised set only", () => {
  assert.equal(parseLogLevel("info"), "info");
  assert.equal(parseLogLevel("WARN"), "warn");
  assert.equal(parseLogLevel("error"), "error");
  assert.equal(parseLogLevel("debug"), "info");
  assert.equal(parseLogLevel("trace"), "info");
  assert.equal(parseLogLevel("fatal"), "info");
  assert.equal(parseLogLevel("nope"), "info");
});

test("parseFastifyLogLevel keeps pino levels including silent", () => {
  assert.equal(parseFastifyLogLevel("silent", "info"), "silent");
  assert.equal(parseFastifyLogLevel("debug", "info"), "debug");
  assert.equal(parseFastifyLogLevel("", "warn"), "warn");
  assert.equal(parseFastifyLogLevel("nope", "error"), "error");
});

test("pino stream splits concatenated lines and holds a partial chunk", () => {
  const first = JSON.stringify({ level: 30, msg: "one" });
  const second = JSON.stringify({ level: 40, msg: "two" });
  const both = takeCompleteLines("", `${first}\n${second}\n`);
  assert.deepEqual(both.lines, [first, second]);
  assert.equal(both.pending, "");

  const third = JSON.stringify({ level: 30, msg: "three" });
  const partial = takeCompleteLines("", third.slice(0, 12));
  assert.deepEqual(partial.lines, []);
  assert.equal(partial.pending, third.slice(0, 12));
  const rest = takeCompleteLines(partial.pending, `${third.slice(12)}\n`);
  assert.deepEqual(rest.lines, [third]);
  assert.equal(rest.pending, "");
});
