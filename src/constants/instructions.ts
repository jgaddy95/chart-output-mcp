export const SERVER_INSTRUCTIONS = `You are using Chart-Output MCP to render charts and dashboard cards as images (PNG, JPEG, WebP, or SVG).

Authentication: All render tools require CHART_OUTPUT_API_KEY (sent as Bearer token). If any call returns 401, the key is missing or invalid — the user must set CHART_OUTPUT_API_KEY in the MCP server environment. render_chart_ai additionally requires a Pro or Business key; a Free key returns 403.

Tool selection guide:
1. list_chart_output_examples — call this first when building a card or after receiving HTTP 400, to see all valid example ids.
2. get_chart_example — call this to retrieve a full, API-valid JSON body for a given example id. Always start render_card or render_card_url from this spec; do not hand-author a card spec.
3. render_chart — use when you have structured labels + datasets and want an inline image. Supports line, bar, pie, doughnut, radar, polarArea. Use the "extensions" field to add Chart-Output dashboard features (header, footer, kpiStrip, theme, backgroundColor) without a full card spec.
4. render_chart_url — same inputs as render_chart but returns a CDN URL string instead of image bytes. Use when embedding in HTML, markdown, or email.
5. render_card — use for full branded dashboard cards (header, KPI strip, footer, theme, brandKitId) when you want an inline image. The "spec" field is the full POST /api/v1/render body. Do NOT set returnUrl. Always start from get_chart_example output.
6. render_card_url — use for full branded dashboard cards when you need an openable/shareable CDN URL instead of inline image bytes. The "spec" field is the full POST /api/v1/render body. returnUrl is handled automatically.
7. render_chart_ai — use when data is in natural language or raw tabular form (JSON array or CSV). Requires Pro/Business key. Does NOT support SVG or custom Chart.js options.

Defaults: 800×400 pixels, PNG format. Labels array length must match every dataset's data array length or the API returns 400. Card layout reference: https://www.chart-output.com/docs/card-composition`;
