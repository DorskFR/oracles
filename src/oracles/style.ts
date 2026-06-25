/**
 * Style oracle — objective 2: "did we apply the correct styles/params?"
 *
 * The strongest oracle for a port, because port drift is overwhelmingly *token*
 * drift (spacing, radii, shadow, weight, color) and this compares those exactly,
 * per matched node, removing visual judgement from the loop entirely.
 *
 * Pure over two NodeRecord lists (already normalized at capture time).
 */
import { matchNodes, nodeKey } from "../core/correspondence.js";
import {
  CURATED_PROPERTIES,
  type Finding,
  type NodeRecord,
  type OracleReport,
  PROPERTY_SEVERITY,
  type Severity,
} from "../types.js";

const WEIGHT: Record<Severity, number> = { critical: 3, major: 2, minor: 1 };

export interface StyleOptions {
  /** Restrict to this property subset. Default: all curated properties. */
  properties?: string[];
  /** Skip these properties. */
  ignore?: string[];
  /** Min weighted score to pass. Default 0.95. */
  minScore?: number;
  /** Cap findings in the report. Default 200. */
  maxFindings?: number;
}

function severityOf(prop: string): Severity {
  return PROPERTY_SEVERITY[prop] ?? "minor";
}

export function styleOracle(
  reference: NodeRecord[],
  subject: NodeRecord[],
  options: StyleOptions = {},
): OracleReport {
  const minScore = options.minScore ?? 0.95;
  const ignore = new Set(options.ignore ?? []);
  const props = (options.properties ?? (CURATED_PROPERTIES as unknown as string[])).filter(
    (p) => !ignore.has(p),
  );
  const { pairs, unmatchedRef } = matchNodes(reference, subject);

  const findings: Finding[] = [];
  let totalWeight = 0;
  let failedWeight = 0;

  for (const { ref, sub } of pairs) {
    for (const p of props) {
      const rv = ref.styles[p];
      if (rv === undefined) continue;
      const sv = sub.styles[p] ?? "";
      const sev = severityOf(p);
      totalWeight += WEIGHT[sev];
      if (rv !== sv) {
        failedWeight += WEIGHT[sev];
        findings.push({
          severity: sev,
          nodeKey: nodeKey(ref),
          property: p,
          reference: rv,
          actual: sv,
          message: `${nodeKey(ref)}: ${p} ref ${rv || "∅"} / got ${sv || "∅"}`,
        });
      }
    }
  }

  // Reference nodes that have a stable id but no subject match are real gaps.
  for (const r of unmatchedRef) {
    if (r.fid) {
      const w = WEIGHT.major;
      totalWeight += w;
      failedWeight += w;
      findings.push({
        severity: "major",
        nodeKey: nodeKey(r),
        message: `missing in subject: ${nodeKey(r)} (${r.tag})`,
      });
    }
  }

  const score = totalWeight === 0 ? 1 : Math.max(0, 1 - failedWeight / totalWeight);
  const critical = findings.filter((f) => f.severity === "critical").length;
  findings.sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]);

  return {
    oracle: "style",
    score,
    passed: score >= minScore && critical === 0,
    findings: findings.slice(0, options.maxFindings ?? 200),
    artifacts: {},
    summary: `${pairs.length} matched · ${findings.length} style mismatches (${critical} critical) · score ${score.toFixed(3)}`,
  };
}
