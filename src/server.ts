import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function getExamplesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
}

function loadExampleIds(): string[] {
  const dir = getExamplesDir();
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json"))
    .sort();
}

// Use www host: apex chart-output.com returns 308 with body "Redirecting..."; clients that
// don't follow redirects save that text as if it were image bytes.
const API_BASE = "https://www.chart-output.com";
const apiKey = process.env.CHART_OUTPUT_API_KEY ?? null;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

function chartOutputHttpError(
  status: number,
  body: Record<string, unknown>,
  statusText: string
): Error {
  const msg =
    typeof body.error === "string" ? body.error : (body.message as string) ?? statusText;
  if (status === 401) {
    return new Error(
      `Chart-Output error 401: ${msg}. Set CHART_OUTPUT_API_KEY to your API key and use Authorization: Bearer (see https://www.chart-output.com/docs/quick-start).`
    );
  }
  return new Error(`Chart-Output error ${status}: ${msg}`);
}

const extensionsSchema = z
  .record(z.unknown())
  .optional()
  .describe(
    "Optional Chart-Output dashboard fields merged first, then overridden by type/labels/datasets/width/height/format. Use for backgroundColor, kpiStrip, header, footer, theme, brandKitId, borderRadius, legend, options (partial), etc."
  );

function buildChartRenderBody(args: {
  extensions?: Record<string, unknown>;
  type: string;
  labels: string[];
  datasets: unknown[];
  width: number;
  height: number;
  format: string;
  title?: string;
  returnUrl?: boolean;
}): Record<string, unknown> {
  const { extensions, type, labels, datasets, width, height, format, title, returnUrl } = args;
  const body: Record<string, unknown> = {
    ...(extensions ?? {}),
    type,
    width,
    height,
    format,
    data: { labels, datasets },
  };
  if (returnUrl) {
    body.returnUrl = true;
  }
  if (title) {
    const opts = (body.options as Record<string, unknown> | undefined) ?? {};
    const plugins = (opts.plugins as Record<string, unknown> | undefined) ?? {};
    body.options = {
      ...opts,
      plugins: {
        ...plugins,
        title: { display: true, text: title },
      },
    };
  }
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRenderUrl(value: string): string | null {
  const url = value.trim();
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  if (url.startsWith("/")) {
    return new URL(url, API_BASE).toString();
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      return parsed.toString();
    }
    if (parsed.protocol === "http:" && parsed.hostname.endsWith("chart-output.com")) {
      parsed.protocol = "https:";
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function findRenderUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeRenderUrl(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findRenderUrl(item);
      if (url) return url;
    }
  }
  if (isRecord(value)) {
    for (const key of ["url", "cdnUrl", "imageUrl", "renderUrl", "href", "src"]) {
      const url = findRenderUrl(value[key]);
      if (url) return url;
    }
    for (const nested of Object.values(value)) {
      const url = findRenderUrl(nested);
      if (url) return url;
    }
  }

  return null;
}

function normalizeCardSpec(spec: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = { ...spec };

  // Common user shape: root labels/datasets from render_chart payload.
  const labels = Array.isArray(body.labels) ? body.labels : undefined;
  const datasets = Array.isArray(body.datasets) ? body.datasets : undefined;
  if (!isRecord(body.data) && labels && datasets) {
    body.data = { labels, datasets };
  }
  delete body.labels;
  delete body.datasets;

  // render_card returns inline images only.
  if (body.returnUrl === true) {
    delete body.returnUrl;
  }

  // Guard against unsupported header keys that frequently cause API 400s.
  if (isRecord(body.header)) {
    const { title, subtitle, badge } = body.header;
    body.header = {
      ...(typeof title === "string" ? { title } : {}),
      ...(typeof subtitle === "string" ? { subtitle } : {}),
      ...(typeof badge === "string" ? { badge } : {}),
    };
  }

  return body;
}

function assertChartImageBuffer(buffer: Buffer, format: string): void {
  const headUtf8 = buffer.toString("utf8", 0, Math.min(buffer.length, 256)).trimStart();
  if (headUtf8.startsWith("Redirecting")) {
    throw new Error(
      "Got a redirect placeholder body instead of image bytes. Use https://www.chart-output.com or enable HTTP redirect following (308)."
    );
  }
  if (headUtf8.startsWith("{")) {
    try {
      const j = JSON.parse(buffer.toString("utf8")) as { error?: string };
      throw new Error(
        `Chart-Output returned JSON instead of an image: ${j.error ?? buffer.toString("utf8", 0, 200)}`
      );
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Chart-Output returned JSON")) {
        throw e;
      }
    }
  }

  const f = format === "jpeg" ? "jpeg" : format;
  if (f === "png") {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < sig.length || !buffer.subarray(0, sig.length).equals(sig)) {
      throw new Error(
        "Response is not a valid PNG (wrong file signature). Check the API URL and that you are not saving a redirect response."
      );
    }
  } else if (f === "jpeg") {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new Error(
        "Response is not a valid JPEG (wrong file signature). Check the API URL and that you are not saving a redirect response."
      );
    }
  } else if (f === "webp") {
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
      buffer.subarray(8, 12).toString("ascii") !== "WEBP"
    ) {
      throw new Error(
        "Response is not a valid WebP (wrong file signature). Check the API URL and that you are not saving a redirect response."
      );
    }
  } else if (f === "svg") {
    const sample = buffer.toString("utf8", 0, Math.min(buffer.length, 8192)).trimStart().toLowerCase();
    if (!sample.includes("<svg")) {
      throw new Error(
        "Response is not valid SVG markup. Check the API URL and that you are not saving a redirect response."
      );
    }
  }
}

async function fetchChartAsBase64(
  body: Record<string, unknown>
): Promise<{ base64: string; mimeType: string; url?: string }> {
  const format = (typeof body.format === "string" ? body.format : "png") as string;

  const res = await fetch(`${API_BASE}/api/v1/render`, {
    method: "POST",
    redirect: "follow",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw chartOutputHttpError(res.status, err, res.statusText);
  }

  const contentType = res.headers.get("content-type") ?? "image/png";
  if (contentType.includes("application/json")) {
    const text = await res.text();
    try {
      const err = JSON.parse(text) as { error?: string };
      throw new Error(`Chart-Output error: ${err.error ?? text.slice(0, 200)}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Chart-Output error:")) {
        throw e;
      }
      throw new Error(
        `Chart-Output returned JSON but it could not be parsed: ${text.slice(0, 200)}`
      );
    }
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  assertChartImageBuffer(buffer, format);
  return {
    base64: buffer.toString("base64"),
    mimeType: contentType,
  };
}

async function fetchChartUrl(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/render`, {
    method: "POST",
    redirect: "follow",
    headers: authHeaders(),
    body: JSON.stringify({
      ...body,
      returnUrl: true,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw chartOutputHttpError(res.status, err, res.statusText);
  }

  const json = (await res.json()) as unknown;
  const url = findRenderUrl(json);
  if (!url) {
    throw new Error(
      `Chart-Output did not return a render URL. Response: ${JSON.stringify(json).slice(0, 500)}`
    );
  }

  return url;
}

function registerExampleHelp(server: McpServer, exampleIds: string[]): void {
  const dir = getExamplesDir();

  for (const id of exampleIds) {
    const uri = `chart-output://examples/${id}`;
    const filePath = join(dir, `${id}.json`);
    server.registerResource(
      `example-${id}`,
      uri,
      {
        title: `Example: ${id}`,
        description: `Valid JSON body for render_card / POST /api/v1/render (package file examples/${id}.json). Read this before hand-authoring a card spec to avoid 400s.`,
        mimeType: "application/json",
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: readFileSync(filePath, "utf8"),
          },
        ],
      })
    );
  }

  const exampleIdHelp =
    exampleIds.length > 0
      ? exampleIds.map((id) => `- ${id}`).join("\n")
      : "(no example files found next to the server; reinstall the package.)";

  server.tool(
    "list_chart_output_examples",
    `Return the ids of all built-in chart/card JSON specs shipped with this MCP package.

Use this tool when: you are about to call render_card and are unsure of the spec shape; you have received a 400 error from render_card; you want to browse available example layouts before choosing one.
Do NOT skip this step when building full card compositions — guessing field names causes 400 errors.

Returns: a plain-text list of example ids (one per line). Pass any id to get_chart_example to retrieve the full, API-ready JSON body.
Example invocation: list_chart_output_examples() → ["mrr-breakdown", "weekly-sales-by-plan", ...]`,
    async () => ({
      content: [
        {
          type: "text" as const,
          text: `Chart-Output example spec ids (use with get_chart_example, or read MCP resource chart-output://examples/<id>):\n${exampleIdHelp}`,
        },
      ],
    })
  );

  server.tool(
    "get_chart_example",
    `Return the complete JSON body for a named built-in example spec — identical to examples/<id>.json on disk.

Use this tool when: you need a valid API body to start from before calling render_card; render_card returned HTTP 400; you want to verify the exact field names for header, kpiStrip, footer, data, options, or theme.
Do NOT hand-author a full card spec from memory — always start from this example and edit values only.

Returns: the full JSON text of the example, ready to pass as the \`spec\` argument to render_card. Field structure must be preserved; only values should change.
Errors: throws if the id is not found — call list_chart_output_examples first to see valid ids.
Example invocation: get_chart_example({ example: "mrr-breakdown" }) → { type: "bar", data: {...}, header: {...}, ... }`,
    {
      example: z
        .string()
        .min(1)
        .describe(
          'Id of the example to retrieve (filename without .json extension). Call list_chart_output_examples to see all valid ids. Examples: "mrr-breakdown", "weekly-sales-by-plan", "api-analytics".'
        ),
    },
    async ({ example }) => {
      const id = example.trim();
      if (!exampleIds.includes(id)) {
        throw new Error(
          `Unknown example "${id}". Valid ids: ${exampleIds.length ? exampleIds.join(", ") : "none"}. Call list_chart_output_examples.`
        );
      }
      const text = readFileSync(join(dir, `${id}.json`), "utf8");
      return {
        content: [
          {
            type: "text" as const,
            text: `${text}\n\n(Use the JSON object above as render_card’s \`spec\` argument. Adjust labels/values; keep the same top-level field structure your chosen example uses.)`,
          },
        ],
      };
    }
  );
}

function registerTools(server: McpServer): void {
  server.tool(
    "render_chart",
    `Render a Chart.js-style chart from structured labels and datasets and return it as an inline base64-encoded image.

Use this tool when: you have pre-structured numeric data with explicit labels and datasets; you want a simple chart (line, bar, pie, doughnut, radar, polarArea) returned directly as an image in chat; you want to optionally add Chart-Output dashboard extras (dark background, KPI strip, header, footer) via the extensions field without building a full card spec by hand.
Do NOT use this tool when: you need a stable URL to embed in HTML or email → use render_chart_url instead; you have raw or natural-language data without structured labels/datasets → use render_chart_ai instead; you need a full branded card with header, footer, KPI strip, and theme → use render_card instead.

Returns: an inline base64 image at the requested dimensions and format, plus a confirmation text string showing actual width×height and format. The image content-type matches the format parameter (image/png by default).
Errors: 401 — CHART_OUTPUT_API_KEY is missing or invalid; set the key in the MCP server env and retry. 400 — malformed spec, most often a mismatch between labels length and datasets[].data length, or an unsupported field value. Network error — chart-output.com is unreachable.
Example: render_chart({ type: "bar", labels: ["Q1","Q2","Q3","Q4"], datasets: [{ label: "Revenue", data: [12000, 15000, 18000, 22000], backgroundColor: "#4F81BD" }], title: "2024 Revenue", width: 800, height: 400 })`,
    {
      type: z
        .enum(["line", "bar", "pie", "doughnut", "radar", "polarArea"])
        .describe(
          'Chart type. Use "bar" or "line" for time-series and comparisons. Use "pie" or "doughnut" for proportions (best with ≤7 categories). Use "radar" for multi-axis comparisons across uniform scales. Use "polarArea" for relative magnitude without a common baseline. Example: "bar".'
        ),
      labels: z
        .array(z.string())
        .describe(
          'Category labels or x-axis tick labels. The array length must exactly match the length of every dataset\'s data array. Example: ["Jan", "Feb", "Mar"] or ["Product A", "Product B", "Product C"].'
        ),
      datasets: z
        .array(
          z.object({
            label: z
              .string()
              .optional()
              .describe(
                'Series name shown in the chart legend. Example: "Revenue" or "Active Users". Omit for single-series pie/doughnut charts.'
              ),
            data: z
              .array(z.number())
              .describe(
                "Numeric values, one per label entry. Must be the same length as the top-level labels array. Example: [12000, 15000, 18000, 22000]."
              ),
            backgroundColor: z
              .union([z.string(), z.array(z.string())])
              .optional()
              .describe(
                'Fill color(s). Pass a single CSS color string for bar/line series or an array of colors (one per slice) for pie/doughnut. Accepts hex, rgb(), rgba(), or named colors. Example: "#4F81BD" or ["#FF6384","#36A2EB","#FFCE56"].'
              ),
            borderColor: z
              .union([z.string(), z.array(z.string())])
              .optional()
              .describe(
                'Border/stroke color(s). Same format as backgroundColor. Commonly used for line charts to set the line color. Example: "#2c5f8a".'
              ),
            borderRadius: z
              .number()
              .optional()
              .describe(
                "Corner radius in pixels for bar chart bars. Use 4–8 for a modern rounded look. Ignored for non-bar chart types. Example: 6."
              ),
          })
        )
        .describe(
          "Array of data series. Each entry represents one line, bar group, or set of slices. Example: [{ label: \"Revenue\", data: [100, 200, 150], backgroundColor: \"#4F81BD\" }]. For pie/doughnut, use one dataset with an array of backgroundColor values."
        ),
      width: z
        .number()
        .min(100)
        .max(2000)
        .default(800)
        .optional()
        .describe(
          "Output image width in pixels. Range: 100–2000. Default: 800. Common values: 400 for thumbnails, 800 for standard dashboards, 1200 for wide/widescreen layouts."
        ),
      height: z
        .number()
        .min(100)
        .max(2000)
        .default(400)
        .optional()
        .describe(
          "Output image height in pixels. Range: 100–2000. Default: 400. Common values: 400 for landscape charts, 500–600 for portrait or square pie charts, 300 for compact sparklines."
        ),
      title: z
        .string()
        .optional()
        .describe(
          'Optional chart title rendered at the top of the chart. Omit if no title is needed. Example: "Monthly Active Users 2024".'
        ),
      format: z
        .enum(["png", "jpeg", "webp", "svg"])
        .default("png")
        .optional()
        .describe(
          'Output image format. "png" (default) — lossless, best for general use and screenshots. "jpeg" — smaller file size, lossy, good for photo-heavy backgrounds. "webp" — modern format, smaller than png with good quality. "svg" — scalable vector, ideal for embedding in web pages where resolution independence matters.'
        ),
      extensions: extensionsSchema,
    },
    async ({ type, labels, datasets, width, height, title, format, extensions }) => {
      const body = buildChartRenderBody({
        extensions,
        type,
        labels,
        datasets,
        width: width ?? 800,
        height: height ?? 400,
        format: format ?? "png",
        title,
      });

      const { base64, mimeType } = await fetchChartAsBase64(body);

      return {
        content: [
          {
            type: "image" as const,
            data: base64,
            mimeType,
          },
          {
            type: "text" as const,
            text: `Chart rendered successfully (${width ?? 800}×${height ?? 400} ${format ?? "png"}).`,
          },
        ],
      };
    }
  );

  server.tool(
    "render_chart_url",
    `Render a Chart.js-style chart from structured labels and datasets and return a stable CDN URL string instead of image bytes.

Use this tool when: you need to embed a chart in an HTML page, markdown document, or email via an <img> src attribute; you need to pass a chart URL to another tool or API; you want to avoid sending large base64 image blobs in the conversation.
Do NOT use this tool when: you want the image displayed inline in chat → use render_chart instead; you have raw or natural-language data → use render_chart_ai instead; you need a full branded card → use render_card instead.

Returns: a plain text string containing a single HTTPS CDN URL pointing to the rendered chart image (e.g. "https://cdn.chart-output.com/..."). The URL is publicly accessible and stable for the lifetime of the render.
Errors: 401 — CHART_OUTPUT_API_KEY is missing or invalid; set the key in the MCP server env. 400 — malformed spec, most often a labels/data length mismatch or unsupported field value. Network error — chart-output.com is unreachable.
Example: render_chart_url({ type: "line", labels: ["Jan","Feb","Mar"], datasets: [{ label: "MAU", data: [12000, 18000, 24000] }], title: "Monthly Active Users" }) → "https://cdn.chart-output.com/abc123.png"`,
    {
      type: z
        .enum(["line", "bar", "pie", "doughnut", "radar", "polarArea"])
        .describe(
          'Chart type. Use "bar" or "line" for time-series and comparisons. Use "pie" or "doughnut" for proportions (best with ≤7 categories). Use "radar" for multi-axis comparisons. Use "polarArea" for relative magnitude. Example: "line".'
        ),
      labels: z
        .array(z.string())
        .describe(
          'Category labels or x-axis tick labels. Must have the same length as every dataset\'s data array. Example: ["Jan", "Feb", "Mar"] or ["Product A", "Product B"].'
        ),
      datasets: z.array(
        z.object({
          label: z
            .string()
            .optional()
            .describe(
              'Series name shown in the chart legend. Example: "Revenue". Omit for single-series pie/doughnut charts.'
            ),
          data: z
            .array(z.number())
            .describe(
              "Numeric values, one per label. Must be the same length as the top-level labels array. Example: [12000, 15000, 18000]."
            ),
          backgroundColor: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe(
              'Fill color(s). Single CSS color string or array of colors (one per slice for pie/doughnut). Accepts hex, rgb(), rgba(). Example: "#4F81BD" or ["#FF6384","#36A2EB"].'
            ),
          borderColor: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe(
              'Border/stroke color(s). Same format as backgroundColor. Commonly used to set line color for line charts. Example: "#2c5f8a".'
            ),
        })
      ),
      width: z
        .number()
        .min(100)
        .max(2000)
        .default(800)
        .optional()
        .describe(
          "Output image width in pixels. Range: 100–2000. Default: 800. Use 1200 for widescreen, 400 for thumbnail embeds."
        ),
      height: z
        .number()
        .min(100)
        .max(2000)
        .default(400)
        .optional()
        .describe(
          "Output image height in pixels. Range: 100–2000. Default: 400. Use 400 for landscape, 500–600 for square or portrait charts."
        ),
      title: z
        .string()
        .optional()
        .describe(
          'Optional chart title rendered at the top of the image. Example: "Q1–Q4 Revenue 2024". Omit if untitled.'
        ),
      format: z
        .enum(["png", "jpeg", "webp", "svg"])
        .default("png")
        .optional()
        .describe(
          'Output format of the image at the returned URL. "png" (default) — lossless, universally supported. "jpeg" — smaller file, lossy. "webp" — modern, compact. "svg" — scalable vector, ideal for web embeds.'
        ),
      extensions: extensionsSchema,
    },
    async ({ type, labels, datasets, width, height, title, format, extensions }) => {
      const body = buildChartRenderBody({
        extensions,
        type,
        labels,
        datasets,
        width: width ?? 800,
        height: height ?? 400,
        format: format ?? "png",
        title,
        returnUrl: true,
      });

      const url = await fetchChartUrl(body);

      return {
        content: [
          {
            type: "text" as const,
            text: `Chart URL: ${url}`,
          },
        ],
      };
    }
  );

  server.tool(
    "render_card",
    `Render a full branded card composition — header, KPI strip, chart, and footer — and return it as an inline base64-encoded image.

Use this tool when: you need a production-grade dashboard layout with a header (title, subtitle, badge), KPI metric row, themed background, footer, or brand kit; you want to send the full /api/v1/render JSON body verbatim to Chart-Output.
Do NOT use this tool when: you only need a simple chart without branding → use render_chart instead; you need a URL rather than inline bytes → use render_card_url for full branded cards or render_chart_url for simple charts; you have natural-language data → use render_chart_ai instead.

IMPORTANT — always start from an example spec: call get_chart_example("mrr-breakdown") (or list_chart_output_examples to browse all ids) and modify values only. Do NOT hand-author the full spec from memory; incorrect field names cause HTTP 400.

Returns: an inline base64 image at the format and dimensions defined in the spec, plus a confirmation text string with dimensions and format.
Errors: 400 — malformed or missing required spec fields; the server will auto-retry once after normalizing common structural issues (root labels/datasets → data object). 401 — API key missing or invalid. returnUrl in spec — not allowed; render_card returns inline images only; omit returnUrl from the spec.
Limitations: does not support returnUrl; inline image only. For the full field reference see https://www.chart-output.com/docs/card-composition.
Example: render_card({ spec: { ...get_chart_example("mrr-breakdown"), header: { title: "Q1 Report" } } })`,
    {
      spec: z
        .record(z.unknown())
        .describe(
          'Full POST /api/v1/render request body. Always start from get_chart_example("mrr-breakdown") or another example id and edit values; do not construct this object from scratch. Typical top-level fields: type, data (with labels and datasets), options, width, height, format, and optional header ({ title, subtitle, badge }), kpiStrip (array of { label, value, delta }), footer ({ text }), theme ("light" | "dark"), backgroundColor, brandKitId. Do NOT include returnUrl — it is not supported by this tool.'
        ),
    },
    async ({ spec }) => {
      const body = spec as Record<string, unknown>;
      if (body.returnUrl === true) {
        throw new Error(
          "render_card only returns inline images. Omit returnUrl from the spec for binary responses."
        );
      }
      let finalBody = body;
      let normalizedRetry = false;
      let base64: string;
      let mimeType: string;

      try {
        const rendered = await fetchChartAsBase64(finalBody);
        base64 = rendered.base64;
        mimeType = rendered.mimeType;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes("Chart-Output error 400")) {
          throw error;
        }

        finalBody = normalizeCardSpec(body);
        const rendered = await fetchChartAsBase64(finalBody);
        base64 = rendered.base64;
        mimeType = rendered.mimeType;
        normalizedRetry = true;
      }

      const w = typeof finalBody.width === "number" ? finalBody.width : "?";
      const h = typeof finalBody.height === "number" ? finalBody.height : "?";
      const fmt = typeof finalBody.format === "string" ? finalBody.format : "png";
      return {
        content: [
          {
            type: "image" as const,
            data: base64,
            mimeType,
          },
          {
            type: "text" as const,
            text: normalizedRetry
              ? `Card rendered successfully (${w}×${h} ${fmt}) after normalizing common spec fields.`
              : `Card rendered successfully (${w}×${h} ${fmt}).`,
          },
        ],
      };
    }
  );

  server.tool(
    "render_card_url",
    `Render a full branded card composition — header, KPI strip, chart, and footer — and return a stable CDN URL string instead of image bytes.

Use this tool when: you need an openable, shareable, or downloadable URL for a production-grade dashboard layout with a header, KPI metric row, themed background, footer, or brand kit; you want to send the full /api/v1/render JSON body verbatim to Chart-Output.
Do NOT use this tool when: you want the image displayed inline in chat → use render_card instead; you only need a simple Chart.js labels/datasets chart → use render_chart_url instead; you have natural-language data → use render_chart_ai instead.

IMPORTANT — always start from an example spec: call get_chart_example("mrr-breakdown") (or list_chart_output_examples to browse all ids) and modify values only. Do NOT hand-author the full spec from memory; incorrect field names cause HTTP 400.

Returns: a plain text string containing a single HTTPS CDN URL pointing to the rendered full card image. The URL is publicly accessible and stable for the lifetime of the render.
Errors: 400 — malformed or missing required spec fields; the server will auto-retry once after normalizing common structural issues (root labels/datasets → data object). 401 — API key missing or invalid.
Example: render_card_url({ spec: { ...get_chart_example("mrr-breakdown"), header: { title: "Q1 Report" } } }) → "https://cdn.chart-output.com/abc123.png"`,
    {
      spec: z
        .record(z.unknown())
        .describe(
          'Full POST /api/v1/render request body. Always start from get_chart_example("mrr-breakdown") or another example id and edit values; do not construct this object from scratch. Typical top-level fields: type, data (with labels and datasets), options, width, height, format, and optional header ({ title, subtitle, badge }), kpiStrip (array of { label, value, delta }), footer ({ text }), theme ("light" | "dark"), backgroundColor, brandKitId. returnUrl is handled by this tool automatically.'
        ),
    },
    async ({ spec }) => {
      const body = spec as Record<string, unknown>;
      let finalBody = body;
      let normalizedRetry = false;
      let url: string;

      try {
        url = await fetchChartUrl(finalBody);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes("Chart-Output error 400")) {
          throw error;
        }

        finalBody = normalizeCardSpec(body);
        url = await fetchChartUrl(finalBody);
        normalizedRetry = true;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: normalizedRetry
              ? `Card URL: ${url}\n\nRendered after normalizing common spec fields.`
              : `Card URL: ${url}`,
          },
        ],
      };
    }
  );

  server.tool(
    "render_chart_ai",
    `Generate a chart from a natural language description and optional raw data, and return it as an inline base64-encoded image. Chart-Output's AI layer selects the chart type, builds the spec, and renders automatically.

Use this tool when: you have natural-language data or a plain description without pre-structured labels/datasets; you want Chart-Output to pick the best chart type automatically; you have raw tabular data (JSON array or CSV) and want a chart without manually extracting labels and datasets.
Do NOT use this tool when: you already have structured labels and datasets → use render_chart or render_chart_url instead; you need SVG output → SVG is not supported by this tool; you need custom Chart.js options or extensions → use render_chart with extensions instead.

Returns: an inline base64 image. The response text reports the AI-selected chart type and generation time in milliseconds.
Errors: 401 — CHART_OUTPUT_API_KEY is missing or invalid. 403 — the API key is a Free-tier key; this tool requires a Pro or Business key (upgrade at chart-output.com/pricing). 400 — description is empty or data is malformed.
Limitations: SVG format is not supported (use png, jpeg, or webp). Custom Chart.js options, extensions, headers, and KPI strips are not available — use render_chart or render_card for those. Requires a Pro or Business API key.
Example: render_chart_ai({ description: "Monthly revenue for 2024 as a green bar chart, growing from 12k in Jan to 28k in Dec", width: 800, height: 400 })`,
    {
      description: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          'Natural-language description of the desired chart. Be specific about chart type, colors, and key trends for best results. Optionally specify axis labels and units. Examples: "Monthly revenue for 2024 growing from 12k to 28k, use a green bar chart" or "Pie chart of market share: Android 72%, iOS 27%, Other 1%". Max 2000 characters.'
        ),
      data: z
        .union([z.array(z.record(z.unknown())), z.string()])
        .optional()
        .describe(
          'Optional raw data for the AI to use when building the chart. Accepts either a JSON array of objects (e.g. [{"month":"Jan","revenue":12000},{"month":"Feb","revenue":15000}]) or a CSV string (e.g. "month,revenue\\nJan,12000\\nFeb,15000"). If omitted, the AI generates plausible data from the description alone. Providing real data yields more accurate charts.'
        ),
      width: z
        .number()
        .min(100)
        .max(2000)
        .default(800)
        .optional()
        .describe(
          "Output image width in pixels. Range: 100–2000. Default: 800. Use 1200 for widescreen dashboards, 400 for compact embeds."
        ),
      height: z
        .number()
        .min(100)
        .max(2000)
        .default(400)
        .optional()
        .describe(
          "Output image height in pixels. Range: 100–2000. Default: 400. Use 400 for landscape, 500–600 for square or portrait layouts."
        ),
      format: z
        .enum(["png", "jpeg", "webp"])
        .default("png")
        .optional()
        .describe(
          'Output image format. SVG is NOT supported by this tool. "png" (default) — lossless, best for general use. "jpeg" — smaller file size, lossy. "webp" — modern format with good compression. For SVG output use render_chart instead.'
        ),
    },
    async ({ description, data, width, height, format }) => {
      const body: Record<string, unknown> = {
        description,
        width: width ?? 800,
        height: height ?? 400,
        format: format ?? "png",
      };
      if (data) body.data = data;

      const res = await fetch(`${API_BASE}/api/v1/ai/render`, {
        method: "POST",
        redirect: "follow",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.status === 403) {
          throw new Error(
            "AI rendering requires a Chart-Output Pro or Business API key. Get one at chart-output.com/pricing"
          );
        }
        throw chartOutputHttpError(res.status, err, res.statusText);
      }

      const contentType = res.headers.get("content-type") ?? "image/png";
      if (contentType.includes("application/json")) {
        const text = await res.text();
        const err = JSON.parse(text) as { error?: string };
        throw new Error(`Chart-Output error: ${err.error ?? text.slice(0, 200)}`);
      }
      const chartType = res.headers.get("x-ai-chart-type") ?? "unknown";
      const genMs = res.headers.get("x-ai-generation-ms") ?? "?";
      const buffer = Buffer.from(await res.arrayBuffer());
      assertChartImageBuffer(buffer, format ?? "png");

      return {
        content: [
          {
            type: "image" as const,
            data: buffer.toString("base64"),
            mimeType: contentType,
          },
          {
            type: "text" as const,
            text: `AI chart rendered: ${chartType} chart (generated in ${genMs}ms).`,
          },
        ],
      };
    }
  );
}

const SERVER_INSTRUCTIONS = `You are using Chart-Output MCP to render charts and dashboard cards as images (PNG, JPEG, WebP, or SVG).

Authentication: All render tools require CHART_OUTPUT_API_KEY (sent as Bearer token). If any call returns 401, the key is missing or invalid — the user must set CHART_OUTPUT_API_KEY in the MCP server environment. render_chart_ai additionally requires a Pro or Business key; a Free key returns 403.

Tool selection guide:
1. list_chart_output_examples — call this first when building a card or after receiving HTTP 400, to see all valid example ids.
2. get_chart_example — call this to retrieve a full, API-valid JSON body for a given example id. Always start render_card or render_card_url from this spec; do not hand-author a card spec.
3. render_chart — use when you have structured labels + datasets and want an inline image. Supports line, bar, pie, doughnut, radar, polarArea. Use the "extensions" field to add Chart-Output dashboard features (header, footer, kpiStrip, theme, backgroundColor) without a full card spec.
4. render_chart_url — same inputs as render_chart but returns a CDN URL string instead of image bytes. Use when embedding in HTML, markdown, or email.
5. render_card — use for full branded dashboard cards (header, KPI strip, footer, theme, brandKitId) when you want an inline image. The "spec" field is the full POST /api/v1/render body. Do NOT set returnUrl. Always start from get_chart_example output.
6. render_card_url — use for full branded dashboard cards when you need an openable/shareable CDN URL instead of inline image bytes. The "spec" field is the full POST /api/v1/render body. returnUrl is handled automatically.
7. render_chart_ai — use when data is in natural language or raw tabular form (JSON array or CSV). Requires Pro/Business key. Does NOT support SVG or custom Chart.js options.

Defaults: 800×400 pixels, PNG format. Labels array length must match every dataset's data array length or the API returns 400. Card layout reference: https://www.chart-output.com/docs/card-composition`;

let warnedMissingApiKey = false;

export function createServer(): McpServer {
  if (!apiKey && !warnedMissingApiKey) {
    console.error(
      "chart-output-mcp: CHART_OUTPUT_API_KEY is not set. The Chart-Output API requires a key for /api/v1/render (see https://www.chart-output.com/docs/quick-start)."
    );
    warnedMissingApiKey = true;
  }

  const exampleIds = loadExampleIds();
  const server = new McpServer(
    {
      name: "chart-output-mcp",
      version: "1.0.5",
    },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerExampleHelp(server, exampleIds);
  registerTools(server);
  return server;
}
