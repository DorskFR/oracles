/**
 * Reuse oracle — objective 1: "did we use the library, or hand-roll raw HTML?"
 *
 * Not pixels, not styles: *provenance*. Subject-only. Relies on library
 * components stamping a marker (default `data-tsu` / `data-component`, read at
 * capture time into NodeRecord.origin). A raw intrinsic element that has a known
 * library equivalent is flagged as a reinvention.
 *
 * Pure over one NodeRecord list.
 */
import { nodeKey } from "../core/correspondence.js";
import type { Finding, NodeRecord, OracleReport } from "../types.js";

export interface ReuseOptions {
  /** Intrinsic tag -> the library component it should be. */
  registry?: Record<string, string>;
  /** fid/path substrings exempt from the rule (e.g. intentionally-raw areas). */
  allowlist?: string[];
  /** Min reuse ratio to pass. Default 0.8. */
  minRatio?: number;
  maxFindings?: number;
}

const DEFAULT_REGISTRY: Record<string, string> = {
  button: "Button",
  input: "Input",
  select: "Select",
  textarea: "Textarea",
};

export function reuseOracle(subject: NodeRecord[], options: ReuseOptions = {}): OracleReport {
  const registry = options.registry ?? DEFAULT_REGISTRY;
  const minRatio = options.minRatio ?? 0.8;
  const allow = options.allowlist ?? [];
  const exempt = (n: NodeRecord) =>
    allow.some((a) => (n.fid ?? "").includes(a) || n.path.includes(a));

  const findings: Finding[] = [];
  let libraryNodes = 0;
  let rawWithEquivalent = 0;

  for (const n of subject) {
    if (n.origin) {
      libraryNodes++;
      continue;
    }
    const equivalent = registry[n.tag];
    if (equivalent && !exempt(n)) {
      rawWithEquivalent++;
      findings.push({
        severity: "major",
        nodeKey: nodeKey(n),
        property: "component-reuse",
        actual: `<${n.tag}>`,
        reference: `<${equivalent}>`,
        message: `${nodeKey(n)}: raw <${n.tag}> should use the ${equivalent} component`,
      });
    }
  }

  const denom = libraryNodes + rawWithEquivalent;
  const ratio = denom === 0 ? 1 : libraryNodes / denom;
  return {
    oracle: "reuse",
    score: ratio,
    passed: ratio >= minRatio,
    findings: findings.slice(0, options.maxFindings ?? 200),
    artifacts: {},
    summary: `reuse ${(ratio * 100).toFixed(0)}% · ${libraryNodes} library / ${rawWithEquivalent} raw-with-equivalent · score ${ratio.toFixed(3)}`,
  };
}
