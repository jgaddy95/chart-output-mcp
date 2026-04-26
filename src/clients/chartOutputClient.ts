import { API_BASE, MAX_RETRIES, REQUEST_TIMEOUT_MS, apiKey } from "../config/chartOutput.js";
import { assertChartImageBuffer } from "../utils/image.js";
import { backoffDelayMs, isRetryableStatus, retryAfterMsFromHeader, sleep } from "../utils/retry.js";
import { findRenderUrl } from "../utils/url.js";

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

export function chartOutputHttpError(
  status: number,
  body: Record<string, unknown>,
  statusText: string
): Error {
  const msg =
    typeof body.error === "string" ? body.error : (body.message as string) ?? statusText;
  if (status === 401) {
    return new Error(
      `Chart-Output error 401: ${msg}. Set CHART_OUTPUT_API_KEY to your API key and use Authorization: Bearer (see https://www.chart-output.com/docs/quick-start).`
    );
  }
  if (status === 429) {
    return new Error(
      `Chart-Output error 429: ${msg}. You are being rate-limited. Retry with backoff and respect Retry-After when provided.`
    );
  }
  return new Error(`Chart-Output error ${status}: ${msg}`);
}

export async function fetchWithRetry(
  path: string,
  init: RequestInit,
  options?: { timeoutMs?: number; maxRetries?: number }
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;
  const url = `${API_BASE}${path}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Request timeout")), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (attempt < maxRetries && isRetryableStatus(res.status)) {
        const retryAfter = retryAfterMsFromHeader(res.headers.get("retry-after"));
        await sleep(backoffDelayMs(attempt + 1, retryAfter));
        continue;
      }
      return res;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt >= maxRetries) {
        break;
      }
      await sleep(backoffDelayMs(attempt + 1, null));
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error");
  throw new Error(`Chart-Output request failed after retries: ${errMsg}`);
}

export async function fetchChartAsBase64(
  body: Record<string, unknown>
): Promise<{ base64: string; mimeType: string; url?: string }> {
  const format = (typeof body.format === "string" ? body.format : "png") as string;

  const res = await fetchWithRetry("/api/v1/render", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw chartOutputHttpError(res.status, err, res.statusText);
  }

  const contentType = res.headers.get("content-type") ?? "image/png";
  if (contentType.includes("application/json")) {
    const text = await res.text();
    try {
      const err = JSON.parse(text) as { error?: string };
      throw new Error(`Chart-Output error: ${err.error ?? text.slice(0, 200)}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Chart-Output error:")) {
        throw e;
      }
      throw new Error(
        `Chart-Output returned JSON but it could not be parsed: ${text.slice(0, 200)}`
      );
    }
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  assertChartImageBuffer(buffer, format);
  return {
    base64: buffer.toString("base64"),
    mimeType: contentType,
  };
}

export async function fetchChartUrl(body: Record<string, unknown>): Promise<string> {
  const res = await fetchWithRetry("/api/v1/render", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      ...body,
      returnUrl: true,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw chartOutputHttpError(res.status, err, res.statusText);
  }

  const json = (await res.json()) as unknown;
  const url = findRenderUrl(json);
  if (!url) {
    throw new Error(
      `Chart-Output did not return a render URL. Response: ${JSON.stringify(json).slice(0, 500)}`
    );
  }

  return url;
}

export async function fetchAiChartAsBase64(body: Record<string, unknown>): Promise<{
  base64: string;
  mimeType: string;
  chartType: string;
  generationMs: string;
}> {
  const res = await fetchWithRetry("/api/v1/ai/render", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 403) {
      throw new Error(
        "AI rendering requires a Chart-Output Pro or Business API key. Get one at chart-output.com/pricing"
      );
    }
    throw chartOutputHttpError(res.status, err, res.statusText);
  }

  const contentType = res.headers.get("content-type") ?? "image/png";
  if (contentType.includes("application/json")) {
    const text = await res.text();
    const err = JSON.parse(text) as { error?: string };
    throw new Error(`Chart-Output error: ${err.error ?? text.slice(0, 200)}`);
  }
  const chartType = res.headers.get("x-ai-chart-type") ?? "unknown";
  const generationMs = res.headers.get("x-ai-generation-ms") ?? "?";
  const buffer = Buffer.from(await res.arrayBuffer());
  const format = typeof body.format === "string" ? body.format : "png";
  assertChartImageBuffer(buffer, format);

  return {
    base64: buffer.toString("base64"),
    mimeType: contentType,
    chartType,
    generationMs,
  };
}
