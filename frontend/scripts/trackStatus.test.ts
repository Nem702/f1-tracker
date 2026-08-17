import { test } from "node:test";
import assert from "node:assert/strict";

import { trackStatusColor } from "../src/lib/trackStatus.ts";
import type { Theme } from "../src/theme.ts";

// Only the four flag tokens trackStatusColor reads — a full Theme has ~30
// unrelated fields (badge plates, chart chrome, driver colours) that this
// pure mapping function never touches.
const theme = {
  flagGood: "#0ca30c",
  flagWarning: "#fab219",
  flagSerious: "#ec835a",
  flagCritical: "#d03b3b",
} as Theme;

test("green maps to flagGood", () => {
  assert.equal(trackStatusColor("green", theme), theme.flagGood);
});

test("yellow maps to flagWarning", () => {
  assert.equal(trackStatusColor("yellow", theme), theme.flagWarning);
});

test("safetyCar maps to flagSerious", () => {
  assert.equal(trackStatusColor("safetyCar", theme), theme.flagSerious);
});

test("red maps to flagCritical", () => {
  assert.equal(trackStatusColor("red", theme), theme.flagCritical);
});

test("none maps to null", () => {
  assert.equal(trackStatusColor("none", theme), null);
});
