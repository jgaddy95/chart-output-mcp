import { AsyncLocalStorage } from "node:async_hooks";
import { apiKey as envApiKey } from "./chartOutput.js";

type RequestContext = {
  chartOutputApiKey?: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return requestContext.run(context, callback);
}

export function getChartOutputApiKey(): string | null {
  return requestContext.getStore()?.chartOutputApiKey ?? envApiKey;
}
