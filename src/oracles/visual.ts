/**
 * Visual oracle — objective 3: "are we pixel-perfect on the same data?"
 *
 * Pure over two PNG buffers. Combines a raw pixel mismatch ratio (localizes
 * *where* via the diff image) with SSIM (perceptual; a uniform 1px shift tanks
 * pixelmatch but SSIM correctly reads it as near-identical structure). For
 * image-only references (a Figma PNG) this is the only runnable oracle.
 */
import { decodePng, diffPixels, type RasterImage, ssim, writePng } from "../core/image.js";
import type { Finding, OracleReport } from "../types.js";

export interface VisualOptions {
  /** Per-pixel color-distance threshold (pixelmatch). Default 0.1. */
  threshold?: number;
  /** Max acceptable mismatch ratio to pass. Default 0.02 (2%). */
  maxMismatchRatio?: number;
  /** Min acceptable SSIM to pass. Default 0.97. */
  minSsim?: number;
  /** If set, write the diff PNG here. */
  diffOut?: string;
  /** Rectangular regions (in reference pixels) to ignore (dynamic content). */
  masks?: { x: number; y: number; width: number; height: number }[];
}

function applyMasks(img: RasterImage, masks: VisualOptions["masks"]): RasterImage {
  if (!masks || masks.length === 0) return img;
  const data = Buffer.from(img.data);
  for (const m of masks) {
    for (let y = m.y; y < Math.min(img.height, m.y + m.height); y++) {
      for (let x = m.x; x < Math.min(img.width, m.x + m.width); x++) {
        const i = (y * img.width + x) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
  }
  return { width: img.width, height: img.height, data };
}

export function visualOracle(
  reference: Buffer | RasterImage,
  subject: Buffer | RasterImage,
  options: VisualOptions = {},
): OracleReport {
  const maxMismatch = options.maxMismatchRatio ?? 0.02;
  const minSsim = options.minSsim ?? 0.97;
  const refImg = applyMasks(
    Buffer.isBuffer(reference) ? decodePng(reference) : reference,
    options.masks,
  );
  const subImg = applyMasks(Buffer.isBuffer(subject) ? decodePng(subject) : subject, options.masks);

  const diff = diffPixels(refImg, subImg, { threshold: options.threshold });
  const structural = ssim(refImg, subImg);
  const artifacts: Record<string, string> = {};
  if (options.diffOut) {
    writePng(options.diffOut, diff.diff);
    artifacts.diff = options.diffOut;
  }

  const findings: Finding[] = [];
  if (diff.dimensionsDiffer) {
    findings.push({
      severity: "major",
      message: `dimensions differ: reference ${refImg.width}x${refImg.height} vs subject ${subImg.width}x${subImg.height}`,
      reference: `${refImg.width}x${refImg.height}`,
      actual: `${subImg.width}x${subImg.height}`,
    });
  }
  if (diff.mismatchRatio > maxMismatch) {
    findings.push({
      severity: "critical",
      property: "pixel-mismatch",
      message: `pixel mismatch ${(diff.mismatchRatio * 100).toFixed(2)}% exceeds ${(maxMismatch * 100).toFixed(2)}%`,
      reference: maxMismatch,
      actual: Number(diff.mismatchRatio.toFixed(4)),
    });
  }
  if (structural < minSsim) {
    findings.push({
      severity: "major",
      property: "ssim",
      message: `SSIM ${structural.toFixed(4)} below ${minSsim}`,
      reference: minSsim,
      actual: Number(structural.toFixed(4)),
    });
  }

  // Score blends structural similarity with pixel agreement.
  const score = Math.max(0, Math.min(1, 0.5 * structural + 0.5 * (1 - diff.mismatchRatio)));
  const passed =
    diff.mismatchRatio <= maxMismatch && structural >= minSsim && !diff.dimensionsDiffer;
  return {
    oracle: "visual",
    score,
    passed,
    findings,
    artifacts,
    summary: `mismatch ${(diff.mismatchRatio * 100).toFixed(2)}% · SSIM ${structural.toFixed(3)} · ${passed ? "PASS" : "FAIL"}`,
  };
}
