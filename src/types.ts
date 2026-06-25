/**
 * Shared type model for @dorsk/oracles.
 *
 * The whole system is built so that every comparable target (a full page or an
 * isolated component) is reduced to the same three artifacts under one pinned
 * render contract:
 *
 *   1. a screenshot           -> Visual oracle
 *   2. a list of NodeRecords  -> Style / Geometry / Reuse / Token oracles
 *   3. an accessibility tree  -> A11y oracle
 *
 * Real-DOM targets (Claude Design `.dc.html`, a React app, a Svelte app, a
 * component story) yield all three. A pure image (a Figma PNG) yields only the
 * screenshot. Figma-via-API yields NodeRecords + a screenshot but no live DOM.
 *
 * Oracles themselves are pure functions over already-captured artifacts; they
 * never drive a browser. Capturing is core's job. That keeps every oracle an
 * isolated, browser-free, unit-testable module.
 */

export interface Viewport {
  width: number;
  height: number;
  /** Device pixel ratio. MUST match between reference and subject. Default 1. */
  deviceScaleFactor?: number;
  label?: string;
}

export interface FontFace {
  family: string;
  /** Absolute path or URL to the font file. */
  src: string;
  weight?: string;
  style?: string;
}

/**
 * The pinned environment. A comparison is only valid when reference and subject
 * are captured under an identical contract.
 */
export interface RenderContract {
  viewport: Viewport;
  /** Extra @font-face declarations to inject so both sides use the same fonts. */
  fonts?: FontFace[];
  /** Wait for document.fonts.ready before capture. Default true. */
  waitFontsReady?: boolean;
  /** Inject CSS that kills animations/transitions. Default true. */
  disableAnimations?: boolean;
  /** Emulate prefers-reduced-motion: reduce. Default true. */
  reducedMotion?: boolean;
  colorScheme?: "light" | "dark";
  timezoneId?: string;
  locale?: string;
  /** Freeze Date.now()/new Date() to this epoch-ms for deterministic timestamps. */
  freezeClockMs?: number | null;
  /** Seed a deterministic Math.random(). */
  seed?: number | null;
  /** Playwright navigation wait condition. Default "networkidle". */
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Settle delay after load (ms). Default 250. */
  settleMs?: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One captured DOM element. The atomic unit the node-level oracles compare.
 */
export interface NodeRecord {
  /** data-fid value (correspondence key) if present, else null. */
  fid: string | null;
  tag: string;
  role: string | null;
  /** Trimmed, truncated visible text (used for fallback correspondence). */
  text: string;
  /** Structural path from the root, e.g. "main>section:nth(2)>button". */
  path: string;
  /**
   * Provenance marker: the value of the configured component attribute
   * (default `data-tsu` / `data-component`). null => raw intrinsic element.
   */
  origin: string | null;
  /** Document-space geometry (independent of scroll). */
  box: BoundingBox;
  /** Curated, normalized computed styles (see CURATED_PROPERTIES). */
  styles: Record<string, string>;
}

export interface A11yNode {
  role: string;
  name?: string;
  children?: A11yNode[];
}

/** Correspondence-free value sets actually used on a target. */
export interface TokenSet {
  colors: string[];
  backgrounds: string[];
  fontSizes: string[];
  fontWeights: string[];
  fontFamilies: string[];
  radii: string[];
  shadows: string[];
  spacings: string[];
}

/** Everything a captured target yields. */
export interface CaptureArtifacts {
  name: string;
  url?: string;
  viewport: Viewport;
  /** PNG bytes. Absent for spec-only references. */
  screenshot?: Buffer;
  nodes: NodeRecord[];
  a11y: A11yNode | null;
  tokens: TokenSet;
  meta?: Record<string, unknown>;
}

export type FixtureMap = Record<string, unknown>;

/**
 * A renderable target: something that resolves to a URL we load under the
 * contract and capture. Subjects are always renderable; references may be
 * renderable (real DOM) or pre-supplied artifacts (image / spec only).
 */
export interface RenderableTarget {
  name: string;
  /** Start any needed server and return a URL + optional cleanup. */
  resolve(): Promise<{ url: string; cleanup?: () => Promise<void> }>;
  /** Capture only this sub-element as the unit (component-level). */
  selector?: string;
  /** Deterministic data served via request interception. */
  fixtures?: FixtureMap;
  /** Per-target contract overrides. */
  contract?: Partial<RenderContract>;
}

export interface Reference {
  name: string;
  /** Real-DOM reference: captured under the contract. */
  render?: RenderableTarget;
  /** Pre-rendered reference: image-only or spec-only. */
  artifacts?: Partial<CaptureArtifacts> & { name: string };
}

export type Subject = RenderableTarget;

export type Severity = "critical" | "major" | "minor";

export interface Finding {
  severity: Severity;
  /** Correspondence key (fid / path) this finding is about, if any. */
  nodeKey?: string;
  property?: string;
  reference?: string | number | null;
  actual?: string | number | null;
  message: string;
}

export interface OracleReport {
  oracle: string;
  /** 0..1, where 1 == perfect fidelity. */
  score: number;
  passed: boolean;
  findings: Finding[];
  /** Paths to any files written (diff images, etc.). */
  artifacts: Record<string, string>;
  summary: string;
}

/** The curated computed-style properties the Style oracle compares. */
export const CURATED_PROPERTIES = [
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "color",
  "background-color",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-color",
  "border-style",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "display",
  "flex-direction",
  "align-items",
  "justify-content",
  "opacity",
] as const;

export type CuratedProperty = (typeof CURATED_PROPERTIES)[number];

/** Per-property severity weighting for the Style oracle. */
export const PROPERTY_SEVERITY: Record<string, Severity> = {
  "font-family": "critical",
  "font-size": "critical",
  "font-weight": "critical",
  color: "critical",
  "background-color": "critical",
  "box-shadow": "major",
  "border-top-left-radius": "major",
  "border-top-right-radius": "major",
  "border-bottom-right-radius": "major",
  "border-bottom-left-radius": "major",
  display: "major",
  "flex-direction": "major",
  "line-height": "major",
  "align-items": "minor",
  "justify-content": "minor",
  "letter-spacing": "minor",
};
