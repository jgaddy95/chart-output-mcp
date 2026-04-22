# Chart-Output MCP Server

Render Chart.js configs to PNG, SVG, WebP, or JPEG images from any
MCP-compatible AI agent — Claude, Cursor, Windsurf, and more.

## Tools

- `render_chart` — Chart.js spec → inline image
- `render_chart_url` — Chart.js spec → CDN URL (for email/HTML embedding)
- `render_chart_ai` — Natural language + data → image (Pro/Business key required)

## Setup

### Claude Desktop / Cursor / Windsurf

Add to your `mcp.json`:

```json
{
  "mcpServers": {
    "chart-output": {
      "command": "npx",
      "args": ["@chartoutput/mcp"],
      "env": {
        "CHART_OUTPUT_API_KEY": "pk_test_YOUR_KEY"
      }
    }
  }
}
```

**An API key is required.** Without `CHART_OUTPUT_API_KEY`, the API responds with JSON errors (for example `Missing API key`). If you save that response to a `.png` file, previews will fail—it is not image bytes.

Use `Authorization: Bearer <key>` as described in the [Quick Start](https://www.chart-output.com/docs/quick-start). Your dashboard provides `pk_test_…` (development) and `pk_live_…` (production) keys.

## Get an API Key

Sign up → API Keys → Create key. See [Quick Start](https://www.chart-output.com/docs/quick-start) for the exact request shape and headers.
