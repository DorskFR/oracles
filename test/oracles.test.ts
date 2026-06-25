import assert from "node:assert/strict";
import { test } from "node:test";
import { a11yOracle } from "../src/oracles/a11y.js";
import { geometryOracle } from "../src/oracles/geometry.js";
import { reuseOracle } from "../src/oracles/reuse.js";
import { styleOracle } from "../src/oracles/style.js";
import { tokenOracle } from "../src/oracles/token.js";
import type { A11yNode, NodeRecord, TokenSet } from "../src/types.js";

const n = (over: Partial<NodeRecord>): NodeRecord => ({
  fid: null,
  tag: "div",
  role: null,
  text: "",
  path: "p",
  origin: null,
  box: { x: 0, y: 0, width: 10, height: 10 },
  styles: {},
  ...over,
});

const ts = (o: Partial<TokenSet>): TokenSet => ({
  colors: [],
  backgrounds: [],
  fontSizes: [],
  fontWeights: [],
  fontFamilies: [],
  radii: [],
  shadows: [],
  spacings: [],
  ...o,
});

test("style oracle: identical => score 1, pass", () => {
  const a = [
    n({
      fid: "cta",
      tag: "button",
      styles: { "background-color": "rgb(0, 0, 0)", "font-size": "16px" },
    }),
  ];
  const b = [
    n({
      fid: "cta",
      tag: "button",
      styles: { "background-color": "rgb(0, 0, 0)", "font-size": "16px" },
    }),
  ];
  const r = styleOracle(a, b);
  assert.equal(r.score, 1);
  assert.ok(r.passed);
});

test("style oracle: critical color mismatch => fail + finding", () => {
  const ref = [n({ fid: "cta", tag: "button", styles: { "background-color": "rgb(0, 0, 0)" } })];
  const sub = [n({ fid: "cta", tag: "button", styles: { "background-color": "rgb(255, 0, 0)" } })];
  const r = styleOracle(ref, sub);
  assert.ok(!r.passed);
  assert.ok(r.findings.some((f) => f.property === "background-color" && f.severity === "critical"));
});

test("geometry oracle: within / outside tolerance", () => {
  const ref = [n({ fid: "a", box: { x: 0, y: 0, width: 100, height: 50 } })];
  assert.ok(
    geometryOracle(ref, [n({ fid: "a", box: { x: 1, y: 0, width: 100, height: 50 } })], {
      tolerancePx: 2,
    }).passed,
  );
  const off = geometryOracle(ref, [n({ fid: "a", box: { x: 40, y: 0, width: 100, height: 50 } })], {
    tolerancePx: 2,
  });
  assert.ok(!off.passed);
  assert.ok(off.findings.length > 0);
});

test("reuse oracle: raw vs library", () => {
  assert.ok(!reuseOracle([n({ tag: "button" })]).passed);
  const lib = reuseOracle([n({ tag: "button", origin: "button" })]);
  assert.equal(lib.score, 1);
  assert.ok(lib.passed);
});

test("token oracle: off-token flagged, on-token passes", () => {
  const off = tokenOracle(
    ts({ colors: ["rgb(0, 0, 0)"] }),
    ts({ colors: ["rgb(0, 0, 0)", "rgb(1, 2, 3)"] }),
  );
  assert.ok(!off.passed);
  assert.ok(off.findings.some((f) => String(f.actual) === "rgb(1, 2, 3)"));
  assert.ok(tokenOracle(ts({ colors: ["rgb(0, 0, 0)"] }), ts({ colors: ["rgb(0, 0, 0)"] })).passed);
});

test("a11y oracle: missing heading flagged, identical passes", () => {
  const ref: A11yNode = { role: "document", children: [{ role: "heading" }, { role: "button" }] };
  const sub: A11yNode = { role: "document", children: [{ role: "button" }] };
  const r = a11yOracle(ref, sub);
  assert.ok(r.findings.some((f) => String(f.message).includes("heading")));
  const same = a11yOracle(ref, ref);
  assert.ok(same.passed);
  assert.equal(same.score, 1);
});
