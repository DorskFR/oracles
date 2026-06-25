import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseResult, RunResult } from "./runner.js";
import type { Finding, OracleReport } from "./types.js";

/** Read a PNG as a data URI, or return null if missing. */
function dataUri(path: string): string | null {
  if (!existsSync(path)) return null;
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function pct(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

const SEV_RANK = { critical: 0, major: 1, minor: 2 } as const;

function findingsTable(findings: Finding[]): string {
  if (findings.length === 0) return `<p class="ok">No mismatches.</p>`;
  const rows = [...findings]
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    .map(
      (f) => `<tr class="sev-${f.severity}">
        <td class="sev">${esc(f.severity)}</td>
        <td class="node">${esc(f.nodeKey ?? "")}</td>
        <td class="prop">${esc(f.property ?? "")}</td>
        <td class="ref">${f.reference != null ? esc(f.reference) : ""}</td>
        <td class="got">${f.actual != null ? esc(f.actual) : ""}</td>
        <td class="msg">${esc(f.message)}</td>
      </tr>`,
    )
    .join("\n");
  return `<table class="findings">
    <colgroup><col class="c-sev"><col class="c-node"><col class="c-prop"><col class="c-ref"><col class="c-got"><col class="c-msg"></colgroup>
    <thead><tr><th>severity</th><th>node</th><th>property</th><th>reference</th><th>got</th><th>detail</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function oracleBlock(r: OracleReport): string {
  const badge = r.passed ? "pass" : "fail";
  return `<section class="oracle ${badge}">
    <h3><span class="badge ${badge}">${r.passed ? "PASS" : "FAIL"}</span>
      ${esc(r.oracle)} <span class="score">${pct(r.score)}</span></h3>
    <p class="summary">${esc(r.summary)}</p>
    ${findingsTable(r.findings)}
  </section>`;
}

function imagePanel(caseDir: string): string {
  const ref = dataUri(join(caseDir, "reference.png"));
  const sub = dataUri(join(caseDir, "subject.png"));
  const diff = dataUri(join(caseDir, "diff.png"));
  if (!ref && !sub) return "";
  const cell = (label: string, uri: string | null) =>
    uri
      ? `<figure><figcaption>${label}</figcaption><img src="${uri}" alt="${label}"></figure>`
      : "";
  return `<div class="images">
    ${cell("reference", ref)}
    ${cell("subject", sub)}
    ${cell("diff", diff)}
  </div>`;
}

function caseBlock(c: CaseResult): string {
  const badge = c.passed ? "pass" : "fail";
  return `<article class="case ${badge}" id="case-${esc(c.name)}">
    <h2><span class="badge ${badge}">${c.passed ? "PASS" : "FAIL"}</span> ${esc(c.name)}</h2>
    ${imagePanel(c.outDir)}
    ${c.reports.map(oracleBlock).join("\n")}
  </article>`;
}

const STYLE = `
:root { color-scheme: light dark; --pass:#1a7f37; --fail:#cf222e; --bg:#fff; --fg:#1f2328; --mut:#656d76; --line:#d0d7de; }
@media (prefers-color-scheme: dark){ :root{ --bg:#0d1117; --fg:#e6edf3; --mut:#8b949e; --line:#30363d; } }
* { box-sizing: border-box; }
body { margin:0; font:14px/1.5 ui-sans-serif,system-ui,sans-serif; background:var(--bg); color:var(--fg); }
header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line); padding:16px 24px; z-index:2; }
header h1 { margin:0 0 4px; font-size:18px; }
header .meta { color:var(--mut); font-size:13px; }
main { padding:0 24px 64px; max-width:1400px; }
.badge { display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; font-weight:700; color:#fff; vertical-align:middle; }
.badge.pass { background:var(--pass); } .badge.fail { background:var(--fail); }
.case { border:1px solid var(--line); border-radius:10px; margin:24px 0; padding:16px 20px; }
.case.fail { border-color:var(--fail); }
.case > h2 { margin:0 0 12px; font-size:16px; }
.images { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:12px 0 20px; }
.images figure { margin:0; border:1px solid var(--line); border-radius:6px; overflow:hidden; background:#888; }
.images figcaption { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--mut); padding:4px 8px; background:var(--bg); }
.images img { display:block; width:100%; height:auto; cursor:zoom-in; }
/* click-to-zoom lightbox */
#lightbox { position:fixed; inset:0; background:rgba(0,0,0,.85); display:none; align-items:center; justify-content:center; z-index:10; cursor:zoom-out; padding:24px; }
#lightbox.open { display:flex; }
#lightbox img { max-width:100%; max-height:100%; box-shadow:0 8px 40px rgba(0,0,0,.6); }
.oracle { border-top:1px solid var(--line); padding:12px 0; }
.oracle h3 { margin:0 0 4px; font-size:14px; display:flex; align-items:center; gap:8px; }
.oracle .score { color:var(--mut); font-weight:600; margin-left:auto; }
.summary { margin:0 0 8px; color:var(--mut); }
.ok { color:var(--pass); margin:4px 0; }
table.findings { width:100%; border-collapse:collapse; font-size:12px; font-family:ui-monospace,monospace; table-layout:fixed; }
table.findings th, table.findings td { text-align:left; padding:4px 8px; border-bottom:1px solid var(--line); vertical-align:top; overflow-wrap:anywhere; word-break:break-word; }
table.findings th { color:var(--mut); font-weight:600; position:sticky; }
table.findings col.c-sev { width:64px; } table.findings col.c-node { width:14%; } table.findings col.c-prop { width:14%; }
table.findings col.c-ref, table.findings col.c-got { width:16%; } table.findings col.c-msg { width:auto; }
.sev { font-weight:700; text-transform:uppercase; font-size:10px; }
.sev-critical .sev { color:var(--fail); } .sev-major .sev { color:#bf8700; } .sev-minor .sev { color:var(--mut); }
.ref { color:var(--pass); } .got { color:var(--fail); }
.nav { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.nav a { font-size:12px; text-decoration:none; padding:2px 8px; border:1px solid var(--line); border-radius:999px; color:var(--fg); }
.nav a.fail { border-color:var(--fail); color:var(--fail); }
`;

/** Render a full run into a single self-contained HTML report. */
export function renderReportHtml(result: RunResult, title = "Oracle fidelity report"): string {
  const total = result.results.length;
  const failed = result.results.filter((r) => !r.passed).length;
  const nav = result.results
    .map(
      (c) =>
        `<a href="#case-${esc(c.name)}" class="${c.passed ? "pass" : "fail"}">${c.passed ? "✓" : "✗"} ${esc(c.name)}</a>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body>
<header>
  <h1>${esc(title)} <span class="badge ${failed ? "fail" : "pass"}">${failed ? `${failed}/${total} FAIL` : "ALL PASS"}</span></h1>
  <div class="meta">${total} case(s) · generated ${esc(new Date().toISOString())}</div>
  <nav class="nav">${nav}</nav>
</header>
<main>${result.results.map(caseBlock).join("\n")}</main>
<div id="lightbox"><img alt="enlarged"></div>
<script>
(function(){
  var lb=document.getElementById("lightbox"), big=lb.querySelector("img");
  document.querySelectorAll(".images img").forEach(function(im){
    im.addEventListener("click",function(){ big.src=im.src; lb.classList.add("open"); });
  });
  lb.addEventListener("click",function(){ lb.classList.remove("open"); big.src=""; });
  document.addEventListener("keydown",function(e){ if(e.key==="Escape") lb.classList.remove("open"); });
})();
</script>
</body></html>`;
}

/** Write report.html into outDir and return its path. */
export function writeReport(result: RunResult, outDir: string, title?: string): string {
  const path = join(outDir, "report.html");
  writeFileSync(path, renderReportHtml(result, title));
  return path;
}
