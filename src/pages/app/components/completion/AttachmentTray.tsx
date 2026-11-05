import { useState } from "react";
import { Button } from "@/components";
import { FileTextIcon, ImageIcon, XIcon } from "lucide-react";

interface Attached {
  id: string;
  name: string;
  type: string;
  base64: string;
  size: number;
  text?: string;
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
}: {
  files: Attached[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
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
                <div className="truncate text-[10px]">{isImage && /^screenshot/i.test(f.name) ? "Screenshot" : f.name}</div>
                <div className="text-[9px] text-muted-foreground">
                  {isImage ? kb(f.size) : `${(f.text?.length ?? 0).toLocaleString()} chars`}
                </div>
              </div>
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
        {files.length > 1 && (
          <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[10px]" onClick={onClear}>
            Clear all
          </Button>
        )}
      </div>
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
