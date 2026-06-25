import { readFileSync, writeFileSync } from "node:fs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, length = width * height * 4. */
  data: Buffer;
}

export function decodePng(input: Buffer | string): RasterImage {
  const buf = typeof input === "string" ? readFileSync(input) : input;
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}

export function encodePng(img: RasterImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  img.data.copy(png.data);
  return PNG.sync.write(png);
}

export function writePng(path: string, img: RasterImage): void {
  writeFileSync(path, encodePng(img));
}

/** Pad an image onto a transparent canvas of (w,h), top-left anchored. */
export function padImage(img: RasterImage, w: number, h: number): RasterImage {
  if (img.width === w && img.height === h) return img;
  const out = Buffer.alloc(w * h * 4, 0);
  for (let y = 0; y < Math.min(h, img.height); y++) {
    for (let x = 0; x < Math.min(w, img.width); x++) {
      const si = (y * img.width + x) * 4;
      const di = (y * w + x) * 4;
      out[di] = img.data[si]!;
      out[di + 1] = img.data[si + 1]!;
      out[di + 2] = img.data[si + 2]!;
      out[di + 3] = img.data[si + 3]!;
    }
  }
  return { width: w, height: h, data: out };
}

export interface PixelDiffResult {
  width: number;
  height: number;
  /** Number of differing pixels. */
  mismatch: number;
  /** mismatch / totalPixels, 0..1. */
  mismatchRatio: number;
  /** True when the two inputs had different dimensions. */
  dimensionsDiffer: boolean;
  diff: RasterImage;
}

/**
 * Pixel diff via pixelmatch. Inputs of differing size are padded to their union
 * so the size delta surfaces in the diff rather than throwing.
 */
export function diffPixels(
  a: RasterImage,
  b: RasterImage,
  options: { threshold?: number; includeAA?: boolean } = {},
): PixelDiffResult {
  const dimensionsDiffer = a.width !== b.width || a.height !== b.height;
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const pa = padImage(a, w, h);
  const pb = padImage(b, w, h);
  const diff = new PNG({ width: w, height: h });
  const mismatch = pixelmatch(pa.data, pb.data, diff.data, w, h, {
    threshold: options.threshold ?? 0.1,
    includeAA: options.includeAA ?? false,
    alpha: 0.5,
    diffColor: [255, 0, 0],
  });
  return {
    width: w,
    height: h,
    mismatch,
    mismatchRatio: mismatch / (w * h),
    dimensionsDiffer,
    diff: { width: w, height: h, data: diff.data },
  };
}

function toGray(img: RasterImage): Float64Array {
  const g = new Float64Array(img.width * img.height);
  for (let i = 0; i < g.length; i++) {
    const o = i * 4;
    // Rec. 601 luma
    g[i] = 0.299 * img.data[o]! + 0.587 * img.data[o + 1]! + 0.114 * img.data[o + 2]!;
  }
  return g;
}

/**
 * Mean SSIM over non-overlapping 8x8 windows on the luma channel. Returns 1.0
 * for identical images and decreases with structural divergence. Pads inputs to
 * a common size first. Complements the raw pixel ratio, which over-penalizes a
 * uniform 1px shift that SSIM correctly treats as near-identical structure.
 */
export function ssim(a: RasterImage, b: RasterImage): number {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const ga = toGray(padImage(a, w, h));
  const gb = toGray(padImage(b, w, h));
  const win = 8;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0;
  let count = 0;
  for (let by = 0; by + win <= h; by += win) {
    for (let bx = 0; bx + win <= w; bx += win) {
      let ma = 0;
      let mb = 0;
      for (let y = 0; y < win; y++) {
        for (let x = 0; x < win; x++) {
          const i = (by + y) * w + (bx + x);
          ma += ga[i]!;
          mb += gb[i]!;
        }
      }
      const n = win * win;
      ma /= n;
      mb /= n;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let y = 0; y < win; y++) {
        for (let x = 0; x < win; x++) {
          const i = (by + y) * w + (bx + x);
          const da = ga[i]! - ma;
          const db = gb[i]! - mb;
          va += da * da;
          vb += db * db;
          cov += da * db;
        }
      }
      va /= n - 1;
      vb /= n - 1;
      cov /= n - 1;
      const s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      total += s;
      count++;
    }
  }
  return count === 0 ? 1 : total / count;
}
