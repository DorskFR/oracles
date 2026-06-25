import assert from "node:assert/strict";
import { test } from "node:test";
import { Harness } from "../src/core/capture.js";
import { resolveContract } from "../src/core/render-contract.js";
import { serveHtml } from "../src/core/server.js";
import { geometryOracle } from "../src/oracles/geometry.js";
import { reuseOracle } from "../src/oracles/reuse.js";
import { styleOracle } from "../src/oracles/style.js";
import { visualOracle } from "../src/oracles/visual.js";
import type { RenderableTarget } from "../src/types.js";

const page = (btnBg: string, pad: string, radius: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; font-family: Arial, sans-serif; background: #ffffff; }
    main { padding: 24px; }
    .cta { background: ${btnBg}; color: #fff; padding: ${pad}; border-radius: ${radius}; border: 0; font-size: 16px; }
  </style></head><body>
    <main>
      <h1 data-fid="title">Library</h1>
      <button data-fid="cta" data-tsu="button" class="cta">Add</button>
    </main>
  </body></html>`;

const target = (html: string): RenderableTarget => ({
  name: "t",
  resolve: async () => {
    const s = await serveHtml(html);
    return { url: s.url, cleanup: s.close };
  },
});

test("full pipeline: identical => pass, mutated => fail", { timeout: 90_000 }, async () => {
  const h = await Harness.launch();
  try {
    const contract = resolveContract({
      viewport: { width: 420, height: 300, deviceScaleFactor: 1 },
    });
    const base = await h.capture(target(page("rgb(0, 0, 0)", "12px 20px", "8px")), contract);
    const same = await h.capture(target(page("rgb(0, 0, 0)", "12px 20px", "8px")), contract);
    const mutated = await h.capture(target(page("rgb(220, 0, 0)", "4px 8px", "2px")), contract);

    // capture actually found the instrumented nodes + provenance
    const cta = base.nodes.find((n) => n.fid === "cta");
    assert.ok(cta, "cta node captured");
    assert.equal(cta!.origin, "button", "data-tsu read as provenance");
    assert.ok(base.screenshot && base.screenshot.length > 0, "screenshot captured");

    // identical render
    const styleSame = styleOracle(base.nodes, same.nodes);
    assert.equal(styleSame.score, 1, "identical => style score 1");
    assert.ok(styleSame.passed);
    const visualSame = visualOracle(base.screenshot!, same.screenshot!);
    assert.ok(visualSame.passed, "identical => visual pass");
    assert.ok(geometryOracle(base.nodes, same.nodes).passed, "identical => geometry pass");

    // mutated render
    const styleMut = styleOracle(base.nodes, mutated.nodes);
    assert.ok(!styleMut.passed, "mutated => style fail");
    assert.ok(
      styleMut.findings.some((f) => f.property === "background-color"),
      "bg mismatch surfaced",
    );
    const visualMut = visualOracle(base.screenshot!, mutated.screenshot!);
    assert.ok(visualMut.score < visualSame.score, "mutated => lower visual score");

    // reuse: the only intrinsic-with-equivalent (button) carries a marker
    assert.equal(reuseOracle(base.nodes).score, 1, "button uses library marker");
  } finally {
    await h.close();
  }
});
