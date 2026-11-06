// Screenshots are captured at full Retina size (e.g. 2880×1800, several MB).
// Claude reads images at up to ~1568px on the long side anyway, so scale down
// before sending: much smaller upload, faster answers, same readable text.
export const MAX_IMAGE_EDGE = 1568;

export async function downscalePng(base64: string, maxEdge = MAX_IMAGE_EDGE): Promise<string> {
  try {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale >= 1) return base64;
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return base64;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1] ?? base64;
  } catch {
    return base64; // never block a screenshot on resizing
  }
}
