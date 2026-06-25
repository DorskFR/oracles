import { readFileSync } from "node:fs";
import { decodePng } from "../core/image.js";
import { extractTokens } from "../core/tokens.js";
import type { Reference } from "../types.js";

export interface FigmaImageOptions {
  name: string;
  /** PNG path or buffer exported from Figma at the subject's viewport/DPR. */
  image: string | Buffer;
  deviceScaleFactor?: number;
}

/**
 * A flat Figma PNG. Supports the Visual oracle only (no DOM, no styles). The
 * viewport is inferred from the image dimensions; capture the subject at the
 * same width/DPR for a valid comparison.
 */
export function figmaImageReference(o: FigmaImageOptions): Reference {
  const screenshot = typeof o.image === "string" ? readFileSync(o.image) : o.image;
  const { width, height } = decodePng(screenshot);
  return {
    name: o.name,
    artifacts: {
      name: o.name,
      screenshot,
      nodes: [],
      a11y: null,
      tokens: extractTokens([]),
      viewport: { width, height, deviceScaleFactor: o.deviceScaleFactor ?? 1 },
    },
  };
}
