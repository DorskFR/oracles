/**
 * ESLint rule (authoring-time complement to the runtime Reuse oracle): flags raw
 * intrinsic elements that have a library equivalent, e.g. `<button>` -> Button.
 * Works on JSX (React) and Svelte element nodes. Loosely typed so the package
 * carries no hard `eslint` dependency — wire it into a flat config as a plugin
 * rule. The runtime Reuse oracle catches what slips past lint (copy-paste, dynamic).
 */

interface RuleContextLike {
  options: unknown[];
  report(descriptor: { node: unknown; messageId: string; data?: Record<string, string> }): void;
}

export interface NoRawIntrinsicsConfig {
  /** Intrinsic tag -> component it should be. */
  banned?: Record<string, string>;
  /** Tags to never flag. */
  allow?: string[];
}

const DEFAULT_BANNED: Record<string, string> = {
  button: "Button",
  input: "Input",
  select: "Select",
  textarea: "Textarea",
};

export const noRawIntrinsics = {
  meta: {
    type: "suggestion" as const,
    docs: { description: "Use library components instead of raw intrinsic elements." },
    schema: [
      {
        type: "object",
        properties: {
          banned: { type: "object", additionalProperties: { type: "string" } },
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: { useComponent: "Use the {{component}} component instead of a raw <{{tag}}>." },
  },
  create(context: RuleContextLike) {
    const opts = (context.options[0] ?? {}) as NoRawIntrinsicsConfig;
    const banned = opts.banned ?? DEFAULT_BANNED;
    const allow = new Set(opts.allow ?? []);
    const check = (name: string | undefined, node: unknown) => {
      if (!name || allow.has(name)) return;
      const component = banned[name];
      if (component)
        context.report({ node, messageId: "useComponent", data: { tag: name, component } });
    };
    return {
      // React / JSX
      JSXOpeningElement(node: { name?: { type?: string; name?: string } }) {
        if (node.name?.type === "JSXIdentifier") check(node.name.name, node);
      },
      // Svelte (eslint-plugin-svelte): raw HTML elements
      SvelteElement(node: { kind?: string; name?: { name?: string } }) {
        if (node.kind === "html") check(node.name?.name, node);
      },
    };
  },
};

export default noRawIntrinsics;
