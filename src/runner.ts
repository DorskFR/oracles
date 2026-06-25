import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CaptureOptions, Harness } from "./core/capture.js";
import { resolveContract } from "./core/render-contract.js";
import { extractTokens } from "./core/tokens.js";
import { type A11yOptions, a11yOracle } from "./oracles/a11y.js";
import { type GeometryOptions, geometryOracle } from "./oracles/geometry.js";
import { type ReuseOptions, reuseOracle } from "./oracles/reuse.js";
import { type StyleOptions, styleOracle } from "./oracles/style.js";
import { type TokenOptions, tokenOracle } from "./oracles/token.js";
import { type VisualOptions, visualOracle } from "./oracles/visual.js";
import { writeReport } from "./report.js";
import type {
  CaptureArtifacts,
  OracleReport,
  Reference,
  RenderableTarget,
  RenderContract,
} from "./types.js";

export interface OracleSelection {
  visual?: boolean | VisualOptions;
  style?: boolean | StyleOptions;
  geometry?: boolean | GeometryOptions;
  reuse?: boolean | ReuseOptions;
  token?: boolean | TokenOptions;
  a11y?: boolean | A11yOptions;
}

export interface CaseSpec {
  name: string;
  reference: Reference;
  subject: RenderableTarget;
  /** Per-case oracle selection/overrides. Omitted oracles auto-enable when the reference supports them. */
  oracles?: OracleSelection;
  contract?: Partial<RenderContract>;
  capture?: CaptureOptions;
}

export interface FidelityConfig {
  /** Where diff images / per-case JSON are written. Default ".oracles-out". */
  outDir?: string;
  contract?: Partial<RenderContract>;
  capture?: CaptureOptions;
  /** Defaults applied to every case. */
  oracles?: OracleSelection;
  cases: CaseSpec[];
}

export interface CaseResult {
  name: string;
  reports: OracleReport[];
  passed: boolean;
  outDir: string;
}

export interface RunResult {
  results: CaseResult[];
  passed: boolean;
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "_");
}

function resolveOpt<T extends object>(
  value: boolean | T | undefined,
  available: boolean,
): T | false {
  if (value === false) return false;
  if (value === undefined) return available ? ({} as T) : false; // auto
  if (value === true) return {} as T;
  return value;
}

async function materializeReference(
  ref: Reference,
  harness: Harness,
  contract: RenderContract,
  capture: CaptureOptions,
): Promise<CaptureArtifacts> {
  if (ref.render) return harness.capture(ref.render, contract, capture);
  const a = ref.artifacts;
  if (!a) throw new Error(`reference "${ref.name}" has neither render nor artifacts`);
  const nodes = a.nodes ?? [];
  return {
    name: a.name,
    url: a.url,
    viewport: a.viewport ?? contract.viewport,
    screenshot: a.screenshot,
    nodes,
    a11y: a.a11y ?? null,
    tokens: a.tokens ?? extractTokens(nodes),
  };
}

/** Run all configured oracles for one case against captured artifacts. */
export function runOracles(
  reference: CaptureArtifacts,
  subject: CaptureArtifacts,
  selection: OracleSelection,
  outDir: string,
): OracleReport[] {
  const reports: OracleReport[] = [];
  const hasRefNodes = reference.nodes.length > 0;
  const hasShots = !!reference.screenshot && !!subject.screenshot;
  const hasA11y = !!reference.a11y && !!subject.a11y;

  const visual = resolveOpt<VisualOptions>(selection.visual, hasShots);
  if (visual && reference.screenshot && subject.screenshot) {
    reports.push(
      visualOracle(reference.screenshot, subject.screenshot, {
        diffOut: join(outDir, "diff.png"),
        ...visual,
      }),
    );
  }
  const style = resolveOpt<StyleOptions>(selection.style, hasRefNodes);
  if (style && hasRefNodes) reports.push(styleOracle(reference.nodes, subject.nodes, style));

  const geometry = resolveOpt<GeometryOptions>(selection.geometry, hasRefNodes);
  if (geometry && hasRefNodes)
    reports.push(geometryOracle(reference.nodes, subject.nodes, geometry));

  const token = resolveOpt<TokenOptions>(selection.token, hasRefNodes);
  if (token && hasRefNodes) reports.push(tokenOracle(reference.tokens, subject.tokens, token));

  const reuse = resolveOpt<ReuseOptions>(selection.reuse, true);
  if (reuse) reports.push(reuseOracle(subject.nodes, reuse));

  const a11y = resolveOpt<A11yOptions>(selection.a11y, hasA11y);
  if (a11y && hasA11y) reports.push(a11yOracle(reference.a11y, subject.a11y, a11y));

  return reports;
}

export async function runFidelity(config: FidelityConfig, harnessIn?: Harness): Promise<RunResult> {
  const outRoot = config.outDir ?? ".oracles-out";
  mkdirSync(outRoot, { recursive: true });
  const harness = harnessIn ?? (await Harness.launch());
  const results: CaseResult[] = [];
  try {
    for (const c of config.cases) {
      const contract = resolveContract({ ...config.contract, ...c.contract });
      const capture: CaptureOptions = { ...config.capture, ...c.capture };
      const caseDir = join(outRoot, sanitize(c.name));
      mkdirSync(caseDir, { recursive: true });

      const reference = await materializeReference(c.reference, harness, contract, capture);
      const subject = await harness.capture(c.subject, contract, capture);

      if (reference.screenshot) writeFileSync(join(caseDir, "reference.png"), reference.screenshot);
      if (subject.screenshot) writeFileSync(join(caseDir, "subject.png"), subject.screenshot);

      const selection: OracleSelection = { ...config.oracles, ...c.oracles };
      const reports = runOracles(reference, subject, selection, caseDir);
      const passed = reports.every((r) => r.passed);
      writeFileSync(
        join(caseDir, "report.json"),
        JSON.stringify({ name: c.name, passed, reports }, null, 2),
      );
      results.push({ name: c.name, reports, passed, outDir: caseDir });
    }
  } finally {
    if (!harnessIn) await harness.close();
  }
  const passed = results.every((r) => r.passed);
  writeFileSync(join(outRoot, "summary.json"), JSON.stringify({ passed, results }, null, 2));
  const runResult: RunResult = { results, passed };
  writeReport(runResult, outRoot);
  return runResult;
}

/** Human-readable score table. */
export function formatRunResult(result: RunResult): string {
  const lines: string[] = [];
  for (const c of result.results) {
    lines.push(`\n${c.passed ? "✓" : "✗"} ${c.name}`);
    for (const r of c.reports) {
      lines.push(`    ${r.passed ? "·" : "!"} ${r.oracle.padEnd(9)} ${r.summary}`);
    }
  }
  lines.push(`\n${result.passed ? "ALL PASS" : "FAIL"} — ${result.results.length} case(s)`);
  return lines.join("\n");
}
