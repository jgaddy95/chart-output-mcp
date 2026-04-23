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
    "Lists built-in example chart/card JSON specs shipped with this MCP. Call get_chart_example or resources/read (chart-output://examples/<id>) to fetch a full, API-valid spec before using render_card — this prevents guesswork and 400 errors.",
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
    "Returns the full JSON for a shipped example (same as examples/<id>.json). Pass the parsed object to render_card as { spec: <object> } — the file is already the request body shape the API expects. Use this when render_card returns 400 or you are unsure of field names (header, kpiStrip, data, options, etc.).",
    {
      example: z
        .string()
        .min(1)
        .describe(
          'Example id (filename without .json), e.g. "mrr-breakdown". Use list_chart_output_examples to see all ids.'
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
    "Render a chart from a Chart.js JSON specification. Returns the chart as an inline image. Supports line, bar, pie, doughnut, radar, and polarArea chart types. Pass optional extensions for Chart-Output dashboard features (dark background, kpiStrip, header, theme).",
    {
      type: z
        .enum(["line", "bar", "pie", "doughnut", "radar", "polarArea"])
        .describe("Chart type"),
      labels: z.array(z.string()).describe("X-axis labels or category names"),
      datasets: z
        .array(
          z.object({
            label: z.string().optional(),
            data: z.array(z.number()),
            backgroundColor: z.union([z.string(), z.array(z.string())]).optional(),
            borderColor: z.union([z.string(), z.array(z.string())]).optional(),
            borderRadius: z.number().optional(),
          })
        )
        .describe("One or more datasets"),
      width: z.number().min(100).max(2000).default(800).optional(),
      height: z.number().min(100).max(2000).default(400).optional(),
      title: z.string().optional().describe("Chart title"),
      format: z.enum(["png", "jpeg", "webp", "svg"]).default("png").optional(),
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
    "Render a chart and return a CDN URL instead of image bytes. Use this when you need a stable URL to embed in HTML, email, or pass to another tool. Same inputs as render_chart.",
    {
      type: z.enum(["line", "bar", "pie", "doughnut", "radar", "polarArea"]),
      labels: z.array(z.string()),
      datasets: z.array(
        z.object({
          label: z.string().optional(),
          data: z.array(z.number()),
          backgroundColor: z.union([z.string(), z.array(z.string())]).optional(),
          borderColor: z.union([z.string(), z.array(z.string())]).optional(),
        })
      ),
      width: z.number().min(100).max(2000).default(800).optional(),
      height: z.number().min(100).max(2000).default(400).optional(),
      title: z.string().optional(),
      format: z.enum(["png", "jpeg", "webp", "svg"]).default("png").optional(),
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

      const json = (await res.json()) as { url: string };

      return {
        content: [
          {
            type: "text" as const,
            text: `Chart URL: ${json.url}`,
          },
        ],
      };
    }
  );

  server.tool(
    "render_card",
    "Render a full branded card composition: header (eyebrow, title, subtitle, badge), KPI strip, footer, theme, border, padding, backgroundColor, brandKitId, and chart data/options. Sends the spec verbatim to Chart-Output — use this for production layouts; use render_chart only for simple Chart.js-only payloads. If you get HTTP 400 or are unsure of the schema, do NOT guess: call get_chart_example with example \"mrr-breakdown\" (or list_chart_output_examples) and adapt that JSON. Docs: https://www.chart-output.com/docs/card-composition",
    {
      spec: z
        .record(z.unknown())
        .describe(
          "Full POST /api/v1/render body. Prefer starting from get_chart_example(\"mrr-breakdown\") and editing values. Fields typically include data, options, and optional header, kpiStrip, footer, theme, width, height, format — exact keys depend on layout (see the example you copy)."
        ),
    },
    async ({ spec }) => {
      const body = spec as Record<string, unknown>;
      if (body.returnUrl === true) {
        throw new Error(
          "render_card only returns inline images. Omit returnUrl from the spec for binary responses."
        );
      }
      const { base64, mimeType } = await fetchChartAsBase64(body);
      const w = typeof body.width === "number" ? body.width : "?";
      const h = typeof body.height === "number" ? body.height : "?";
      const fmt = typeof body.format === "string" ? body.format : "png";
      return {
        content: [
          {
            type: "image" as const,
            data: base64,
            mimeType,
          },
          {
            type: "text" as const,
            text: `Card rendered successfully (${w}×${h} ${fmt}).`,
          },
        ],
      };
    }
  );

  server.tool(
    "render_chart_ai",
    "Generate a chart from a natural language description and optional raw data. Chart-Output's AI layer builds the chart spec automatically. Requires a Pro or Business API key.",
    {
      description: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          "Natural language description of the chart, e.g. 'Monthly revenue for 2024 growing from 12k to 28k, use a green bar chart'"
        ),
      data: z
        .union([z.array(z.record(z.unknown())), z.string()])
        .optional()
        .describe("Optional raw data as a JSON array of objects or CSV string"),
      width: z.number().min(100).max(2000).default(800).optional(),
      height: z.number().min(100).max(2000).default(400).optional(),
      format: z.enum(["png", "jpeg", "webp"]).default("png").optional(),
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

Authentication: Rendering requires CHART_OUTPUT_API_KEY (Bearer). If calls fail with 401, the user must set the key on the MCP server.

Choose the right tool:
- list_chart_output_examples / get_chart_example — Use these FIRST when building a full card or you see HTTP 400. They return canonical JSON the API already accepts. Pass the object from get_chart_example to render_card as the "spec" field (edit values only; keep structure). MCP resources: chart-output://examples/<id> (e.g. mrr-breakdown).
- render_chart — Simple Chart.js charts: chart type, labels, datasets, optional title/size/format. Use optional "extensions" to merge Chart-Output dashboard fields (e.g. backgroundColor, header, footer, kpiStrip, theme) without building a full card by hand.
- render_chart_url — Same inputs as render_chart but returns a CDN URL instead of image bytes.
- render_card — Full card: "spec" is the full POST /api/v1/render body. Do not set returnUrl (inline image only). When unsure, copy from get_chart_example, not from memory.
- render_chart_ai — Natural-language chart generation; requires a Pro or Business API key.

Card layout reference: https://www.chart-output.com/docs/card-composition

Use clear labels and sensible dimensions (defaults are 800×400 unless the design needs otherwise).`;

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
