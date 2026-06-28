/**
 * ESLint rule (authoring-time guard): bans the `:global(...)` escape hatch in
 * Svelte `<style>` blocks. The point is to force consumers to reach for the
 * design-system component's own props/variants (or a real wrapping element)
 * instead of piercing a third-party component's scoped styles. Sibling to
 * `no-raw-intrinsics` — same philosophy: don't reach around the library.
 *
 * Genuinely unavoidable cases (styling rows a library renders, dynamic/{@html}
 * content) carry an explicit `// eslint-disable-next-line @dorsk/oracles/no-global -- reason`
 * so every exception is greppable and justified.
 *
 * Loosely typed so the package carries no hard `eslint`/`svelte-eslint-parser`
 * dependency — wire it into a flat config as a plugin rule. Requires the Svelte
 * files to be parsed by `svelte-eslint-parser` (which emits `SvelteStyleElement`).
 */

interface SourceCodeLike {
  getText(node?: unknown): string;
  getLocFromIndex(index: number): { line: number; column: number };
}

interface RuleContextLike {
  options: unknown[];
  sourceCode?: SourceCodeLike;
  getSourceCode?(): SourceCodeLike;
  report(descriptor: {
    loc: { start: { line: number; column: number }; end: { line: number; column: number } };
    messageId: string;
  }): void;
}

interface StyleNodeLike {
  range?: [number, number];
}

export interface NoGlobalConfig {
  /** When false, also flag commented-out `:global` occurrences. Default true:
   *  matches are reported wherever they appear in the style text. */
  ignoreComments?: boolean;
}

// `:global` as a whole token — the pseudo-selector `:global(...)` or the
// (deprecated) `:global { ... }` block form. Word-boundary so `:globalish`
// (hypothetical) doesn't match.
const GLOBAL_RE = /:global\b/g;

// A documented opt-out marker, e.g. `/* allow-global: styling DataTable rows */`.
const ALLOW_RE = /allow-global\b/i;

// Strip /* ... */ CSS comments (replaced with same-length blanks to preserve
// offsets) so commented-out `:global` isn't flagged when ignoreComments is on.
function blankComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
}

export const noGlobal = {
  meta: {
    type: "suggestion" as const,
    docs: {
      description:
        "Disallow the :global() escape hatch in Svelte <style>; use component props/variants instead.",
    },
    schema: [
      {
        type: "object",
        properties: { ignoreComments: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      noGlobal:
        "Avoid :global() — reach for the component's props/variants (or a real wrapping element). If genuinely unavoidable (e.g. styling rows a library renders), add a `/* allow-global: <reason> */` comment on the same line or the line above. (ESLint disable-comments do NOT work inside Svelte <style>.)",
    },
  },
  create(context: RuleContextLike) {
    const opts = (context.options[0] ?? {}) as NoGlobalConfig;
    const ignoreComments = opts.ignoreComments !== false;
    const sourceCode = context.sourceCode ?? context.getSourceCode?.();
    if (!sourceCode) return {};

    const scan = (node: StyleNodeLike) => {
      const start = node.range?.[0] ?? 0;
      const raw = sourceCode.getText(node);
      // A `/* allow-global: reason */` marker exempts a :global on the SAME line
      // or the NEXT line (eslint-disable doesn't reach into Svelte <style>, so
      // this is the documented, greppable opt-out). Detect from the raw text
      // (before comments are blanked).
      const exemptLines = new Set<number>();
      raw.split("\n").forEach((line, i) => {
        if (ALLOW_RE.test(line)) {
          exemptLines.add(i);
          exemptLines.add(i + 1);
        }
      });
      const text = ignoreComments ? blankComments(raw) : raw;
      GLOBAL_RE.lastIndex = 0;
      let m: RegExpExecArray | null = GLOBAL_RE.exec(text);
      while (m !== null) {
        const lineIdx = text.slice(0, m.index).split("\n").length - 1;
        if (!exemptLines.has(lineIdx)) {
          const idx = start + m.index;
          context.report({
            loc: {
              start: sourceCode.getLocFromIndex(idx),
              end: sourceCode.getLocFromIndex(idx + m[0].length),
            },
            messageId: "noGlobal",
          });
        }
        m = GLOBAL_RE.exec(text);
      }
    };

    return {
      // svelte-eslint-parser emits the <style> block as SvelteStyleElement.
      SvelteStyleElement: scan,
    };
  },
};

export default noGlobal;
