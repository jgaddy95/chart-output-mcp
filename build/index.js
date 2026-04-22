#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// Use www host: apex chart-output.com returns 308 with body "Redirecting..."; clients that
// don't follow redirects save that text as if it were image bytes.
const API_BASE = "https://www.chart-output.com";
const apiKey = process.env.CHART_OUTPUT_API_KEY ?? null;
const server = new McpServer({
    name: "chart-output-mcp",
    version: "1.0.2",
});
// ─── Helper ───────────────────────────────────────────────────────────────────
function authHeaders() {
    const headers = {
        "Content-Type": "application/json",
    };
    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return headers;
}
function chartOutputHttpError(status, body, statusText) {
    const msg = typeof body.error === "string" ? body.error : body.message ?? statusText;
    if (status === 401) {
        return new Error(`Chart-Output error 401: ${msg}. Set CHART_OUTPUT_API_KEY to your API key and use Authorization: Bearer (see https://www.chart-output.com/docs/quick-start).`);
    }
    return new Error(`Chart-Output error ${status}: ${msg}`);
}
const extensionsSchema = z
    .record(z.unknown())
    .optional()
    .describe("Optional Chart-Output dashboard fields merged first, then overridden by type/labels/datasets/width/height/format. Use for backgroundColor, kpiStrip, header, footer, theme, brandKitId, borderRadius, legend, options (partial), etc.");
function buildChartRenderBody(args) {
    const { extensions, type, labels, datasets, width, height, format, title, returnUrl } = args;
    const body = {
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
        const opts = body.options ?? {};
        const plugins = opts.plugins ?? {};
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
function assertChartImageBuffer(buffer, format) {
    const headUtf8 = buffer
        .toString("utf8", 0, Math.min(buffer.length, 256))
        .trimStart();
    if (headUtf8.startsWith("Redirecting")) {
        throw new Error("Got a redirect placeholder body instead of image bytes. Use https://www.chart-output.com or enable HTTP redirect following (308).");
    }
    if (headUtf8.startsWith("{")) {
        try {
            const j = JSON.parse(buffer.toString("utf8"));
            throw new Error(`Chart-Output returned JSON instead of an image: ${j.error ?? buffer.toString("utf8", 0, 200)}`);
        }
        catch (e) {
            if (e instanceof Error && e.message.startsWith("Chart-Output returned JSON")) {
                throw e;
            }
        }
    }
    const f = format === "jpeg" ? "jpeg" : format;
    if (f === "png") {
        const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        if (buffer.length < sig.length || !buffer.subarray(0, sig.length).equals(sig)) {
            throw new Error("Response is not a valid PNG (wrong file signature). Check the API URL and that you are not saving a redirect response.");
        }
    }
    else if (f === "jpeg") {
        if (buffer.length < 3 ||
            buffer[0] !== 0xff ||
            buffer[1] !== 0xd8 ||
            buffer[2] !== 0xff) {
            throw new Error("Response is not a valid JPEG (wrong file signature). Check the API URL and that you are not saving a redirect response.");
        }
    }
    else if (f === "webp") {
        if (buffer.length < 12 ||
            buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
            buffer.subarray(8, 12).toString("ascii") !== "WEBP") {
            throw new Error("Response is not a valid WebP (wrong file signature). Check the API URL and that you are not saving a redirect response.");
        }
    }
    else if (f === "svg") {
        const sample = buffer
            .toString("utf8", 0, Math.min(buffer.length, 8192))
            .trimStart()
            .toLowerCase();
        if (!sample.includes("<svg")) {
            throw new Error("Response is not valid SVG markup. Check the API URL and that you are not saving a redirect response.");
        }
    }
}
async function fetchChartAsBase64(body) {
    const format = (typeof body.format === "string" ? body.format : "png");
    const res = await fetch(`${API_BASE}/api/v1/render`, {
        method: "POST",
        redirect: "follow",
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({})));
        throw chartOutputHttpError(res.status, err, res.statusText);
    }
    const contentType = res.headers.get("content-type") ?? "image/png";
    if (contentType.includes("application/json")) {
        const text = await res.text();
        try {
            const err = JSON.parse(text);
            throw new Error(`Chart-Output error: ${err.error ?? text.slice(0, 200)}`);
        }
        catch (e) {
            if (e instanceof Error && e.message.startsWith("Chart-Output error:")) {
                throw e;
            }
            throw new Error(`Chart-Output returned JSON but it could not be parsed: ${text.slice(0, 200)}`);
        }
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    assertChartImageBuffer(buffer, format);
    return {
        base64: buffer.toString("base64"),
        mimeType: contentType,
    };
}
// ─── Tool 1: render_chart ─────────────────────────────────────────────────────
// Takes a full Chart.js-style JSON spec, returns inline image
server.tool("render_chart", "Render a chart from a Chart.js JSON specification. Returns the chart as an inline image. Supports line, bar, pie, doughnut, radar, and polarArea chart types. Pass optional extensions for Chart-Output dashboard features (dark background, kpiStrip, header, theme).", {
    type: z
        .enum(["line", "bar", "pie", "doughnut", "radar", "polarArea"])
        .describe("Chart type"),
    labels: z.array(z.string()).describe("X-axis labels or category names"),
    datasets: z
        .array(z.object({
        label: z.string().optional(),
        data: z.array(z.number()),
        backgroundColor: z
            .union([z.string(), z.array(z.string())])
            .optional(),
        borderColor: z.union([z.string(), z.array(z.string())]).optional(),
        borderRadius: z.number().optional(),
    }))
        .describe("One or more datasets"),
    width: z.number().min(100).max(2000).default(800).optional(),
    height: z.number().min(100).max(2000).default(400).optional(),
    title: z.string().optional().describe("Chart title"),
    format: z.enum(["png", "jpeg", "webp", "svg"]).default("png").optional(),
    extensions: extensionsSchema,
}, async ({ type, labels, datasets, width, height, title, format, extensions }) => {
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
                type: "image",
                data: base64,
                mimeType,
            },
            {
                type: "text",
                text: `Chart rendered successfully (${width ?? 800}×${height ?? 400} ${format ?? "png"}).`,
            },
        ],
    };
});
// ─── Tool 2: render_chart_url ─────────────────────────────────────────────────
// Returns a stable CDN URL instead of binary — useful for embedding in emails,
// passing to other tools, or when the image would exceed Claude's ~1MB limit
server.tool("render_chart_url", "Render a chart and return a CDN URL instead of image bytes. Use this when you need a stable URL to embed in HTML, email, or pass to another tool. Same inputs as render_chart.", {
    type: z.enum(["line", "bar", "pie", "doughnut", "radar", "polarArea"]),
    labels: z.array(z.string()),
    datasets: z.array(z.object({
        label: z.string().optional(),
        data: z.array(z.number()),
        backgroundColor: z.union([z.string(), z.array(z.string())]).optional(),
        borderColor: z.union([z.string(), z.array(z.string())]).optional(),
    })),
    width: z.number().min(100).max(2000).default(800).optional(),
    height: z.number().min(100).max(2000).default(400).optional(),
    title: z.string().optional(),
    format: z.enum(["png", "jpeg", "webp", "svg"]).default("png").optional(),
    extensions: extensionsSchema,
}, async ({ type, labels, datasets, width, height, title, format, extensions }) => {
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
        const err = (await res.json().catch(() => ({})));
        throw chartOutputHttpError(res.status, err, res.statusText);
    }
    const json = (await res.json());
    return {
        content: [
            {
                type: "text",
                text: `Chart URL: ${json.url}`,
            },
        ],
    };
});
// ─── Tool 3: render_card ────────────────────────────────────────────────────
// Full card composition POST body — passes through to /api/v1/render unchanged.
server.tool("render_card", "Render a full branded card composition: header (eyebrow, title, subtitle, badge), KPI strip, footer, theme, border, padding, backgroundColor, brandKitId, and chart data/options. Sends the spec verbatim to Chart-Output — use this for production layouts; use render_chart only for simple Chart.js-only payloads. See https://www.chart-output.com/docs/card-composition and examples/*.json in this package.", {
    spec: z
        .record(z.unknown())
        .describe("Full card composition JSON for POST /api/v1/render. See https://www.chart-output.com/docs/card-composition (header, kpiStrip, footer, backgroundColor, theme, border, padding, data, options, etc.)."),
}, async ({ spec }) => {
    const body = spec;
    if (body.returnUrl === true) {
        throw new Error("render_card only returns inline images. Omit returnUrl from the spec for binary responses.");
    }
    const { base64, mimeType } = await fetchChartAsBase64(body);
    const w = typeof body.width === "number" ? body.width : "?";
    const h = typeof body.height === "number" ? body.height : "?";
    const fmt = typeof body.format === "string" ? body.format : "png";
    return {
        content: [
            {
                type: "image",
                data: base64,
                mimeType,
            },
            {
                type: "text",
                text: `Card rendered successfully (${w}×${h} ${fmt}).`,
            },
        ],
    };
});
// ─── Tool 4: render_chart_ai ──────────────────────────────────────────────────
// Natural language → chart. Requires Pro/Business API key.
server.tool("render_chart_ai", "Generate a chart from a natural language description and optional raw data. Chart-Output's AI layer builds the chart spec automatically. Requires a Pro or Business API key.", {
    description: z
        .string()
        .min(1)
        .max(2000)
        .describe("Natural language description of the chart, e.g. 'Monthly revenue for 2024 growing from 12k to 28k, use a green bar chart'"),
    data: z
        .union([z.array(z.record(z.unknown())), z.string()])
        .optional()
        .describe("Optional raw data as a JSON array of objects or CSV string"),
    width: z.number().min(100).max(2000).default(800).optional(),
    height: z.number().min(100).max(2000).default(400).optional(),
    format: z.enum(["png", "jpeg", "webp"]).default("png").optional(),
}, async ({ description, data, width, height, format }) => {
    const body = {
        description,
        width: width ?? 800,
        height: height ?? 400,
        format: format ?? "png",
    };
    if (data)
        body.data = data;
    const res = await fetch(`${API_BASE}/api/v1/ai/render`, {
        method: "POST",
        redirect: "follow",
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({})));
        if (res.status === 403) {
            throw new Error("AI rendering requires a Chart-Output Pro or Business API key. Get one at chart-output.com/pricing");
        }
        throw chartOutputHttpError(res.status, err, res.statusText);
    }
    const contentType = res.headers.get("content-type") ?? "image/png";
    if (contentType.includes("application/json")) {
        const text = await res.text();
        const err = JSON.parse(text);
        throw new Error(`Chart-Output error: ${err.error ?? text.slice(0, 200)}`);
    }
    const chartType = res.headers.get("x-ai-chart-type") ?? "unknown";
    const genMs = res.headers.get("x-ai-generation-ms") ?? "?";
    const buffer = Buffer.from(await res.arrayBuffer());
    assertChartImageBuffer(buffer, format ?? "png");
    return {
        content: [
            {
                type: "image",
                data: buffer.toString("base64"),
                mimeType: contentType,
            },
            {
                type: "text",
                text: `AI chart rendered: ${chartType} chart (generated in ${genMs}ms).`,
            },
        ],
    };
});
// ─── Start ────────────────────────────────────────────────────────────────────
if (!apiKey) {
    console.error("chart-output-mcp: CHART_OUTPUT_API_KEY is not set. The Chart-Output API requires a key for /api/v1/render (see https://www.chart-output.com/docs/quick-start).");
}
const transport = new StdioServerTransport();
await server.connect(transport);
