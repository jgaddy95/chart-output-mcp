import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readExampleSpec } from "../resources/examples.js";
import { toolDefinitions } from "./definitions.js";

export function registerExampleTools(server: McpServer, exampleIds: string[]): void {
  const exampleIdHelp =
    exampleIds.length > 0
      ? exampleIds.map((id) => `- ${id}`).join("\n")
      : "(no example files found next to the server; reinstall the package.)";

  server.tool(
    toolDefinitions.listExamples.name,
    toolDefinitions.listExamples.description,
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
    toolDefinitions.getExample.name,
    toolDefinitions.getExample.description,
    toolDefinitions.getExample.inputSchema,
    async ({ example }) => {
      const id = example.trim();
      if (!exampleIds.includes(id)) {
        throw new Error(
          `Unknown example "${id}". Valid ids: ${exampleIds.length ? exampleIds.join(", ") : "none"}. Call list_chart_output_examples.`
        );
      }
      const text = readExampleSpec(id);
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
