// Browser stand-in for the desktop area-selection overlay (capture.rs).
// Shows the current screen full-window; the user drags a rectangle and the
// cropped image is emitted as "captured-selection" (base64 PNG), exactly like
// the native overlay. Esc cancels ("capture-closed"); double-click = whole screen.
type Emit = (event: string, payload?: unknown) => void;

export async function start(emit: Emit) {
  // Go full screen first (needs the shortcut's user gesture), so the frozen
  // screen picture lines up 1:1 with the real screen — like the native overlay.
  const fs = document.documentElement.requestFullscreen?.().catch(() => undefined);
  const res = await fetch("http://localhost:8787/screenshot", { method: "POST", body: "{}" });
  const { image } = (await res.json()) as { image: string };
  const img = new Image();
  img.src = `data:image/png;base64,${image}`;
  await img.decode();
  await fs;

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#000;cursor:crosshair;user-select:none";
  const view = document.createElement("img");
  view.src = img.src;
  view.draggable = false;
  view.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;filter:brightness(.7)";
  const box = document.createElement("div");
  box.style.cssText =
    "position:absolute;border:2px solid #4ade80;display:none;box-shadow:0 0 0 9999px rgba(0,0,0,.25);backdrop-filter:brightness(1.43)";
  const hint = document.createElement("div");
  hint.textContent = "Drag to select the area to attach · double-click = whole screen · Esc = cancel";
  hint.style.cssText =
    "position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#111c;color:#fff;font:12px system-ui;padding:6px 10px;border-radius:8px";
  overlay.append(view, box, hint);
  document.body.appendChild(overlay);

  // Map a point on screen to image pixels (object-fit: contain).
  const toImage = (x: number, y: number) => {
    const r = view.getBoundingClientRect();
    const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const ox = r.left + (r.width - w) / 2;
    const oy = r.top + (r.height - h) / 2;
    return {
      x: Math.max(0, Math.min(img.naturalWidth, (x - ox) / scale)),
      y: Math.max(0, Math.min(img.naturalHeight, (y - oy) / scale)),
    };
  };

  let done = false;
  const finish = (b64?: string) => {
    if (done) return;
    done = true;
    overlay.remove();
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("fullscreenchange", onFsChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    if (b64) emit("captured-selection", b64);
    else emit("capture-closed");
  };
  const crop = (x: number, y: number, w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = Math.round(w);
    c.height = Math.round(h);
    c.getContext("2d")!.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1];
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
    }
  };
  window.addEventListener("keydown", onKey, true);
  // Esc in full screen is taken by the browser (it leaves full screen): treat that as cancel.
  const onFsChange = () => {
    if (!document.fullscreenElement) finish();
  };
  document.addEventListener("fullscreenchange", onFsChange);

  let start: { x: number; y: number } | null = null;
  overlay.addEventListener("dblclick", () => finish(image));
  overlay.addEventListener("mousedown", (e) => {
    start = { x: e.clientX, y: e.clientY };
    Object.assign(box.style, { display: "block", left: `${e.clientX}px`, top: `${e.clientY}px`, width: "0px", height: "0px" });
  });
  overlay.addEventListener("mousemove", (e) => {
    if (!start) return;
    Object.assign(box.style, {
      left: `${Math.min(start.x, e.clientX)}px`,
      top: `${Math.min(start.y, e.clientY)}px`,
      width: `${Math.abs(e.clientX - start.x)}px`,
      height: `${Math.abs(e.clientY - start.y)}px`,
    });
  });
  overlay.addEventListener("mouseup", (e) => {
    if (!start) return;
    const a = toImage(start.x, start.y);
    const b = toImage(e.clientX, e.clientY);
    start = null;
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (w < 8 || h < 8) {
      box.style.display = "none"; // just a click — keep selecting
      return;
    }
    finish(crop(Math.min(a.x, b.x), Math.min(a.y, b.y), w, h));
  });
}

export function installBrowserCrop() {
  (window as any).__browserCrop = { start };
}
