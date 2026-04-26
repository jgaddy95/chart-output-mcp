// Use www host: apex chart-output.com returns 308 with body "Redirecting..."; clients that
// don't follow redirects save that text as if it were image bytes.
export const API_BASE = "https://www.chart-output.com";

export const apiKey = process.env.CHART_OUTPUT_API_KEY ?? null;
export const REQUEST_TIMEOUT_MS = Number(process.env.CHART_OUTPUT_TIMEOUT_MS ?? 20000);
export const MAX_RETRIES = Number(process.env.CHART_OUTPUT_MAX_RETRIES ?? 2);
export const RETRY_BASE_DELAY_MS = Number(process.env.CHART_OUTPUT_RETRY_BASE_MS ?? 500);
