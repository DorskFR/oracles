import type { NodeRecord, TokenSet } from "../types.js";

const TRANSPARENT = new Set(["", "transparent", "rgba(0, 0, 0, 0)", "none", "0"]);

function add(set: Set<string>, value: string | undefined): void {
  if (value == null) return;
  const v = value.trim();
  if (v && !TRANSPARENT.has(v)) set.add(v);
}

/**
 * Correspondence-free extraction of the *set of values actually used* across a
 * target. Powers the Token oracle ("did we stay on the design system?") without
 * needing any node-to-node matching.
 */
export function extractTokens(nodes: NodeRecord[]): TokenSet {
  const colors = new Set<string>();
  const backgrounds = new Set<string>();
  const fontSizes = new Set<string>();
  const fontWeights = new Set<string>();
  const fontFamilies = new Set<string>();
  const radii = new Set<string>();
  const shadows = new Set<string>();
  const spacings = new Set<string>();

  for (const n of nodes) {
    const s = n.styles;
    add(colors, s["color"]);
    add(backgrounds, s["background-color"]);
    add(fontSizes, s["font-size"]);
    add(fontWeights, s["font-weight"]);
    add(fontFamilies, s["font-family"]);
    for (const p of [
      "border-top-left-radius",
      "border-top-right-radius",
      "border-bottom-right-radius",
      "border-bottom-left-radius",
    ]) {
      add(radii, s[p]);
    }
    add(shadows, s["box-shadow"]);
    for (const p of [
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "gap",
    ]) {
      add(spacings, s[p]);
    }
  }

  const sorted = (s: Set<string>) => Array.from(s).sort();
  return {
    colors: sorted(colors),
    backgrounds: sorted(backgrounds),
    fontSizes: sorted(fontSizes),
    fontWeights: sorted(fontWeights),
    fontFamilies: sorted(fontFamilies),
    radii: sorted(radii),
    shadows: sorted(shadows),
    spacings: sorted(spacings),
  };
}
