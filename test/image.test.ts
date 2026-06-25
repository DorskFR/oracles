import assert from "node:assert/strict";
import { test } from "node:test";
import { diffPixels, padImage, type RasterImage, ssim } from "../src/core/image.js";

function solid(w: number, h: number, rgba: [number, number, number, number]): RasterImage {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { width: w, height: h, data };
}

test("ssim is 1 for identical, low for opposite", () => {
  const gray = solid(16, 16, [120, 120, 120, 255]);
  assert.ok(ssim(gray, gray) > 0.999);
  const black = solid(16, 16, [0, 0, 0, 255]);
  const white = solid(16, 16, [255, 255, 255, 255]);
  assert.ok(ssim(black, white) < 0.5);
});

test("diffPixels: 0 for identical, >0 for different", () => {
  const a = solid(8, 8, [10, 20, 30, 255]);
  const same = diffPixels(a, a);
  assert.equal(same.mismatch, 0);
  assert.equal(same.mismatchRatio, 0);
  const b = solid(8, 8, [255, 255, 255, 255]);
  const diff = diffPixels(solid(8, 8, [0, 0, 0, 255]), b);
  assert.ok(diff.mismatch > 0);
});

test("diffPixels flags dimension mismatch", () => {
  const r = diffPixels(solid(8, 8, [0, 0, 0, 255]), solid(10, 8, [0, 0, 0, 255]));
  assert.ok(r.dimensionsDiffer);
  assert.equal(r.width, 10);
});

test("padImage expands canvas", () => {
  const p = padImage(solid(4, 4, [1, 2, 3, 255]), 8, 8);
  assert.equal(p.width, 8);
  assert.equal(p.height, 8);
});
