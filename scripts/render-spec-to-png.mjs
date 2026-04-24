/**
 * Renders a Chart-Output card/JSON file to a PNG (same endpoint as the MCP).
 * Usage: CHART_OUTPUT_API_KEY=... node scripts/render-spec-to-png.mjs <input.json> <out.png>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = "https://www.chart-output.com/api/v1/render";
const [,, inFile, outFile] = process.argv;
const key = process.env.CHART_OUTPUT_API_KEY;

if (!inFile || !outFile) {
  console.error("Usage: CHART_OUTPUT_API_KEY=... node scripts/render-spec-to-png.mjs <input.json> <out.png>");
  process.exit(1);
}
if (!key) {
  console.error("Set CHART_OUTPUT_API_KEY (see https://www.chart-output.com/docs/quick-start)");
  process.exit(2);
}

const body = JSON.parse(readFileSync(inFile, "utf8"));
const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify(body),
  redirect: "follow",
});

const buf = Buffer.from(await res.arrayBuffer());
if (!res.ok) {
  console.error(String(res.status), buf.toString("utf8").slice(0, 500));
  process.exit(1);
}
const png = buf.subarray(0, 8);
if (png[0] !== 0x89) {
  console.error("Expected PNG, got:", buf.toString("utf8").slice(0, 200));
  process.exit(1);
}
writeFileSync(outFile, buf);
console.log("Wrote", outFile, `(${buf.length} bytes)`);
