import assert from "node:assert/strict";
import { test } from "node:test";
import { noGlobal } from "../src/lint/no-global.js";

// Drive the rule with a fake ESLint context/sourceCode (no eslint/svelte parser
// dependency), invoking the SvelteStyleElement visitor with the style text.
function run(styleText: string, options: unknown[] = []): unknown[] {
  const reports: unknown[] = [];
  const sourceCode = {
    getText: () => styleText,
    getLocFromIndex: (i: number) => ({ line: 1, column: i }),
  };
  const ctx = { options, sourceCode, report: (d: unknown) => reports.push(d) };
  const visitors = noGlobal.create(ctx as never) as {
    SvelteStyleElement?: (node: unknown) => void;
  };
  visitors.SvelteStyleElement?.({ range: [0, styleText.length] });
  return reports;
}

test("flags a :global usage", () => {
  assert.equal(run(".a :global(.b) { color: red }").length, 1);
});

test("flags every :global occurrence", () => {
  assert.equal(run(":global(.x) {} :global(.y) {}").length, 2);
});

test("also flags the :global block form", () => {
  assert.equal(run(":global { .x { color: red } }").length, 1);
});

test("clean scoped styles pass", () => {
  assert.equal(run(".a { color: red } .b:hover { color: blue }").length, 0);
});

test("ignores :global inside a CSS comment by default", () => {
  assert.equal(run("/* :global(.z) was here */ .a {}").length, 0);
});

test("flags commented :global when ignoreComments is false", () => {
  assert.equal(run("/* :global(.z) */ .a {}", [{ ignoreComments: false }]).length, 1);
});
