import type { RenderContract, Viewport } from "../types.js";

export const DESKTOP: Viewport = {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  label: "desktop",
};
export const MOBILE: Viewport = { width: 390, height: 844, deviceScaleFactor: 1, label: "mobile" };

/**
 * A fixed, deterministic default environment. Both reference and subject are
 * captured under the resolved contract; mismatched contracts make any score
 * meaningless, so all knobs default to stable, reproducible values.
 */
export const DEFAULT_CONTRACT: RenderContract = {
  viewport: DESKTOP,
  fonts: [],
  waitFontsReady: true,
  disableAnimations: true,
  reducedMotion: true,
  colorScheme: "light",
  timezoneId: "UTC",
  locale: "en-US",
  // 2024-06-01T00:00:00Z — frozen so relative timestamps render identically.
  freezeClockMs: 1717200000000,
  seed: 1,
  waitUntil: "networkidle",
  settleMs: 250,
};

/** Merge a partial contract over the defaults (viewport merged shallowly). */
export function resolveContract(partial?: Partial<RenderContract>): RenderContract {
  if (!partial) return { ...DEFAULT_CONTRACT };
  return {
    ...DEFAULT_CONTRACT,
    ...partial,
    viewport: { ...DEFAULT_CONTRACT.viewport, ...(partial.viewport ?? {}) },
    fonts: partial.fonts ?? DEFAULT_CONTRACT.fonts,
  };
}
