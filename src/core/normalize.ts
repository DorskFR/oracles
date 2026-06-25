/**
 * CSS value canonicalization. Both sides of a comparison are normalized to the
 * same canonical form before diffing so that cosmetic serialization differences
 * (quotes, casing, `0` vs `0px`, color spelling) don't read as fidelity errors.
 *
 * Pure functions only — unit-tested without a browser.
 */

const NAMED_COLORS: Record<string, [number, number, number, number]> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
  red: [255, 0, 0, 1],
  green: [0, 128, 0, 1],
  blue: [0, 0, 255, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
};

const FONT_WEIGHTS: Record<string, string> = {
  normal: "400",
  bold: "700",
  lighter: "300",
  bolder: "700",
};

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Parse any CSS color into canonical `rgb(r, g, b)` / `rgba(r, g, b, a)`. */
export function normalizeColor(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value) return "";
  let rgba: [number, number, number, number] | null = null;

  if (value in NAMED_COLORS) {
    rgba = NAMED_COLORS[value]!;
  } else if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      const a = hex.length === 4 ? parseInt(hex[3]! + hex[3]!, 16) / 255 : 1;
      rgba = [r, g, b, a];
    } else if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      rgba = [r, g, b, a];
    }
  } else {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1]!.split(/[,/\s]+/).filter(Boolean);
      if (parts.length >= 3) {
        const r = clamp255(parseFloat(parts[0]!));
        const g = clamp255(parseFloat(parts[1]!));
        const b = clamp255(parseFloat(parts[2]!));
        const a = parts.length >= 4 ? parseFloat(parts[3]!) : 1;
        rgba = [r, g, b, Number.isFinite(a) ? a : 1];
      }
    }
  }

  if (!rgba) return value; // unrecognized — return trimmed/lowercased as-is
  const [r, g, b, a] = rgba;
  const alpha = Math.round(a * 1000) / 1000;
  return alpha >= 1
    ? `rgb(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)})`
    : `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${alpha})`;
}

/** Round lengths; collapse `0px`/`0em` -> `0`; keep non-px units verbatim. */
export function normalizeLength(input: string): string {
  const value = input.trim().toLowerCase();
  if (value === "0px" || value === "0em" || value === "0rem" || value === "0%") return "0";
  const m = value.match(/^(-?\d*\.?\d+)(px|em|rem|%|vh|vw|pt)?$/);
  if (!m) return value;
  const num = Math.round(parseFloat(m[1]!) * 100) / 100;
  const unit = m[2] ?? "";
  if (num === 0) return "0";
  return `${num}${unit}`;
}

/** Lowercase, strip quotes, collapse whitespace, normalize the family stack. */
export function normalizeFontFamily(input: string): string {
  return input
    .split(",")
    .map((f) =>
      f
        .trim()
        .toLowerCase()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, " "),
    )
    .filter(Boolean)
    .join(", ");
}

export function normalizeFontWeight(input: string): string {
  const v = input.trim().toLowerCase();
  return FONT_WEIGHTS[v] ?? v;
}

/** Light box-shadow normalization: collapse whitespace and canonicalize colors. */
export function normalizeShadow(input: string): string {
  const value = input.trim().toLowerCase();
  if (value === "none" || value === "") return "none";
  return value
    .replace(/rgba?\([^)]+\)/g, (m) => normalizeColor(m))
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ");
}

const COLOR_PROPS = /color$|^fill$|^stroke$/;
const LENGTH_PROPS =
  /width$|radius$|^font-size$|^letter-spacing$|^line-height$|padding|margin|^gap$|^top$|^left$/;

/** Dispatch normalization by property name. */
export function normalizeProperty(prop: string, value: string): string {
  const v = (value ?? "").trim();
  if (v === "") return "";
  if (prop === "font-family") return normalizeFontFamily(v);
  if (prop === "font-weight") return normalizeFontWeight(v);
  if (prop === "box-shadow") return normalizeShadow(v);
  if (prop === "line-height" && v.toLowerCase() === "normal") return "normal";
  if (COLOR_PROPS.test(prop)) return normalizeColor(v);
  if (LENGTH_PROPS.test(prop)) return normalizeLength(v);
  return v.toLowerCase();
}

/** Normalize a whole computed-style record. */
export function normalizeStyles(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(raw)) out[k] = normalizeProperty(k, val);
  return out;
}
