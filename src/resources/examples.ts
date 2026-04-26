import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function getExamplesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples");
}

export function loadExampleIds(): string[] {
  const dir = getExamplesDir();
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json"))
    .sort();
}

export function readExampleSpec(id: string): string {
  return readFileSync(join(getExamplesDir(), `${id}.json`), "utf8");
}

export function registerExampleResources(server: McpServer, exampleIds: string[]): void {
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
}
