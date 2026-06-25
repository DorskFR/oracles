/**
 * Accessibility-tree oracle — "right semantics, not just right pixels."
 *
 * Compares the role composition of two accessibility trees. Catches "looks
 * right, wrong markup" (a div styled as a button, a missing landmark/heading)
 * that pixel and style oracles can't see. Pure over two A11yNode trees.
 */
import type { A11yNode, Finding, OracleReport } from "../types.js";

const IMPORTANT = new Set([
  "heading",
  "button",
  "link",
  "navigation",
  "main",
  "banner",
  "contentinfo",
  "list",
  "textbox",
  "img",
  "dialog",
]);

function roleCounts(tree: A11yNode | null): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (n: A11yNode) => {
    counts.set(n.role, (counts.get(n.role) ?? 0) + 1);
    for (const c of n.children ?? []) visit(c);
  };
  if (tree) visit(tree);
  return counts;
}

export interface A11yOptions {
  /** Min score to pass. Default 0.9. */
  minScore?: number;
  maxFindings?: number;
}

export function a11yOracle(
  reference: A11yNode | null,
  subject: A11yNode | null,
  options: A11yOptions = {},
): OracleReport {
  const minScore = options.minScore ?? 0.9;
  const refCounts = roleCounts(reference);
  const subCounts = roleCounts(subject);
  const roles = new Set<string>([...refCounts.keys(), ...subCounts.keys()]);

  const findings: Finding[] = [];
  let totalRef = 0;
  let diffTotal = 0;

  for (const role of roles) {
    const r = refCounts.get(role) ?? 0;
    const s = subCounts.get(role) ?? 0;
    totalRef += r;
    const d = Math.abs(r - s);
    diffTotal += d;
    if (d !== 0) {
      const missing = s < r;
      const important = IMPORTANT.has(role);
      findings.push({
        severity: missing && important ? "major" : "minor",
        property: "role",
        reference: r,
        actual: s,
        message: `role "${role}": reference ${r} / subject ${s}`,
      });
    }
  }

  const score = totalRef === 0 ? 1 : Math.max(0, 1 - diffTotal / Math.max(totalRef, 1));
  findings.sort(
    (a, b) =>
      Math.abs(Number(b.reference) - Number(b.actual)) -
      Math.abs(Number(a.reference) - Number(a.actual)),
  );
  return {
    oracle: "a11y",
    score,
    passed: score >= minScore,
    findings: findings.slice(0, options.maxFindings ?? 100),
    artifacts: {},
    summary: `${roles.size} roles · ${findings.length} divergent · score ${score.toFixed(3)}`,
  };
}
