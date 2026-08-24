import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TEXT_COLOR, DEFAULT_TICK_COLOR } from "../chat/colour.js";
import { DEFAULT_FONT } from "../config.js";
import {
  createLayoutPreset,
  DEFAULT_SPOTLIGHT_HOLES,
  findLayoutPreset,
  listLayoutPresetHelp,
  lookFieldsFrom,
  sanitizeSpotlightCount,
  sanitizeSpotlightHoles,
} from "./presets.js";

const look = {
  fontFamily: DEFAULT_FONT,
  fontSizePx: 17,
  tickColor: DEFAULT_TICK_COLOR,
  textColor: DEFAULT_TEXT_COLOR,
  posX: 16,
  posY: 200,
  boxWidth: 420,
  boxHeight: 860,
  spotlightDarknessPct: 40,
  spotlightCount: 3,
  spotlightHoles: DEFAULT_SPOTLIGHT_HOLES,
};

test("spotlight count clamps and holes pad to six", () => {
  assert.equal(sanitizeSpotlightCount(99, 3), 6);
  assert.equal(sanitizeSpotlightCount(-2, 3), 0);
  const holes = sanitizeSpotlightHoles([{ x: 10, y: 20, r: 50 }], DEFAULT_SPOTLIGHT_HOLES);
  assert.equal(holes.length, 6);
  assert.equal(holes[0]?.x, 10);
  assert.equal(holes[0]?.w, 100);
  assert.equal(holes[0]?.h, 100);
  assert.equal(holes[0]?.shape, "circle");
  assert.equal(holes[0]?.feather, 70);
  const oval = sanitizeSpotlightHoles(
    [{ x: 10, y: 20, w: 400, h: 120, shape: "rect", feather: 250 }],
    DEFAULT_SPOTLIGHT_HOLES,
  );
  assert.equal(oval[0]?.w, 400);
  assert.equal(oval[0]?.h, 120);
  assert.equal(oval[0]?.shape, "rect");
  assert.equal(oval[0]?.feather, 100);
  assert.equal(holes[1]?.x, DEFAULT_SPOTLIGHT_HOLES[1]?.x);
});

test("layout presets match by name and reject duplicates", () => {
  const created = createLayoutPreset("Song battle", look, []);
  assert.ok(!("error" in created));
  if ("error" in created) {
    return;
  }
  assert.equal(findLayoutPreset([created], "song battle")?.id, created.id);
  assert.equal(findLayoutPreset([created], "SongBattle")?.id, created.id);
  assert.deepEqual(createLayoutPreset("song battle", look, [created]), {
    error: '"song battle" already exists.',
  });
  const fields = lookFieldsFrom(created);
  assert.equal(fields.spotlightCount, 3);
  assert.equal(fields.tickColor, DEFAULT_TICK_COLOR);
  assert.equal(fields.textColor, DEFAULT_TEXT_COLOR);
  assert.equal("id" in fields, false);
  assert.match(listLayoutPresetHelp([created]), /Song battle/);
});
