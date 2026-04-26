import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchChartAsBase64, fetchChartUrl } from "../clients/chartOutputClient.js";
import { buildChartRenderBody } from "../utils/chartRenderBody.js";
import { toolDefinitions } from "./definitions.js";

export function registerRenderChartTools(server: McpServer): void {
  server.tool(
    toolDefinitions.renderChart.name,
    toolDefinitions.renderChart.description,
    toolDefinitions.renderChart.inputSchema,
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
    toolDefinitions.renderChartUrl.name,
    toolDefinitions.renderChartUrl.description,
    toolDefinitions.renderChartUrl.inputSchema,
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
}
