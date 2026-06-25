import { normalizeStyles } from "../core/normalize.js";
import { extractTokens } from "../core/tokens.js";
import type { NodeRecord, Reference } from "../types.js";

/** Minimal subset of the Figma REST node shape we consume. */
interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}
interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
}
interface FigmaEffect {
  type: string;
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}
interface FigmaTypeStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textAlignHorizontal?: string;
}
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  characters?: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  effects?: FigmaEffect[];
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  style?: FigmaTypeStyle;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  opacity?: number;
  children?: FigmaNode[];
}

function cssColor(c: FigmaColor, opacity = 1): string {
  const a = Math.round((c.a ?? 1) * opacity * 1000) / 1000;
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

const TAG_BY_TYPE: Record<string, string> = {
  TEXT: "span",
  VECTOR: "svg",
  RECTANGLE: "div",
  FRAME: "div",
  GROUP: "div",
  COMPONENT: "div",
  INSTANCE: "div",
};

/**
 * Pure mapping: Figma node tree -> NodeRecords in the same CSS vocabulary the
 * Style/Geometry/Token oracles use. Layer names become correspondence ids;
 * component instances become provenance markers (feeding the Reuse oracle).
 */
export function figmaToNodeRecords(root: FigmaNode): NodeRecord[] {
  const ox = root.absoluteBoundingBox?.x ?? 0;
  const oy = root.absoluteBoundingBox?.y ?? 0;
  const out: NodeRecord[] = [];

  const visit = (node: FigmaNode): void => {
    const bb = node.absoluteBoundingBox;
    if (bb) {
      const raw: Record<string, string> = {};
      const fill = (node.fills ?? []).find(
        (f) => f.visible !== false && f.type === "SOLID" && f.color,
      );
      if (fill?.color) {
        if (node.type === "TEXT") raw["color"] = cssColor(fill.color, fill.opacity ?? 1);
        else raw["background-color"] = cssColor(fill.color, fill.opacity ?? 1);
      }
      const st = node.style;
      if (st) {
        if (st.fontFamily) raw["font-family"] = st.fontFamily;
        if (st.fontWeight != null) raw["font-weight"] = String(st.fontWeight);
        if (st.fontSize != null) raw["font-size"] = `${st.fontSize}px`;
        if (st.lineHeightPx != null) raw["line-height"] = `${Math.round(st.lineHeightPx)}px`;
        if (st.letterSpacing != null) raw["letter-spacing"] = `${st.letterSpacing}px`;
        if (st.textAlignHorizontal) raw["text-align"] = st.textAlignHorizontal.toLowerCase();
      }
      const shadow = (node.effects ?? []).find(
        (e) => e.visible !== false && e.type === "DROP_SHADOW",
      );
      if (shadow?.color && shadow.offset) {
        raw["box-shadow"] =
          `${shadow.offset.x}px ${shadow.offset.y}px ${shadow.radius ?? 0}px ${shadow.spread ?? 0}px ${cssColor(shadow.color)}`;
      }
      const radii =
        node.rectangleCornerRadii ??
        (node.cornerRadius != null
          ? [node.cornerRadius, node.cornerRadius, node.cornerRadius, node.cornerRadius]
          : null);
      if (radii) {
        raw["border-top-left-radius"] = `${radii[0]}px`;
        raw["border-top-right-radius"] = `${radii[1]}px`;
        raw["border-bottom-right-radius"] = `${radii[2]}px`;
        raw["border-bottom-left-radius"] = `${radii[3]}px`;
      }
      const stroke = (node.strokes ?? []).find(
        (s) => s.visible !== false && s.type === "SOLID" && s.color,
      );
      if (stroke?.color && node.strokeWeight) {
        raw["border-top-width"] = `${node.strokeWeight}px`;
        raw["border-top-color"] = cssColor(stroke.color);
        raw["border-style"] = "solid";
      }
      if (node.layoutMode && node.layoutMode !== "NONE") {
        raw["display"] = "flex";
        raw["flex-direction"] = node.layoutMode === "HORIZONTAL" ? "row" : "column";
        if (node.itemSpacing != null) raw["gap"] = `${node.itemSpacing}px`;
      }
      if (node.paddingTop != null) raw["padding-top"] = `${node.paddingTop}px`;
      if (node.paddingRight != null) raw["padding-right"] = `${node.paddingRight}px`;
      if (node.paddingBottom != null) raw["padding-bottom"] = `${node.paddingBottom}px`;
      if (node.paddingLeft != null) raw["padding-left"] = `${node.paddingLeft}px`;

      out.push({
        fid: node.name.trim() || node.id,
        tag: TAG_BY_TYPE[node.type] ?? "div",
        role: null,
        text: (node.characters ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        path: node.name.trim() || node.id,
        origin: node.type === "INSTANCE" || node.type === "COMPONENT" ? node.name : null,
        box: {
          x: Math.round(bb.x - ox),
          y: Math.round(bb.y - oy),
          width: Math.round(bb.width),
          height: Math.round(bb.height),
        },
        styles: normalizeStyles(raw),
      });
    }
    for (const c of node.children ?? []) visit(c);
  };

  visit(root);
  return out;
}

export interface FigmaApiOptions {
  name: string;
  fileKey: string;
  /** Node id of the frame to compare (e.g. "12:345"). */
  nodeId: string;
  /** Personal access token. Falls back to FIGMA_TOKEN env. */
  token?: string;
  /** Image export scale. Default 2. */
  scale?: number;
}

/**
 * Fetch a Figma frame as a first-class reference: NodeRecords (style/geometry/
 * token oracles) plus a PNG export (visual oracle). Requires a Figma token.
 */
export async function figmaApiReference(o: FigmaApiOptions): Promise<Reference> {
  const token = o.token ?? process.env.FIGMA_TOKEN;
  if (!token) throw new Error("figmaApiReference: missing token (pass `token` or set FIGMA_TOKEN)");
  const headers = { "X-Figma-Token": token };

  const nodesRes = await fetch(
    `https://api.figma.com/v1/files/${o.fileKey}/nodes?ids=${encodeURIComponent(o.nodeId)}`,
    { headers },
  );
  if (!nodesRes.ok)
    throw new Error(`figma nodes fetch failed: ${nodesRes.status} ${nodesRes.statusText}`);
  const nodesJson = (await nodesRes.json()) as { nodes: Record<string, { document: FigmaNode }> };
  const doc = nodesJson.nodes[o.nodeId]?.document;
  if (!doc) throw new Error(`figma node ${o.nodeId} not found in file ${o.fileKey}`);
  const nodes = figmaToNodeRecords(doc);

  let screenshot: Buffer | undefined;
  try {
    const imgRes = await fetch(
      `https://api.figma.com/v1/images/${o.fileKey}?ids=${encodeURIComponent(o.nodeId)}&scale=${o.scale ?? 2}&format=png`,
      { headers },
    );
    const imgJson = (await imgRes.json()) as { images: Record<string, string | null> };
    const pngUrl = imgJson.images[o.nodeId];
    if (pngUrl) screenshot = Buffer.from(await (await fetch(pngUrl)).arrayBuffer());
  } catch {
    screenshot = undefined;
  }

  const bb = doc.absoluteBoundingBox;
  return {
    name: o.name,
    artifacts: {
      name: o.name,
      screenshot,
      nodes,
      a11y: null,
      tokens: extractTokens(nodes),
      viewport: {
        width: Math.round(bb?.width ?? 0),
        height: Math.round(bb?.height ?? 0),
        deviceScaleFactor: o.scale ?? 2,
      },
    },
  };
}
