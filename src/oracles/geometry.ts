/**
 * Geometry oracle — "is everything the right size and in the right place?"
 *
 * The most noise-robust signal: ignores color, fonts and anti-aliasing, compares
 * only bounding boxes of matched nodes. Catches layout drift that pixel diffs
 * conflate with styling and that style diffs miss entirely.
 *
 * Pure over two NodeRecord lists.
 */
import { matchNodes, nodeKey } from "../core/correspondence.js";
import type { Finding, NodeRecord, OracleReport } from "../types.js";

export interface GeometryOptions {
  /** Absolute tolerance in CSS px for x/y/w/h. Default 2. */
  tolerancePx?: number;
  /** Min fraction of matched nodes within tolerance to pass. Default 0.9. */
  minScore?: number;
  maxFindings?: number;
}

export function geometryOracle(
  reference: NodeRecord[],
  subject: NodeRecord[],
  options: GeometryOptions = {},
): OracleReport {
  const tol = options.tolerancePx ?? 2;
  const minScore = options.minScore ?? 0.9;
  const { pairs } = matchNodes(reference, subject);

  const findings: Finding[] = [];
  let within = 0;

  for (const { ref, sub } of pairs) {
    const dx = Math.abs(ref.box.x - sub.box.x);
    const dy = Math.abs(ref.box.y - sub.box.y);
    const dw = Math.abs(ref.box.width - sub.box.width);
    const dh = Math.abs(ref.box.height - sub.box.height);
    const worst = Math.max(dx, dy, dw, dh);
    if (worst <= tol) {
      within++;
    } else {
      const sev = worst > tol * 8 ? "major" : "minor";
      findings.push({
        severity: sev,
        nodeKey: nodeKey(ref),
        property: "box",
        reference: `${ref.box.width}x${ref.box.height}@${ref.box.x},${ref.box.y}`,
        actual: `${sub.box.width}x${sub.box.height}@${sub.box.x},${sub.box.y}`,
        message: `${nodeKey(ref)}: box off by Δ${worst}px (dx${dx} dy${dy} dw${dw} dh${dh})`,
      });
    }
  }

  const score = pairs.length === 0 ? 1 : within / pairs.length;
  findings.sort((a, b) => {
    const pa = Number(String(a.actual)) || 0;
    const pb = Number(String(b.actual)) || 0;
    return pb - pa;
  });
  return {
    oracle: "geometry",
    score,
    passed: score >= minScore,
    findings: findings.slice(0, options.maxFindings ?? 200),
    artifacts: {},
    summary: `${within}/${pairs.length} nodes within ${tol}px · score ${score.toFixed(3)}`,
  };
}
