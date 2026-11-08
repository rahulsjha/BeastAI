// Screenshots are captured at full Retina size (e.g. 2880×1800, several MB).
// Claude reads images at up to ~1568px on the long side anyway, so scale down
// before sending: much smaller upload, faster answers, same readable text.
export const MAX_IMAGE_EDGE = 1568;

export async function downscalePng(base64: string, maxEdge = MAX_IMAGE_EDGE, mime = "image/png"): Promise<string> {
  try {
    const img = new Image();
    img.src = `data:${mime};base64,${base64}`;
    // Hidden pages (Beast hidden with ⌘\, a background tab) can defer image
    // decoding indefinitely; never hold a screenshot hostage to it.
    const decoded = await Promise.race([
      img.decode().then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
    ]);
    if (!decoded) return base64;
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    // Already small enough: still re-encode non-PNG images as PNG (sent as image/png).
    if (scale >= 1 && mime === "image/png") return base64;
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
