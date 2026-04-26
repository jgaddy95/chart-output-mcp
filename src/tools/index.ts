import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExampleTools } from "./examples.js";
import { registerRenderCardTools } from "./renderCard.js";
import { registerRenderChartTools } from "./renderChart.js";
import { registerRenderChartAiTool } from "./renderChartAi.js";

export function registerTools(server: McpServer, exampleIds: string[]): void {
  registerExampleTools(server, exampleIds);
  registerRenderChartTools(server);
  registerRenderCardTools(server);
  registerRenderChartAiTool(server);
}
