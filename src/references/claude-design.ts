import type { Reference } from "../types.js";
import { staticSite } from "./rendered-app.js";

export interface ClaudeDesignOptions {
  name?: string;
  /** Directory containing the exported design comp (e.g. `.qa/claude-design`). */
  dir: string;
  /** The comp HTML file. Default "design.dc.html". */
  file?: string;
  /** Slice a single screen/component out of the comp. */
  selector?: string;
}

/**
 * A Claude Design export (`*.dc.html`) is self-contained real DOM, so it yields
 * all three artifacts — the strongest available reference. Serves the directory
 * and loads the comp file under the contract.
 */
export function claudeDesignReference(o: ClaudeDesignOptions): Reference {
  const target = staticSite({
    name: o.name ?? "claude-design",
    dir: o.dir,
    file: o.file ?? "design.dc.html",
    selector: o.selector,
  });
  return { name: target.name, render: target };
}
