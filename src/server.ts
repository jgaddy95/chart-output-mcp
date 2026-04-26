import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiKey } from "./config/chartOutput.js";
import { SERVER_INSTRUCTIONS } from "./constants/instructions.js";
import { loadExampleIds, registerExampleResources } from "./resources/examples.js";
import { registerTools } from "./tools/index.js";

let warnedMissingApiKey = false;

type CreateServerOptions = {
  hasRequestScopedApiKey?: boolean;
};

export function createServer(options: CreateServerOptions = {}): McpServer {
  if (!apiKey && !options.hasRequestScopedApiKey && !warnedMissingApiKey) {
    console.error(
      "chart-output-mcp: CHART_OUTPUT_API_KEY is not set. The Chart-Output API requires a key for /api/v1/render (see https://www.chart-output.com/docs/quick-start)."
    );
    warnedMissingApiKey = true;
  }

  const exampleIds = loadExampleIds();
  const server = new McpServer(
    {
      name: "chart-output-mcp",
      version: "1.0.10",
    },
    { instructions: SERVER_INSTRUCTIONS }
  );

  registerExampleResources(server, exampleIds);
  registerTools(server, exampleIds);
  return server;
}
