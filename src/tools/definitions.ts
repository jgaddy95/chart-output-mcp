import { z } from "zod";

export const extensionsSchema = z
  .record(z.unknown())
  .optional()
  .describe(
    "Optional Chart-Output dashboard fields merged first, then overridden by type/labels/datasets/width/height/format. Use for backgroundColor, kpiStrip, header, footer, theme, brandKitId, borderRadius, legend, options (partial), etc."
  );

const chartTypeSchema = z
  .enum(["line", "bar", "pie", "doughnut", "radar", "polarArea"])
  .describe(
    'Chart type. Use "bar" or "line" for time-series and comparisons. Use "pie" or "doughnut" for proportions (best with ≤7 categories). Use "radar" for multi-axis comparisons across uniform scales. Use "polarArea" for relative magnitude without a common baseline. Example: "bar".'
  );

const chartTypeUrlSchema = z
  .enum(["line", "bar", "pie", "doughnut", "radar", "polarArea"])
  .describe(
    'Chart type. Use "bar" or "line" for time-series and comparisons. Use "pie" or "doughnut" for proportions (best with ≤7 categories). Use "radar" for multi-axis comparisons. Use "polarArea" for relative magnitude. Example: "line".'
  );

const labelsSchema = z
  .array(z.string())
  .describe(
    'Category labels or x-axis tick labels. The array length must exactly match the length of every dataset\'s data array. Example: ["Jan", "Feb", "Mar"] or ["Product A", "Product B", "Product C"].'
  );

const labelsUrlSchema = z
  .array(z.string())
  .describe(
    'Category labels or x-axis tick labels. Must have the same length as every dataset\'s data array. Example: ["Jan", "Feb", "Mar"] or ["Product A", "Product B"].'
  );

const chartDatasetSchema = z.object({
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
});

const chartDatasetUrlSchema = z.object({
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
});

const chartDatasetsSchema = z
  .array(chartDatasetSchema)
  .describe(
    "Array of data series. Each entry represents one line, bar group, or set of slices. Example: [{ label: \"Revenue\", data: [100, 200, 150], backgroundColor: \"#4F81BD\" }]. For pie/doughnut, use one dataset with an array of backgroundColor values."
  );

const widthSchema = z
  .number()
  .min(100)
  .max(2000)
  .default(800)
  .optional()
  .describe(
    "Output image width in pixels. Range: 100–2000. Default: 800. Common values: 400 for thumbnails, 800 for standard dashboards, 1200 for wide/widescreen layouts."
  );

const widthUrlSchema = z
  .number()
  .min(100)
  .max(2000)
  .default(800)
  .optional()
  .describe(
    "Output image width in pixels. Range: 100–2000. Default: 800. Use 1200 for widescreen, 400 for thumbnail embeds."
  );

const heightSchema = z
  .number()
  .min(100)
  .max(2000)
  .default(400)
  .optional()
  .describe(
    "Output image height in pixels. Range: 100–2000. Default: 400. Common values: 400 for landscape charts, 500–600 for portrait or square pie charts, 300 for compact sparklines."
  );

const heightUrlSchema = z
  .number()
  .min(100)
  .max(2000)
  .default(400)
  .optional()
  .describe(
    "Output image height in pixels. Range: 100–2000. Default: 400. Use 400 for landscape, 500–600 for square or portrait charts."
  );

const titleSchema = z
  .string()
  .optional()
  .describe(
    'Optional chart title rendered at the top of the chart. Omit if no title is needed. Example: "Monthly Active Users 2024".'
  );

const titleUrlSchema = z
  .string()
  .optional()
  .describe(
    'Optional chart title rendered at the top of the image. Example: "Q1–Q4 Revenue 2024". Omit if untitled.'
  );

const formatSchema = z
  .enum(["png", "jpeg", "webp", "svg"])
  .default("png")
  .optional()
  .describe(
    'Output image format. "png" (default) — lossless, best for general use and screenshots. "jpeg" — smaller file size, lossy, good for photo-heavy backgrounds. "webp" — modern format, smaller than png with good quality. "svg" — scalable vector, ideal for embedding in web pages where resolution independence matters.'
  );

const formatUrlSchema = z
  .enum(["png", "jpeg", "webp", "svg"])
  .default("png")
  .optional()
  .describe(
    'Output format of the image at the returned URL. "png" (default) — lossless, universally supported. "jpeg" — smaller file, lossy. "webp" — modern, compact. "svg" — scalable vector, ideal for web embeds.'
  );

const cardSpecSchema = z
  .record(z.unknown())
  .describe(
    'Full POST /api/v1/render request body. Always start from get_chart_example("mrr-breakdown") or another example id and edit values; do not construct this object from scratch. Typical top-level fields: type, data (with labels and datasets), options, width, height, format, and optional header ({ title, subtitle, badge }), kpiStrip (array of { label, value, delta }), footer ({ text }), theme ("light" | "dark"), backgroundColor, brandKitId. Do NOT include returnUrl — it is not supported by this tool.'
  );

const cardUrlSpecSchema = z
  .record(z.unknown())
  .describe(
    'Full POST /api/v1/render request body. Always start from get_chart_example("mrr-breakdown") or another example id and edit values; do not construct this object from scratch. Typical top-level fields: type, data (with labels and datasets), options, width, height, format, and optional header ({ title, subtitle, badge }), kpiStrip (array of { label, value, delta }), footer ({ text }), theme ("light" | "dark"), backgroundColor, brandKitId. returnUrl is handled by this tool automatically.'
  );

export const toolDefinitions = {
  renderChart: {
    name: "render_chart",
    description: `Render a Chart.js-style chart from structured labels and datasets and return it as an inline base64-encoded image.

Use this tool when: you have pre-structured numeric data with explicit labels and datasets; you want a simple chart (line, bar, pie, doughnut, radar, polarArea) returned directly as an image in chat; you want to optionally add Chart-Output dashboard extras (dark background, KPI strip, header, footer) via the extensions field without building a full card spec by hand.
Do NOT use this tool when: you need a stable URL to embed in HTML or email → use render_chart_url instead; you have raw or natural-language data without structured labels/datasets → use render_chart_ai instead; you need a full branded card with header, footer, KPI strip, and theme → use render_card instead.
Behavior: this tool makes a remote API call to Chart-Output and may consume render credits.

Returns: an inline base64 image at the requested dimensions and format, plus a confirmation text string showing actual width×height and format. The image content-type matches the format parameter (image/png by default).
Errors: 401 — CHART_OUTPUT_API_KEY is missing or invalid; set the key in the MCP server env and retry. 400 — malformed spec, most often a mismatch between labels length and datasets[].data length, or an unsupported field value. 429 — rate-limited; retry with exponential backoff and honor Retry-After if present. Network error — chart-output.com is unreachable or timed out.
Example: render_chart({ type: "bar", labels: ["Q1","Q2","Q3","Q4"], datasets: [{ label: "Revenue", data: [12000, 15000, 18000, 22000], backgroundColor: "#4F81BD" }], title: "2024 Revenue", width: 800, height: 400 })`,
    inputSchema: {
      type: chartTypeSchema,
      labels: labelsSchema,
      datasets: chartDatasetsSchema,
      width: widthSchema,
      height: heightSchema,
      title: titleSchema,
      format: formatSchema,
      extensions: extensionsSchema,
    },
  },
  renderChartUrl: {
    name: "render_chart_url",
    description: `Render a Chart.js-style chart from structured labels and datasets and return a stable CDN URL string instead of image bytes.

Use this tool when: you need to embed a chart in an HTML page, markdown document, or email via an <img> src attribute; you need to pass a chart URL to another tool or API; you want to avoid sending large base64 image blobs in the conversation.
Do NOT use this tool when: you want the image displayed inline in chat → use render_chart instead; you have raw or natural-language data → use render_chart_ai instead; you need a full branded card → use render_card instead.
Behavior: this tool makes a remote API call to Chart-Output, may consume render credits, and returns a publicly accessible CDN URL.

Returns: a plain text string containing a single HTTPS CDN URL pointing to the rendered chart image (e.g. "https://cdn.chart-output.com/..."). The URL is publicly accessible and stable for the lifetime of the render.
Errors: 401 — CHART_OUTPUT_API_KEY is missing or invalid; set the key in the MCP server env. 400 — malformed spec, most often a labels/data length mismatch or unsupported field value. 429 — rate-limited; retry with exponential backoff and honor Retry-After if present. Network error — chart-output.com is unreachable or timed out.
Example: render_chart_url({ type: "line", labels: ["Jan","Feb","Mar"], datasets: [{ label: "MAU", data: [12000, 18000, 24000] }], title: "Monthly Active Users" }) → "https://cdn.chart-output.com/abc123.png"`,
    inputSchema: {
      type: chartTypeUrlSchema,
      labels: labelsUrlSchema,
      datasets: z.array(chartDatasetUrlSchema),
      width: widthUrlSchema,
      height: heightUrlSchema,
      title: titleUrlSchema,
      format: formatUrlSchema,
      extensions: extensionsSchema,
    },
  },
  renderCard: {
    name: "render_card",
    description: `Render a full branded card composition — header, KPI strip, chart, and footer — and return it as an inline base64-encoded image.

Use this tool when: you need a production-grade dashboard layout with a header (title, subtitle, badge), KPI metric row, themed background, footer, or brand kit; you want to send the full /api/v1/render JSON body verbatim to Chart-Output.
Do NOT use this tool when: you only need a simple chart without branding → use render_chart instead; you need a URL rather than inline bytes → use render_card_url for full branded cards or render_chart_url for simple charts; you have natural-language data → use render_chart_ai instead.
Behavior: this tool makes a remote API call to Chart-Output and may consume render credits.

IMPORTANT — always start from an example spec: call get_chart_example("mrr-breakdown") (or list_chart_output_examples to browse all ids) and modify values only. Do NOT hand-author the full spec from memory; incorrect field names cause HTTP 400.

Returns: an inline base64 image at the format and dimensions defined in the spec, plus a confirmation text string with dimensions and format.
Errors: 400 — malformed or missing required spec fields; the server will auto-retry once after normalizing common structural issues (root labels/datasets → data object). 401 — API key missing or invalid. 429 — rate-limited; retry with exponential backoff and honor Retry-After if present. returnUrl in spec — not allowed; render_card returns inline images only; omit returnUrl from the spec.
Limitations: does not support returnUrl; inline image only. For the full field reference see https://www.chart-output.com/docs/card-composition.
Example: render_card({ spec: { ...get_chart_example("mrr-breakdown"), header: { title: "Q1 Report" } } })`,
    inputSchema: {
      spec: cardSpecSchema,
    },
  },
  renderCardUrl: {
    name: "render_card_url",
    description: `Render a full branded card composition — header, KPI strip, chart, and footer — and return a stable CDN URL string instead of image bytes.

Use this tool when: you need an openable, shareable, or downloadable URL for a production-grade dashboard layout with a header, KPI metric row, themed background, footer, or brand kit; you want to send the full /api/v1/render JSON body verbatim to Chart-Output.
Do NOT use this tool when: you want the image displayed inline in chat → use render_card instead; you only need a simple Chart.js labels/datasets chart → use render_chart_url instead; you have natural-language data → use render_chart_ai instead.
Behavior: this tool makes a remote API call to Chart-Output, may consume render credits, and returns a publicly accessible CDN URL.

IMPORTANT — always start from an example spec: call get_chart_example("mrr-breakdown") (or list_chart_output_examples to browse all ids) and modify values only. Do NOT hand-author the full spec from memory; incorrect field names cause HTTP 400.

Returns: a plain text string containing a single HTTPS CDN URL pointing to the rendered full card image. The URL is publicly accessible and stable for the lifetime of the render.
Errors: 400 — malformed or missing required spec fields; the server will auto-retry once after normalizing common structural issues (root labels/datasets → data object). 401 — API key missing or invalid. 429 — rate-limited; retry with exponential backoff and honor Retry-After if present.
Example: render_card_url({ spec: { ...get_chart_example("mrr-breakdown"), header: { title: "Q1 Report" } } }) → "https://cdn.chart-output.com/abc123.png"`,
    inputSchema: {
      spec: cardUrlSpecSchema,
    },
  },
  renderChartAi: {
    name: "render_chart_ai",
    description: `Generate a chart from a natural language description and optional raw data, and return it as an inline base64-encoded image. Chart-Output's AI layer selects the chart type, builds the spec, and renders automatically.

Use this tool when: you have natural-language data or a plain description without pre-structured labels/datasets; you want Chart-Output to pick the best chart type automatically; you have raw tabular data (JSON array or CSV) and want a chart without manually extracting labels and datasets.
Do NOT use this tool when: you already have structured labels and datasets → use render_chart or render_chart_url instead; you need SVG output → SVG is not supported by this tool; you need custom Chart.js options or extensions → use render_chart with extensions instead.
Behavior: this tool makes a remote API call to Chart-Output's AI endpoint and may consume render credits.

Returns: an inline base64 image. The response text reports the AI-selected chart type and generation time in milliseconds.
Errors: 401 — CHART_OUTPUT_API_KEY is missing or invalid. 403 — the API key is a Free-tier key; this tool requires a Pro or Business key (upgrade at chart-output.com/pricing). 400 — description is empty or data is malformed. 429 — rate-limited; retry with exponential backoff and honor Retry-After if present.
Limitations: SVG format is not supported (use png, jpeg, or webp). Custom Chart.js options, extensions, headers, and KPI strips are not available — use render_chart or render_card for those. Requires a Pro or Business API key.
Example: render_chart_ai({ description: "Monthly revenue for 2024 as a green bar chart, growing from 12k in Jan to 28k in Dec", width: 800, height: 400 })`,
    inputSchema: {
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
      width: widthUrlSchema.describe(
        "Output image width in pixels. Range: 100–2000. Default: 800. Use 1200 for widescreen dashboards, 400 for compact embeds."
      ),
      height: heightUrlSchema.describe(
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
  },
  listExamples: {
    name: "list_chart_output_examples",
    description: `Return the ids of all built-in chart/card JSON specs shipped with this MCP package.

Use this tool when: you are about to call render_card and are unsure of the spec shape; you have received a 400 error from render_card; you want to browse available example layouts before choosing one.
Do NOT skip this step when building full card compositions — guessing field names causes 400 errors.

Returns: a plain-text list of example ids (one per line). Pass any id to get_chart_example to retrieve the full, API-ready JSON body.
Example invocation: list_chart_output_examples() → ["mrr-breakdown", "weekly-sales-by-plan", ...]`,
  },
  getExample: {
    name: "get_chart_example",
    description: `Return the complete JSON body for a named built-in example spec — identical to examples/<id>.json on disk.

Use this tool when: you need a valid API body to start from before calling render_card; render_card returned HTTP 400; you want to verify the exact field names for header, kpiStrip, footer, data, options, or theme.
Do NOT hand-author a full card spec from memory — always start from this example and edit values only.

Returns: the full JSON text of the example, ready to pass as the \`spec\` argument to render_card. Field structure must be preserved; only values should change.
Errors: throws if the id is not found — call list_chart_output_examples first to see valid ids.
Example invocation: get_chart_example({ example: "mrr-breakdown" }) → { type: "bar", data: {...}, header: {...}, ... }`,
    inputSchema: {
      example: z
        .string()
        .min(1)
        .describe(
          'Id of the example to retrieve (filename without .json extension). Call list_chart_output_examples to see all valid ids. Examples: "mrr-breakdown", "weekly-sales-by-plan", "api-analytics".'
        ),
    },
  },
} as const;
