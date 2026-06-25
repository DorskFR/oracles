import type { BrowserContext } from "playwright";
import type { FixtureMap } from "../types.js";

export interface FixtureResponse {
  status?: number;
  contentType?: string;
  /** Object -> JSON-serialized; string -> sent verbatim. */
  body: unknown;
}

function isResponseSpec(v: unknown): v is FixtureResponse {
  return typeof v === "object" && v !== null && "body" in (v as Record<string, unknown>);
}

/**
 * Feed deterministic data to both reference and subject regardless of framework.
 * Keys are Playwright URL glob patterns (e.g. `**\/api/albums*`); values are
 * either a JSON body or a {status, contentType, body} spec. This is the harness
 * analogue of MSW — same bytes on every run, no live-backend flakiness.
 */
export async function applyFixtures(ctx: BrowserContext, fixtures: FixtureMap): Promise<void> {
  for (const [pattern, value] of Object.entries(fixtures)) {
    const spec: FixtureResponse = isResponseSpec(value) ? value : { body: value };
    await ctx.route(pattern, async (route) => {
      const isString = typeof spec.body === "string";
      await route.fulfill({
        status: spec.status ?? 200,
        contentType:
          spec.contentType ?? (isString ? "text/plain; charset=utf-8" : "application/json"),
        body: isString ? (spec.body as string) : JSON.stringify(spec.body),
      });
    });
  }
}
