import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components";
import { CameraIcon, ClipboardPasteIcon, FileTextIcon, Loader2, SearchCodeIcon } from "lucide-react";

const b64ToFile = (b64: string, name: string) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: "image/png" });
};

/**
 * Debug mode kit: attach BEFORE / AFTER screenshots and proof (stack traces,
 * logs, error output), then Analyze. Everything is labelled so the answer can
 * compare Before vs After and quote the evidence.
 */
export function DebugKit({
  addFile,
  submit,
  attachedCount,
  isLoading,
}: {
  addFile: (file: File, label?: string) => Promise<void>;
  submit: (text?: string) => void;
  attachedCount: number;
  isLoading: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [trace, setTrace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const traceCount = useRef(0);

  const shot = async (label: "Before" | "After") => {
    setError(null);
    setBusy(label);
    try {
      const b64 = await invoke<string>("capture_to_base64");
      await addFile(b64ToFile(b64, `${label.toLowerCase()}-screenshot.png`), label);
    } catch (e) {
      setError(`Screenshot failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const addTrace = async () => {
    const text = trace.trim();
    if (!text) return;
    traceCount.current += 1;
    await addFile(new File([text], `trace-${traceCount.current}.log`, { type: "text/plain" }), "Trace");
    setTrace("");
    setPasting(false);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setTrace(text);
    } catch {
      /* clipboard not available — user pastes into the box */
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-9 gap-1 px-2.5" onClick={() => shot("Before")} disabled={!!busy}>
          {busy === "Before" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CameraIcon className="h-3.5 w-3.5" />}
          Before
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1 px-2.5" onClick={() => shot("After")} disabled={!!busy}>
          {busy === "After" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CameraIcon className="h-3.5 w-3.5" />}
          After
        </Button>
        <Button
          size="sm"
          variant={pasting ? "default" : "outline"}
          className="h-9 gap-1 px-2.5"
          onClick={() => {
            setPasting((p) => !p);
            if (!pasting) void pasteFromClipboard();
          }}
          title="Paste a stack trace, logs or error output"
        >
          <ClipboardPasteIcon className="h-3.5 w-3.5" />
          Trace
        </Button>
        <Button size="sm" variant="outline" className="h-9 w-9 px-0" onClick={() => fileRef.current?.click()} title="Attach a log file">
          <FileTextIcon className="h-3.5 w-3.5" />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".log,.txt,.json,.out,.err,text/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            for (const f of Array.from(e.target.files ?? [])) await addFile(f, "Trace");
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          className="h-9 gap-1 px-3"
          disabled={isLoading || attachedCount === 0}
          onClick={() =>
            submit(
              "Debug this. Use the attached BEFORE/AFTER screenshots and traces as evidence, and give root cause, fix and Before vs After."
            )
          }
          title={attachedCount ? "Analyze the attached evidence" : "Attach a screenshot or trace first"}
        >
          <SearchCodeIcon className="h-3.5 w-3.5" />
          Analyze
        </Button>
      </div>
      {pasting && (
        <div className="flex flex-col gap-1">
          <textarea
            value={trace}
            onChange={(e) => setTrace(e.target.value)}
            placeholder="Paste a stack trace, logs or error output…"
            className="h-24 w-full resize-none rounded-lg border border-input/60 bg-background/40 p-2 font-mono text-[11px] outline-none focus:border-ring/60"
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 px-3 text-xs" onClick={addTrace} disabled={!trace.trim()}>
              Attach trace
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setPasting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <div className="text-[10px] text-red-300">{error}</div>}
    </div>
  );
}
