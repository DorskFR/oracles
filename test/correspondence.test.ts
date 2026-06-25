import assert from "node:assert/strict";
import { test } from "node:test";
import { matchNodes } from "../src/core/correspondence.js";
import type { NodeRecord } from "../src/types.js";

const mk = (over: Partial<NodeRecord>): NodeRecord => ({
  fid: null,
  tag: "div",
  role: null,
  text: "",
  path: "",
  origin: null,
  box: { x: 0, y: 0, width: 0, height: 0 },
  styles: {},
  ...over,
});

test("matches by fid first", () => {
  const m = matchNodes([mk({ fid: "a", tag: "button" })], [mk({ fid: "a", tag: "button" })]);
  assert.equal(m.pairs.length, 1);
  assert.equal(m.pairs[0]!.by, "fid");
});

test("falls back to tag+text", () => {
  const m = matchNodes([mk({ tag: "h1", text: "Hello" })], [mk({ tag: "h1", text: "Hello" })]);
  assert.equal(m.pairs[0]!.by, "text");
});

test("reports unmatched reference nodes", () => {
  const m = matchNodes([mk({ fid: "x" })], []);
  assert.equal(m.unmatchedRef.length, 1);
  assert.equal(m.pairs.length, 0);
});
