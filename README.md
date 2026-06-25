# @dorsk/oracles

Framework-agnostic **UI-fidelity oracles**. Measure how faithfully an
implementation (Svelte 5 / React / any DOM) reproduces a reference (a Claude
Design `.dc.html` comp, a Figma screenshot, a Figma node spec, or another
rendered app) — with numbers, not eyeballing.

Each oracle is an **isolated, importable unit** *and* a CLI. Pure oracles never
drive a browser; capturing is the core's job, so the oracles are trivially
unit-tested. Drop the package into any project via `file:../oracles`.

## Output report

<img width="1384" height="1027" alt="Screenshot 2026-06-26 at 8 45 49" src="https://github.com/user-attachments/assets/c16ec229-e269-4fee-8965-8a4935ff43d4" />

## The model

One pinned **render contract** captures three artifacts from every target:

| Artifact | Feeds | Objective |
|---|---|---|
| screenshot | **visual** oracle | "pixel-perfect on the same data?" |
| node records (`getComputedStyle` + geometry + provenance) | **style**, **geometry**, **reuse**, **token** | "correct styles? right layout? used the library? on-token?" |
| accessibility tree | **a11y** oracle | "right semantics, not just pixels?" |

Real-DOM targets (Claude Design HTML, React, Svelte, a component story) yield all
three. A flat Figma PNG yields only the screenshot. Figma-via-API yields node
records + a PNG. The browser is the normalizer — there is **no** React/Svelte →
HTML transpiler; you render and serialize the live result.

## Install

```bash
# in a consumer project
npm i -D @dorsk/oracles
npx playwright install chromium
```

Import the whole thing or a single oracle:

```ts
import { runFidelity, claudeDesignReference, renderedApp } from "@dorsk/oracles";
import { styleOracle } from "@dorsk/oracles/style";
import { visualOracle } from "@dorsk/oracles/visual";
```

## CLI

```bash
oracles visual ref.png sub.png --out diff.png      # image-only, no browser
oracles style   <refUrl> <subUrl> [--selector S]   # computed-style diff
oracles geometry <refUrl> <subUrl>                 # bounding-box diff
oracles token    <refUrl> <subUrl>                 # design-token set diff
oracles a11y     <refUrl> <subUrl>                 # role-composition diff
oracles reuse    <url> [--selector S]              # library vs raw HTML
oracles capture  <url> [--out artifacts.json]      # dump nodes/tokens (debug)
oracles run      fidelity.config.mjs               # full multi-case run
```

## Programmatic run

```ts
import { runFidelity, formatRunResult, claudeDesignReference, renderedApp, DESKTOP } from "@dorsk/oracles";

const result = await runFidelity({
  outDir: ".oracles-out",
  contract: { viewport: DESKTOP },
  cases: [{
    name: "overview",
    reference: claudeDesignReference({ dir: ".qa/claude-design", selector: '[data-screen="overview"]' }),
    subject: renderedApp({ name: "local", url: "http://localhost:5174/", selector: "main",
      fixtures: { "**/api/collections*": { items: [] } } }),
    // omit `oracles` to auto-run every oracle the reference supports
  }],
});
console.log(formatRunResult(result));        // score table
// per-case reference.png / subject.png / diff.png / report.json under outDir
```

## The two conventions that make node-level oracles work

- **`data-fid`** — a stable correspondence id. Seed it from the reference (Claude
  Design ids / Figma layer names) and put the *same* value on the implementation.
  The style/geometry oracles match ref↔sub node by `data-fid` (falling back to
  tag+text, then tag+path). Without it they still run, with lower confidence.
- **`data-tsu` / `data-component`** — a provenance marker your component library
  stamps on its root. The reuse oracle reads it: a raw `<button>` with no marker
  and a registry entry is flagged as a reinvention. (Authoring-time complement:
  the `@dorsk/oracles/lint/no-raw-intrinsics` ESLint rule.)

## Reference adapters

| Adapter | Source | Oracles available |
|---|---|---|
| `claudeDesignReference` | self-contained `*.dc.html` | all (real DOM) |
| `renderedApp` / `staticSite` | a live URL / static bundle | all (real DOM) |
| `figmaImageReference` | a flat PNG | visual only |
| `figmaApiReference` | Figma REST (needs `FIGMA_TOKEN`) | style, geometry, token, visual |

`figmaApiReference` maps the Figma node tree into the same CSS vocabulary the
oracles speak (fills→color, effects→box-shadow, cornerRadius→radius, auto-layout
→flex/gap/padding); layer names become `data-fid`s and component instances become
provenance markers.

## Determinism

The render contract pins viewport + DPR, font readiness, animation suppression,
reduced motion, color scheme, timezone/locale, a frozen clock and a seeded RNG.
Run reference and subject in the **same** chromium (ideally one Docker image) —
anti-aliasing varies by OS/GPU and is the main source of pixel noise. Feed both
sides identical data with per-target `fixtures` (Playwright route mocks; the
harness analogue of MSW).

## Phased adoption

1. Visual + style on full pages vs the design comp (`oracles run`).
2. Add `fixtures` so visual runs on identical data; add masks for dynamic regions.
3. Reuse oracle: stamp `data-tsu`, add the ESLint rule.
4. Component isolation (Storybook/Histoire stories as targets) → component-level oracles.
5. `figmaApiReference` for Figma-first work.
6. Commit goldens; gate CI on the score table.

## Limitations

- Pixel-perfect is asymptotic — gate on a threshold + masks, not literal zero.
- Node-level oracles are only as good as correspondence; invest in `data-fid`.
- Figma auto-layout maps cleanly; absolute-positioned frames are lower-confidence.
- Font fidelity dominates pixel scores — ship the exact webfonts on both sides.

## Develop

```bash
npm test          # 19 unit + 1 browser integration test
npm run build     # tsc -> dist (with .d.ts)
npm run typecheck
```
