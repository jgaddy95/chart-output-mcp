import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchAiChartAsBase64 } from "../clients/chartOutputClient.js";
import { toolDefinitions } from "./definitions.js";

export function registerRenderChartAiTool(server: McpServer): void {
  server.tool(
    toolDefinitions.renderChartAi.name,
    toolDefinitions.renderChartAi.description,
    toolDefinitions.renderChartAi.inputSchema,
    async ({ description, data, width, height, format }) => {
      const body: Record<string, unknown> = {
        description,
        width: width ?? 800,
        height: height ?? 400,
        format: format ?? "png",
      };
      if (data) body.data = data;

      const rendered = await fetchAiChartAsBase64(body);

      return {
        content: [
          {
            type: "image" as const,
            data: rendered.base64,
            mimeType: rendered.mimeType,
          },
          {
            type: "text" as const,
            text: `AI chart rendered: ${rendered.chartType} chart (generated in ${rendered.generationMs}ms).`,
          },
        ],
      };
    }
  );
}
