import { type Browser, type BrowserContext, chromium } from "playwright";
import type { RenderContract } from "../types.js";

/**
 * An init script (runs before any page script) that pins the two biggest
 * sources of non-determinism: the clock and the RNG. Injected into every
 * context so reference and subject share the same "now" and random stream.
 */
export function buildInitScript(contract: RenderContract): string {
  const parts: string[] = [];
  if (contract.freezeClockMs != null) {
    parts.push(`(() => {
      const FIXED = ${contract.freezeClockMs};
      const _Date = Date;
      class FrozenDate extends _Date {
        constructor(...args) { if (args.length === 0) super(FIXED); else super(...args); }
        static now() { return FIXED; }
      }
      // @ts-ignore
      globalThis.Date = FrozenDate;
      try { globalThis.performance.now = () => 0; } catch {}
    })();`);
  }
  if (contract.seed != null) {
    parts.push(`(() => {
      let s = ${contract.seed} >>> 0;
      Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    })();`);
  }
  return parts.join("\n");
}

/** CSS injected after load to remove motion and rendering noise. */
export function stabilizerCss(): string {
  return `*, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }`;
}

export async function launchChromium(): Promise<Browser> {
  return chromium.launch({ args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
}

/** Create a context whose emulation matches the contract. */
export async function newContextFor(
  browser: Browser,
  contract: RenderContract,
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: contract.viewport.width, height: contract.viewport.height },
    deviceScaleFactor: contract.viewport.deviceScaleFactor ?? 1,
    colorScheme: contract.colorScheme ?? "light",
    reducedMotion: contract.reducedMotion ? "reduce" : "no-preference",
    timezoneId: contract.timezoneId,
    locale: contract.locale,
  });
  // Shim esbuild's `__name` helper: functions passed to page.evaluate() may be
  // transpiled (under tsx/esbuild keep-names) to reference `__name`, which does
  // not exist in the browser realm. Harmless when running the tsc-built dist.
  await ctx.addInitScript("globalThis.__name = globalThis.__name || function (f) { return f; };");
  const init = buildInitScript(contract);
  if (init) await ctx.addInitScript(init);
  return ctx;
}
