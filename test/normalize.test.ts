import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeColor,
  normalizeFontFamily,
  normalizeFontWeight,
  normalizeLength,
  normalizeProperty,
} from "../src/core/normalize.js";

test("normalizeColor canonicalizes hex / rgb / named", () => {
  assert.equal(normalizeColor("#fff"), "rgb(255, 255, 255)");
  assert.equal(normalizeColor("#000000"), "rgb(0, 0, 0)");
  assert.equal(normalizeColor("#ff0000"), "rgb(255, 0, 0)");
  assert.equal(normalizeColor("rgb(255,0,0)"), "rgb(255, 0, 0)");
  assert.equal(normalizeColor("rgba(0, 0, 0, 1)"), "rgb(0, 0, 0)");
  assert.equal(normalizeColor("rgba(0,0,0,0)"), "rgba(0, 0, 0, 0)");
  assert.equal(normalizeColor("white"), "rgb(255, 255, 255)");
});

test("normalizeLength collapses zero and rounds", () => {
  assert.equal(normalizeLength("0px"), "0");
  assert.equal(normalizeLength("0"), "0");
  assert.equal(normalizeLength("16px"), "16px");
  assert.equal(normalizeLength("12.0px"), "12px");
  assert.equal(normalizeLength("50%"), "50%");
});

test("font family / weight normalization", () => {
  assert.equal(normalizeFontFamily('"Inter", sans-serif'), "inter, sans-serif");
  assert.equal(normalizeFontWeight("bold"), "700");
  assert.equal(normalizeFontWeight("normal"), "400");
  assert.equal(normalizeFontWeight("600"), "600");
});

test("normalizeProperty dispatches by property", () => {
  assert.equal(normalizeProperty("color", "#fff"), "rgb(255, 255, 255)");
  assert.equal(normalizeProperty("padding-top", "0px"), "0");
  assert.equal(normalizeProperty("display", "FLEX"), "flex");
  assert.equal(normalizeProperty("border-top-left-radius", "8px"), "8px");
});
