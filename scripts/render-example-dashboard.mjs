#!/usr/bin/env node
/**
 * POST a Chart-Output render JSON spec to the API using CHART_OUTPUT_API_KEY
 * or any server's CHART_OUTPUT_API_KEY in ~/.cursor/mcp.json.
 *
 * Usage:
 *   node scripts/render-example-dashboard.mjs
 *   node scripts/render-example-dashboard.mjs examples/weekly-sales-by-plan.json assets/out.png
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadApiKey() {
  if (process.env.CHART_OUTPUT_API_KEY?.trim()) {
    return process.env.CHART_OUTPUT_API_KEY.trim();
  }
  const mcpPath = join(process.env.HOME ?? "", ".cursor", "mcp.json");
  const raw = readFileSync(mcpPath, "utf8");
  const j = JSON.parse(raw);
  for (const cfg of Object.values(j?.mcpServers ?? {})) {
    const k = cfg?.env?.CHART_OUTPUT_API_KEY;
    if (typeof k === "string" && k.trim()) return k.trim();
  }
  return null;
}

const key = loadApiKey();
if (!key) {
  console.error("Set CHART_OUTPUT_API_KEY or add chart-output.env in ~/.cursor/mcp.json");
  process.exit(1);
}

const specRel = process.argv[2] ?? join("examples", "q1-q4-revenue.json");
const specPath = specRel.startsWith("/") ? specRel : join(root, specRel);
const spec = JSON.parse(readFileSync(specPath, "utf8"));

const res = await fetch("https://www.chart-output.com/api/v1/render", {
  method: "POST",
  redirect: "follow",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify(spec),
});

if (!res.ok) {
  const text = await res.text();
  console.error(res.status, text.slice(0, 800));
  process.exit(1);
}

const ct = res.headers.get("content-type") ?? "";
if (ct.includes("application/json")) {
  console.error("Unexpected JSON:", (await res.text()).slice(0, 400));
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
const outArg = process.argv[3];
const out = outArg?.startsWith("/")
  ? outArg
  : outArg
    ? join(root, outArg)
    : join(root, "assets", basename(specPath, ".json") + ".png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log("Wrote", out, `(${buf.length} bytes)`);
