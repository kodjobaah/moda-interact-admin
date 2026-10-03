import assert from "node:assert/strict";
import test from "node:test";

import {
  clampDrawerWidth,
  getKeyboardDrawerWidth,
  getPointerDrawerWidth,
  getWorkspaceWidth,
  MIN_DRAWER_WIDTH,
  RESIZE_STEP,
} from "../../src/components/admin/queue-monitor/use-resizable-drawer.ts";

test("workspace width follows the desktop sidebar boundary", () => {
  assert.equal(getWorkspaceWidth(767), 767);
  assert.equal(getWorkspaceWidth(768), 528);
  assert.equal(getWorkspaceWidth(1200), 960);
});

test("drawer width clamps to the current workspace and minimum", () => {
  assert.equal(clampDrawerWidth(400, 900), MIN_DRAWER_WIDTH);
  assert.equal(clampDrawerWidth(600, 900), 600);
  assert.equal(clampDrawerWidth(1000, 900), 900);
  assert.equal(clampDrawerWidth(400, 300), 300);
});

test("pointer resizing subtracts the pointer position and clamps the result", () => {
  assert.equal(getPointerDrawerWidth(1200, 700), 500);
  assert.equal(getPointerDrawerWidth(1200, 0), 960);
  assert.equal(getPointerDrawerWidth(1200, 1190), MIN_DRAWER_WIDTH);
});

test("keyboard resizing preserves the established direction, step, and bounds", () => {
  const maximum = 960;
  assert.equal(
    getKeyboardDrawerWidth({ key: "ArrowLeft" }, 600, maximum),
    600 + RESIZE_STEP,
  );
  assert.equal(
    getKeyboardDrawerWidth({ key: "ArrowRight" }, 600, maximum),
    600 - RESIZE_STEP,
  );
  assert.equal(
    getKeyboardDrawerWidth({ key: "ArrowLeft" }, maximum, maximum),
    maximum,
  );
  assert.equal(
    getKeyboardDrawerWidth({ key: "ArrowRight" }, MIN_DRAWER_WIDTH, maximum),
    MIN_DRAWER_WIDTH,
  );
  assert.equal(
    getKeyboardDrawerWidth({ key: "Home" }, 600, maximum),
    MIN_DRAWER_WIDTH,
  );
  assert.equal(getKeyboardDrawerWidth({ key: "End" }, 600, maximum), maximum);
  assert.equal(getKeyboardDrawerWidth({ key: "Enter" }, 600, maximum), null);
});
