import assert from "node:assert/strict";
import { test } from "node:test";
import { OAuthWaiter } from "./auth.js";

test("OAuth state is single-use and rejects a second match", () => {
  const oauth = new OAuthWaiter();
  const state = oauth.issueState();
  assert.equal(oauth.takeState("nope"), false);
  assert.equal(oauth.takeState(state), true);
  assert.equal(oauth.takeState(state), false);
});

test("clearState drops a pending OAuth state", () => {
  const oauth = new OAuthWaiter();
  const state = oauth.issueState();
  oauth.clearState();
  assert.equal(oauth.takeState(state), false);
});
