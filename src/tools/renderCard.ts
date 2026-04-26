import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchChartAsBase64, fetchChartUrl } from "../clients/chartOutputClient.js";
import { normalizeCardSpec } from "../utils/cardSpec.js";
import { toolDefinitions } from "./definitions.js";

export function registerRenderCardTools(server: McpServer): void {
  server.tool(
    toolDefinitions.renderCard.name,
    toolDefinitions.renderCard.description,
    toolDefinitions.renderCard.inputSchema,
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
    toolDefinitions.renderCardUrl.name,
    toolDefinitions.renderCardUrl.description,
    toolDefinitions.renderCardUrl.inputSchema,
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
}
