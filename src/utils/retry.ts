import { RETRY_BASE_DELAY_MS } from "../config/chartOutput.js";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function retryAfterMsFromHeader(value: string | null): number | null {
  if (!value) return null;
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }
  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate)) {
    const delay = parsedDate - Date.now();
    return delay > 0 ? delay : 0;
  }
  return null;
}

export function backoffDelayMs(attempt: number, retryAfterMs: number | null): number {
  const expDelay = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 150);
  const candidate = expDelay + jitter;
  if (retryAfterMs === null) return candidate;
  return Math.max(candidate, retryAfterMs);
}
