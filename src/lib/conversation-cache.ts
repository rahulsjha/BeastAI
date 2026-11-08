// Small local copy of recent conversations, so any conversation can be reopened
// and continued (History → Continue) even where the database isn't available
// (browser test). Screenshots are kept as small thumbnails only.
import type { AttachedFile, ChatConversation } from "@/types";

const KEY = "beast_conversations_v1";
const MAX = 40;
const THUMB_EDGE = 320;

/** A small JPEG thumbnail of an image (keeps history light). */
export async function makeThumb(base64: string, mime = "image/png"): Promise<string> {
  try {
    // createImageBitmap decodes even in a hidden page (Beast hidden, background
    // tab), where <img>.decode() can wait forever.
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    let src: CanvasImageSource & { width: number; height: number };
    try {
      src = await createImageBitmap(new Blob([bytes], { type: mime }));
    } catch {
      const img = new Image();
      img.src = `data:${mime};base64,${base64}`;
      const decoded = await Promise.race([
        img.decode().then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 1500)),
      ]);
      if (!decoded) return "";
      src = img as any;
    }
    const w = (src as any).naturalWidth || src.width, h = (src as any).naturalHeight || src.height;
    const scale = Math.min(1, THUMB_EDGE / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7).split(",")[1] ?? "";
  } catch {
    return "";
  }
}

/** What a saved message keeps of its attachments: image thumbnails + document names. */
export async function attachmentsForHistory(files: AttachedFile[]): Promise<AttachedFile[] | undefined> {
  if (!files?.length) return undefined;
  const out: AttachedFile[] = [];
  for (const f of files) {
    if (f.type.startsWith("image/")) {
      const thumb = await makeThumb(f.base64, f.type);
      if (thumb) out.push({ id: f.id, name: f.name, type: "image/jpeg", base64: thumb, size: thumb.length, note: f.note });
    } else {
      out.push({ id: f.id, name: f.name, type: f.type, base64: "", size: f.size, note: f.note });
    }
  }
  return out.length ? out : undefined;
}

function load(): ChatConversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ChatConversation[]) : [];
  } catch {
    return [];
  }
}

export function cacheConversation(conv: ChatConversation) {
  try {
    const list = load().filter((c) => c.id !== conv.id);
    list.unshift(conv);
    let keep = list.slice(0, MAX);
    // Stay well inside the storage quota: drop the oldest until it fits.
    while (keep.length > 1) {
      try {
        localStorage.setItem(KEY, JSON.stringify(keep));
        return;
      } catch {
        keep = keep.slice(0, -1);
      }
    }
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch {
    /* best-effort */
  }
}

export function getCachedConversation(id: string): ChatConversation | null {
  return load().find((c) => c.id === id) ?? null;
}
