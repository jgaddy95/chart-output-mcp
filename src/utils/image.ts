export function assertChartImageBuffer(buffer: Buffer, format: string): void {
  const headUtf8 = buffer.toString("utf8", 0, Math.min(buffer.length, 256)).trimStart();
  if (headUtf8.startsWith("Redirecting")) {
    throw new Error(
      "Got a redirect placeholder body instead of image bytes. Use https://www.chart-output.com or enable HTTP redirect following (308)."
    );
  }
  if (headUtf8.startsWith("{")) {
    try {
      const j = JSON.parse(buffer.toString("utf8")) as { error?: string };
      throw new Error(
        `Chart-Output returned JSON instead of an image: ${j.error ?? buffer.toString("utf8", 0, 200)}`
      );
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Chart-Output returned JSON")) {
        throw e;
      }
    }
  }

  const f = format === "jpeg" ? "jpeg" : format;
  if (f === "png") {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < sig.length || !buffer.subarray(0, sig.length).equals(sig)) {
      throw new Error(
        "Response is not a valid PNG (wrong file signature). Check the API URL and that you are not saving a redirect response."
      );
    }
  } else if (f === "jpeg") {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new Error(
        "Response is not a valid JPEG (wrong file signature). Check the API URL and that you are not saving a redirect response."
      );
    }
  } else if (f === "webp") {
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
      buffer.subarray(8, 12).toString("ascii") !== "WEBP"
    ) {
      throw new Error(
        "Response is not a valid WebP (wrong file signature). Check the API URL and that you are not saving a redirect response."
      );
    }
  } else if (f === "svg") {
    const sample = buffer.toString("utf8", 0, Math.min(buffer.length, 8192)).trimStart().toLowerCase();
    if (!sample.includes("<svg")) {
      throw new Error(
        "Response is not valid SVG markup. Check the API URL and that you are not saving a redirect response."
      );
    }
  }
}
