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
    <div className="w-full rounded-xl border border-input/50 bg-muted/20 px-2 py-1.5">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground select-none mr-0.5">
          Sending with next question:
        </span>
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
        {onAddScreen && (
          <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" disabled={busy} onClick={onAddScreen} title="Add the whole screen (not sent yet)">
            + Screen
          </Button>
        )}
        {onAddArea && (
          <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" disabled={busy} onClick={onAddArea} title="Add an area (⌘⇧S)">
            + Area
          </Button>
        )}
        {files.length > 1 && (
          <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[10px]" onClick={onClear}>
            Clear all
          </Button>
        )}
        {onSend && (
          <Button size="sm" className="h-6 shrink-0 px-2 text-[10px]" disabled={busy} onClick={onSend} title="Send all of these together (Enter)">
            Send {files.length}
          </Button>
        )}
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
