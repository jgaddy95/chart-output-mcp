import { isRecord } from "./object.js";

export function normalizeCardSpec(spec: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = { ...spec };

  // Common user shape: root labels/datasets from render_chart payload.
  const labels = Array.isArray(body.labels) ? body.labels : undefined;
  const datasets = Array.isArray(body.datasets) ? body.datasets : undefined;
  if (!isRecord(body.data) && labels && datasets) {
    body.data = { labels, datasets };
  }
  delete body.labels;
  delete body.datasets;

  // render_card returns inline images only.
  if (body.returnUrl === true) {
    delete body.returnUrl;
  }

  // Guard against unsupported header keys that frequently cause API 400s.
  if (isRecord(body.header)) {
    const { title, subtitle, badge } = body.header;
    body.header = {
      ...(typeof title === "string" ? { title } : {}),
      ...(typeof subtitle === "string" ? { subtitle } : {}),
      ...(typeof badge === "string" ? { badge } : {}),
    };
  }

  return body;
}
