import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runWithRequestContext } from "./config/requestContext.js";
import { createServer } from "./server.js";
const app = express();
app.use(express.json());
const MCP_PATH = "/mcp";
const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
function isAllowedOrigin(origin) {
    return !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}
app.use((req, res, next) => {
    const origin = req.get("origin");
    if (isAllowedOrigin(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "authorization,content-type,mcp-protocol-version,mcp-session-id,last-event-id,x-chart-output-api-key");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
    next();
});
app.options(MCP_PATH, (_req, res) => {
    res.sendStatus(204);
});
function extractChartOutputApiKey(req) {
    const explicitKey = req.get("x-chart-output-api-key")?.trim();
    if (explicitKey) {
        return explicitKey;
    }
    const authorization = req.get("authorization")?.trim();
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim();
}
app.all(MCP_PATH, async (req, res) => {
    const requestApiKey = extractChartOutputApiKey(req);
    await runWithRequestContext({ chartOutputApiKey: requestApiKey }, async () => {
        const server = createServer({ hasRequestScopedApiKey: Boolean(requestApiKey) });
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            console.error("Error handling MCP request:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32603,
                        message: "Internal server error",
                    },
                    id: null,
                });
            }
        }
        finally {
            await server.close();
        }
    });
});
app.get("/", (_req, res) => {
    res.json({
        name: "chart-output-mcp",
        transport: "streamable-http",
        endpoint: MCP_PATH,
        auth: {
            type: "bearer",
            description: "Pass Authorization: Bearer <CHART_OUTPUT_API_KEY>, or configure CHART_OUTPUT_API_KEY on the server.",
        },
    });
});
app.all(["/sse", "/message"], (_req, res) => {
    res.status(410).json({
        error: "The SSE transport is deprecated for this deployment. Use the Streamable HTTP MCP endpoint at /mcp.",
    });
});
const port = Number(process.env.PORT) || 3000;
let localServer;
if (!process.env.VERCEL) {
    localServer = app.listen(port, () => {
        console.log(`MCP Streamable HTTP server running on ${port}`);
    });
}
process.once("SIGTERM", () => {
    localServer?.close();
});
export default app;
