import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "./server.js";
const app = express();
app.use(express.json());
const transports = new Map();
app.get("/sse", async (_req, res) => {
    const server = createServer();
    const transport = new SSEServerTransport("/message", res);
    transports.set(transport.sessionId, transport);
    transport.onclose = () => {
        transports.delete(transport.sessionId);
    };
    await server.connect(transport);
});
app.post("/message", async (req, res) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : "";
    const transport = transports.get(sessionId);
    if (!transport) {
        res.status(400).json({ error: "No active SSE session for this sessionId" });
        return;
    }
    await transport.handlePostMessage(req, res, req.body);
});
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
    console.log(`MCP HTTP server running on ${port}`);
});
