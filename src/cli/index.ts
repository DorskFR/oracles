#!/usr/bin/env node
/**
 * `oracles` CLI. Each oracle is runnable on its own; `run` drives a full config.
 *
 *   oracles visual <ref.png> <sub.png> [--out diff.png]
 *   oracles style|geometry|token|a11y <refUrl> <subUrl> [--selector S]
 *   oracles reuse <url> [--selector S]
 *   oracles capture <url> [--selector S] [--out artifacts.json]
 *   oracles run <config.{json,mjs,js}>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Harness } from "../core/capture.js";
import { resolveContract } from "../core/render-contract.js";
import { a11yOracle } from "../oracles/a11y.js";
import { geometryOracle } from "../oracles/geometry.js";
import { reuseOracle } from "../oracles/reuse.js";
import { styleOracle } from "../oracles/style.js";
import { tokenOracle } from "../oracles/token.js";
import { visualOracle } from "../oracles/visual.js";
import { renderedApp } from "../references/rendered-app.js";
import { type FidelityConfig, formatRunResult, runFidelity } from "../runner.js";
import type { CaptureArtifacts, OracleReport } from "../types.js";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function printReport(r: OracleReport): void {
  console.log(`\n[${r.oracle}] ${r.passed ? "PASS" : "FAIL"} — ${r.summary}`);
  for (const f of r.findings.slice(0, 20)) console.log(`  (${f.severity}) ${f.message}`);
  if (r.findings.length > 20) console.log(`  … +${r.findings.length - 20} more`);
  for (const [k, v] of Object.entries(r.artifacts)) console.log(`  ${k}: ${v}`);
}

async function captureUrl(url: string, selector?: string): Promise<CaptureArtifacts> {
  const harness = await Harness.launch();
  try {
    return await harness.capture(renderedApp({ name: url, url, selector }), resolveContract());
  } finally {
    await harness.close();
  }
}

async function captureBoth(
  refUrl: string,
  subUrl: string,
  selector?: string,
): Promise<[CaptureArtifacts, CaptureArtifacts]> {
  const harness = await Harness.launch();
  try {
    const ref = await harness.capture(
      renderedApp({ name: refUrl, url: refUrl, selector }),
      resolveContract(),
    );
    const sub = await harness.capture(
      renderedApp({ name: subUrl, url: subUrl, selector }),
      resolveContract(),
    );
    return [ref, sub];
  } finally {
    await harness.close();
  }
}

async function main(): Promise<number> {
  const [cmd, ...args] = process.argv.slice(2);
  const selector = flag(args, "selector");

  switch (cmd) {
    case "visual": {
      const [ref, sub] = args;
      if (!ref || !sub)
        throw new Error("usage: oracles visual <ref.png> <sub.png> [--out diff.png]");
      const report = visualOracle(readFileSync(ref), readFileSync(sub), {
        diffOut: flag(args, "out"),
      });
      printReport(report);
      return report.passed ? 0 : 1;
    }
    case "style":
    case "geometry":
    case "token":
    case "a11y": {
      const [refUrl, subUrl] = args;
      if (!refUrl || !subUrl)
        throw new Error(`usage: oracles ${cmd} <refUrl> <subUrl> [--selector S]`);
      const [ref, sub] = await captureBoth(refUrl, subUrl, selector);
      const report =
        cmd === "style"
          ? styleOracle(ref.nodes, sub.nodes)
          : cmd === "geometry"
            ? geometryOracle(ref.nodes, sub.nodes)
            : cmd === "token"
              ? tokenOracle(ref.tokens, sub.tokens)
              : a11yOracle(ref.a11y, sub.a11y);
      printReport(report);
      return report.passed ? 0 : 1;
    }
    case "reuse": {
      const [url] = args;
      if (!url) throw new Error("usage: oracles reuse <url> [--selector S]");
      const sub = await captureUrl(url, selector);
      const report = reuseOracle(sub.nodes);
      printReport(report);
      return report.passed ? 0 : 1;
    }
    case "capture": {
      const [url] = args;
      if (!url)
        throw new Error("usage: oracles capture <url> [--selector S] [--out artifacts.json]");
      const art = await captureUrl(url, selector);
      const json = JSON.stringify(
        { ...art, screenshot: art.screenshot ? "<png>" : undefined },
        null,
        2,
      );
      const out = flag(args, "out");
      if (out) writeFileSync(out, json);
      else console.log(json);
      console.log(
        `\ncaptured ${art.nodes.length} nodes · ${art.tokens.colors.length} colors · ${art.tokens.fontSizes.length} font-sizes`,
      );
      return 0;
    }
    case "run": {
      const [cfgPath] = args;
      if (!cfgPath) throw new Error("usage: oracles run <config.{json,mjs,js}>");
      const abs = resolve(process.cwd(), cfgPath);
      const config: FidelityConfig = abs.endsWith(".json")
        ? JSON.parse(readFileSync(abs, "utf8"))
        : ((await import(pathToFileURL(abs).href)).default as FidelityConfig);
      const result = await runFidelity(config);
      console.log(formatRunResult(result));
      return result.passed ? 0 : 1;
    }
    default:
      console.log("commands: visual | style | geometry | token | reuse | a11y | capture | run");
      return cmd ? 1 : 0;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
