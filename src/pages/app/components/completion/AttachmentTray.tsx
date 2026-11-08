import { useState } from "react";
import { Button } from "@/components";
import { FileTextIcon, ImageIcon, PencilIcon, XIcon } from "lucide-react";

interface Attached {
  id: string;
  name: string;
  type: string;
  base64: string;
  size: number;
  text?: string;
  label?: string;
  note?: string;
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Shows exactly what will be sent with the next question: screenshots /
 * images as thumbnails (click to view full size) and documents as chips with
 * how much text was read. Each can be removed.
 */
export function AttachmentTray({
  files,
  onRemove,
  onClear,
  onNote,
  onAddScreen,
  onAddArea,
  onSend,
  onAddText,
  busy,
}: {
  files: Attached[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onNote?: (id: string, note: string) => void;
  /** Add the whole screen / an area to the tray (no send). */
  onAddScreen?: () => void;
  onAddArea?: () => void;
  /** Send everything in the tray now (with anything typed). */
  onSend?: () => void;
  /** Put the cursor in the question bar to type a note / question for these. */
  onAddText?: () => void;
  busy?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const editingFile = files.find((f) => f.id === editing);
  const saveNote = () => {
    if (editing && onNote) onNote(editing, draft.trim());
    setEditing(null);
  };
  if (!files.length) return null;
  const shown = files.find((f) => f.id === preview);

  return (
    <div id="attachment-tray" className="w-full rounded-xl border border-sky-500/30 bg-sky-500/5 px-2 py-1.5">
      <div className="mb-1 text-[11px] font-medium select-none">
        {(() => {
          const shots = files.filter((f) => f.type.startsWith("image/")).length;
          const docs = files.length - shots;
          const what = [shots ? `${shots} screenshot${shots > 1 ? "s" : ""}` : "", docs ? `${docs} file${docs > 1 ? "s" : ""}` : ""]
            .filter(Boolean)
            .join(" + ");
          return `📸 ${what} ready — send now, or add more screenshots / text first`;
        })()}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {files.map((f) => {
          const isImage = f.type.startsWith("image/");
          return (
            <div
              key={f.id}
              className="group relative flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-input/50 bg-background/40 pr-5 pl-1"
              title={isImage ? f.name : `${f.name} — ${f.text?.length ?? 0} characters read`}
            >
              {isImage ? (
                <button onClick={() => setPreview(preview === f.id ? null : f.id)} className="h-8 w-12 overflow-hidden rounded">
                  {f.base64 ? (
                    <img src={`data:${f.type};base64,${f.base64}`} alt={f.name} className="h-full w-full object-cover object-top" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <FileTextIcon className="ml-1 h-4 w-4 text-sky-300" />
              )}
              <div className="max-w-[110px] leading-tight">
                <div className="truncate text-[10px]">
                  {f.label && (
                    <span
                      className={`mr-1 rounded px-1 text-[9px] font-semibold ${
                        f.label === "Before"
                          ? "bg-amber-500/20 text-amber-300"
                          : f.label === "After"
                            ? "bg-green-500/20 text-green-300"
                            : "bg-sky-500/20 text-sky-300"
                      }`}
                    >
                      {f.label.toUpperCase()}
                    </span>
                  )}
                  {isImage && (f.label || /^screenshot/i.test(f.name)) ? "Screenshot" : f.name}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {isImage ? kb(f.size) : `${(f.text?.length ?? 0).toLocaleString()} chars`}
                </div>
                {f.note && (
                  <div className="truncate text-[9px] italic text-sky-300" title={f.note}>
                    “{f.note}”
                  </div>
                )}
              </div>
              {onNote && (
                <button
                  onClick={() => {
                    setEditing(f.id);
                    setDraft(f.note ?? "");
                  }}
                  className={`rounded p-0.5 hover:text-foreground ${f.note ? "text-sky-300" : "text-muted-foreground"}`}
                  title="Add a message about this file"
                >
                  <PencilIcon className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={() => onRemove(f.id)}
                className="absolute right-0.5 top-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
                title="Remove"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <div id="tray-actions" className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {onSend && (
          <Button size="sm" className="h-7 px-3 text-[11px]" disabled={busy} onClick={onSend} title="Send everything now, with anything typed in the bar (Enter)">
            Send now{files.length > 1 ? ` (${files.length})` : ""}
          </Button>
        )}
        {onAddScreen && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy} onClick={onAddScreen} title="Add another whole-screen screenshot (not sent yet)">
            + Another screenshot
          </Button>
        )}
        {onAddArea && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy} onClick={onAddArea} title="Drag to add part of the screen (⌘⇧S)">
            + Area
          </Button>
        )}
        {onAddText && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onAddText} title="Type a question or note to go with these, then press Enter">
            ✎ Add text
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground" onClick={onClear} title="Remove all of these">
          Clear
        </Button>
      </div>
      {editingFile && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="shrink-0 text-[10px] text-muted-foreground">
            Note for {editingFile.type.startsWith("image/") ? "screenshot" : editingFile.name}:
          </span>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveNote();
              }
              if (e.key === "Escape") setEditing(null);
            }}
            placeholder="e.g. this is the error I get on submit"
            className="h-7 min-w-0 flex-1 rounded-md border border-input/50 bg-background/40 px-2 text-xs outline-none focus:border-ring/60"
          />
          <Button size="sm" className="h-7 px-2 text-[10px]" onClick={saveNote}>
            Save
          </Button>
        </div>
      )}
      {shown && (
        <div className="mt-1.5">
          <img
            src={`data:${shown.type};base64,${shown.base64}`}
            alt={shown.name}
            className="max-h-64 w-full rounded-lg border border-input/50 object-contain"
            onClick={() => setPreview(null)}
          />
        </div>
      )}
    </div>
  );
}
