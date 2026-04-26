export function buildChartRenderBody(args: {
  extensions?: Record<string, unknown>;
  type: string;
  labels: string[];
  datasets: unknown[];
  width: number;
  height: number;
  format: string;
  title?: string;
  returnUrl?: boolean;
}): Record<string, unknown> {
  const { extensions, type, labels, datasets, width, height, format, title, returnUrl } = args;
  const body: Record<string, unknown> = {
    ...(extensions ?? {}),
    type,
    width,
    height,
    format,
    data: { labels, datasets },
  };
  if (returnUrl) {
    body.returnUrl = true;
  }
  if (title) {
    const opts = (body.options as Record<string, unknown> | undefined) ?? {};
    const plugins = (opts.plugins as Record<string, unknown> | undefined) ?? {};
    body.options = {
      ...opts,
      plugins: {
        ...plugins,
        title: { display: true, text: title },
      },
    };
  }
  return body;
}
