import type { Browser, BrowserContext } from "playwright";
import { applyFixtures } from "../fixtures/intercept.js";
import type {
  A11yNode,
  CaptureArtifacts,
  NodeRecord,
  RenderableTarget,
  RenderContract,
} from "../types.js";
import { CURATED_PROPERTIES } from "../types.js";
import { launchChromium, newContextFor, stabilizerCss } from "./browser.js";
import { normalizeStyles } from "./normalize.js";
import { extractTokens } from "./tokens.js";

export interface CaptureOptions {
  /** Capture a screenshot. Default true. */
  screenshot?: boolean;
  /** Full-page vs viewport-clipped screenshot. Default false (deterministic). */
  fullPage?: boolean;
  /** Attributes read as the provenance marker, first hit wins. */
  componentAttributes?: string[];
  /** Cap on captured nodes (guards against huge pages). Default 600. */
  maxNodes?: number;
}

const SIGNIFICANT_TAGS = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "img",
  "svg",
  "header",
  "nav",
  "main",
  "section",
  "article",
  "aside",
  "footer",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "form",
  "dialog",
  "figure",
];

interface WalkArgs {
  selector: string | null;
  componentAttrs: string[];
  maxNodes: number;
  curated: readonly string[];
  significantTags: string[];
}

/** Runs in the browser. Self-contained — no outer-scope references. */
function pageWalk(args: WalkArgs): Omit<NodeRecord, never>[] {
  const { selector, componentAttrs, maxNodes, curated, significantTags } = args;
  const root: Element =
    (selector ? document.querySelector(selector) : document.body) ?? document.body;
  if (!root) return [];
  const sig = new Set(significantTags);

  const roleOf = (el: Element): string | null => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const t = el.tagName.toLowerCase();
    const map: Record<string, string> = {
      button: "button",
      a: "link",
      nav: "navigation",
      main: "main",
      header: "banner",
      footer: "contentinfo",
      h1: "heading",
      h2: "heading",
      h3: "heading",
      h4: "heading",
      h5: "heading",
      h6: "heading",
      img: "img",
      ul: "list",
      ol: "list",
      li: "listitem",
      table: "table",
      input: "textbox",
      select: "combobox",
      textarea: "textbox",
    };
    return map[t] ?? null;
  };

  const pathOf = (el: Element): string => {
    const segs: string[] = [];
    let cur: Element | null = el;
    let depth = 0;
    while (cur && cur !== root.parentElement && depth < 12) {
      const tag = cur.tagName.toLowerCase();
      const parent: Element | null = cur.parentElement;
      let idx = 1;
      if (parent) {
        let i = 0;
        for (const sib of Array.from(parent.children)) {
          if (sib.tagName === cur.tagName) i++;
          if (sib === cur) {
            idx = i;
            break;
          }
        }
      }
      segs.unshift(`${tag}:nth(${idx})`);
      if (cur === root) break;
      cur = parent;
      depth++;
    }
    return segs.join(">");
  };

  const significant = (el: Element, cs: CSSStyleDeclaration): boolean => {
    if (sig.has(el.tagName.toLowerCase())) return true;
    if (
      cs.backgroundColor &&
      cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      cs.backgroundColor !== "transparent"
    )
      return true;
    if (cs.boxShadow && cs.boxShadow !== "none") return true;
    if (parseFloat(cs.borderTopWidth) > 0) return true;
    if (parseFloat(cs.borderTopLeftRadius) > 0) return true;
    return false;
  };

  const out: NodeRecord[] = [];
  const candidates: Element[] = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const el of candidates) {
    if (out.length >= maxNodes) break;
    const fid = el.getAttribute("data-fid");
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (!fid && !significant(el, cs)) continue;
    const rect = el.getBoundingClientRect();
    if (!fid && rect.width === 0 && rect.height === 0) continue;

    const styles: Record<string, string> = {};
    for (const p of curated) styles[p] = cs.getPropertyValue(p);

    let origin: string | null = null;
    for (const a of componentAttrs) {
      const v = el.getAttribute(a);
      if (v != null) {
        origin = v || a;
        break;
      }
    }

    out.push({
      fid: fid || null,
      tag: el.tagName.toLowerCase(),
      role: roleOf(el),
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
      path: pathOf(el),
      origin,
      box: {
        x: Math.round(rect.x + window.scrollX),
        y: Math.round(rect.y + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      styles,
    });
  }
  return out;
}

/**
 * Parse Playwright's `ariaSnapshot()` YAML into a role tree. Lines look like
 * `- heading "Title" [level=1]`; we keep role + accessible name and nest by
 * indentation. The A11y oracle only needs role composition, so this is enough.
 */
function parseAriaSnapshot(yaml: string): A11yNode {
  const root: A11yNode = { role: "document", children: [] };
  const stack: { indent: number; node: A11yNode }[] = [{ indent: -1, node: root }];
  for (const line of yaml.split("\n")) {
    if (!line.trim()) continue;
    const indent = (line.match(/^ */)?.[0] ?? "").length;
    let s = line.trim();
    if (s.startsWith("- ")) s = s.slice(2);
    const roleMatch = s.match(/^([a-zA-Z][\w-]*)/);
    if (!roleMatch) continue;
    const nameMatch = s.match(/"([^"]*)"/);
    const node: A11yNode = { role: roleMatch[1]!, name: nameMatch?.[1], children: [] };
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    stack[stack.length - 1]!.node.children!.push(node);
    stack.push({ indent, node });
  }
  return root;
}

/**
 * Owns a single browser process and captures targets under a contract. Each
 * capture runs in its own context for isolation (fresh fixtures, clean state).
 */
export class Harness {
  private constructor(private readonly browser: Browser) {}

  static async launch(): Promise<Harness> {
    return new Harness(await launchChromium());
  }

  async capture(
    target: RenderableTarget,
    contract: RenderContract,
    options: CaptureOptions = {},
  ): Promise<CaptureArtifacts> {
    const componentAttributes = options.componentAttributes ?? ["data-tsu", "data-component"];
    const maxNodes = options.maxNodes ?? 600;
    const { url, cleanup } = await target.resolve();
    let ctx: BrowserContext | null = null;
    try {
      ctx = await newContextFor(this.browser, contract);
      if (target.fixtures) await applyFixtures(ctx, target.fixtures);
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: contract.waitUntil ?? "networkidle", timeout: 30000 });

      if (contract.disableAnimations) await page.addStyleTag({ content: stabilizerCss() });
      for (const f of contract.fonts ?? []) {
        await page.addStyleTag({
          content: `@font-face{font-family:'${f.family}';src:url('${f.src}');font-weight:${f.weight ?? "normal"};font-style:${f.style ?? "normal"};}`,
        });
      }
      if (contract.waitFontsReady) await page.evaluate(() => (document as Document).fonts.ready);
      await page.waitForTimeout(contract.settleMs ?? 250);
      await page.evaluate(() => window.scrollTo(0, 0));

      const rawNodes = await page.evaluate(pageWalk, {
        selector: target.selector ?? null,
        componentAttrs: componentAttributes,
        maxNodes,
        curated: CURATED_PROPERTIES as unknown as string[],
        significantTags: SIGNIFICANT_TAGS,
      });
      const nodes: NodeRecord[] = rawNodes.map((n) => ({
        ...n,
        styles: normalizeStyles(n.styles),
      }));

      let a11y: A11yNode | null = null;
      try {
        const ariaLoc = page.locator(target.selector ?? "body").first();
        a11y = parseAriaSnapshot(await ariaLoc.ariaSnapshot());
      } catch {
        a11y = null;
      }

      let screenshot: Buffer | undefined;
      if (options.screenshot !== false) {
        screenshot = target.selector
          ? await page.locator(target.selector).first().screenshot()
          : await page.screenshot({ fullPage: options.fullPage ?? false });
      }

      return {
        name: target.name,
        url,
        viewport: contract.viewport,
        screenshot,
        nodes,
        a11y,
        tokens: extractTokens(nodes),
      };
    } finally {
      if (ctx) await ctx.close();
      if (cleanup) await cleanup();
    }
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
