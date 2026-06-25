// Example consumer config — lives in your project, not in oracles.
// Run with: npx oracles run examples/fidelity.config.mjs
//
// In a real consumer you import from the published/linked package:
//   import { claudeDesignReference, renderedApp } from "@dorsk/oracles";
// Inside this repo the example imports from the built dist instead.

import { DESKTOP } from "../dist/core/render-contract.js";
import { claudeDesignReference } from "../dist/references/claude-design.js";
import { renderedApp } from "../dist/references/rendered-app.js";

/** @type {import("../dist/runner.js").FidelityConfig} */
export default {
  outDir: ".oracles-out",
  contract: { viewport: DESKTOP },
  // Same deterministic data fed to reference and subject (Playwright route mocks).
  // fixtures live per-target; shown here on the subject.
  cases: [
    {
      name: "overview",
      // The Claude Design comp is real DOM => all oracles run against it.
      reference: claudeDesignReference({
        dir: ".qa/claude-design", // exported comp directory, relative to your project
        file: "design.dc.html",
        selector: '[data-screen="overview"]', // slice one screen out of the comp
      }),
      // Your local dev route. Add data-fid attributes mirroring the comp's
      // layer names so the style/geometry oracles can match node-to-node.
      subject: renderedApp({
        name: "overview-local",
        url: "http://localhost:5173/",
        selector: "main",
        fixtures: {
          "**/api/collections*": { items: [], total: 0 },
        },
      }),
      // Omit `oracles` to auto-run every oracle the reference supports.
      oracles: {
        visual: { maxMismatchRatio: 0.03, minSsim: 0.95 },
        style: { minScore: 0.95 },
        reuse: { registry: { button: "Button", input: "Input" }, minRatio: 0.8 },
      },
    },
  ],
};
