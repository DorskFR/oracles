/**
 * Token oracle — "did we stay on the design system?"
 *
 * Correspondence-free: compares the *set of values used* by the subject against
 * the reference's set (plus any explicitly-allowed extras). Catches off-token
 * magic numbers/colors anywhere on the page without needing node matching.
 *
 * Pure over two TokenSets.
 */
import type { Finding, OracleReport, TokenSet } from "../types.js";

export interface TokenOptions {
  /** Extra permitted values per category, unioned with the reference set. */
  extraAllowed?: Partial<TokenSet>;
  /** Restrict to these categories. Default: all. */
  categories?: (keyof TokenSet)[];
  /** Min fraction of used values that are on-token, to pass. Default 0.9. */
  minScore?: number;
  maxFindings?: number;
}

const ALL_CATEGORIES: (keyof TokenSet)[] = [
  "colors",
  "backgrounds",
  "fontSizes",
  "fontWeights",
  "fontFamilies",
  "radii",
  "shadows",
  "spacings",
];

export function tokenOracle(
  reference: TokenSet,
  subject: TokenSet,
  options: TokenOptions = {},
): OracleReport {
  const minScore = options.minScore ?? 0.9;
  const categories = options.categories ?? ALL_CATEGORIES;
  const findings: Finding[] = [];
  let used = 0;
  let onToken = 0;

  for (const cat of categories) {
    const permitted = new Set<string>([
      ...(reference[cat] ?? []),
      ...((options.extraAllowed?.[cat] as string[]) ?? []),
    ]);
    for (const value of subject[cat] ?? []) {
      used++;
      if (permitted.has(value)) {
        onToken++;
      } else {
        findings.push({
          severity: cat === "colors" || cat === "fontSizes" ? "major" : "minor",
          property: cat,
          actual: value,
          message: `off-token ${cat}: ${value} (not in the reference set)`,
        });
      }
    }
  }

  const score = used === 0 ? 1 : onToken / used;
  return {
    oracle: "token",
    score,
    passed: score >= minScore,
    findings: findings.slice(0, options.maxFindings ?? 200),
    artifacts: {},
    summary: `${onToken}/${used} values on-token · ${findings.length} off-token · score ${score.toFixed(3)}`,
  };
}
