import { serveDirectory } from "../core/server.js";
import type { FixtureMap, RenderableTarget, RenderContract } from "../types.js";

export interface RenderedAppOptions {
  name: string;
  /** A live URL (a route on your dev server / a deployed page). */
  url: string;
  /** Capture only this sub-element (component-level). */
  selector?: string;
  fixtures?: FixtureMap;
  contract?: Partial<RenderContract>;
}

/** A live app/page reached over HTTP — usable as a subject or a reference. */
export function renderedApp(o: RenderedAppOptions): RenderableTarget {
  return {
    name: o.name,
    selector: o.selector,
    fixtures: o.fixtures,
    contract: o.contract,
    resolve: async () => ({ url: o.url }),
  };
}

export interface StaticSiteOptions {
  name: string;
  /** Directory to serve statically. */
  dir: string;
  /** File served at "/". Default "index.html". */
  file?: string;
  selector?: string;
  fixtures?: FixtureMap;
  contract?: Partial<RenderContract>;
}

/** A self-contained static bundle on disk (served on an ephemeral port). */
export function staticSite(o: StaticSiteOptions): RenderableTarget {
  return {
    name: o.name,
    selector: o.selector,
    fixtures: o.fixtures,
    contract: o.contract,
    resolve: async () => {
      const site = await serveDirectory(o.dir, o.file ?? "index.html");
      return { url: site.url, cleanup: site.close };
    },
  };
}
