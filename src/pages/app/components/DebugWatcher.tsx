import { useApp } from "@/contexts";
import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
} from "@/components";
import { XIcon } from "lucide-react";

interface DebugResult {
  success: boolean;
  text?: string;
  error?: string;
  /** base64 PNG of the frame that was sent to the model */
  image?: string;
}

interface Frame {
  id: number;
  at: string;
  text: string;
  image?: string;
}

const MAX_FRAMES = 6;

/**
 * Debug mode: repeatedly captures the screen, compares it with the previous
 * frame via Opus vision, and shows exactly what was sent (the screenshot) plus
 * the full "Changed / Issue / Fix" analysis. Runs back-to-back (never
 * overlapping) with a short gap; stops when the user leaves Debug mode.
 */
export const DebugWatcher = () => {
  const { currentMode } = useApp();
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [open, setOpen] = useState(false);
  const watchingRef = useRef(false);
  const seq = useRef(0);

  const loop = useCallback(async () => {
    while (watchingRef.current) {
      setBusy(true);
      try {
        const r = await invoke<DebugResult>("debug_analyze_screen");
        if (!watchingRef.current) break;
        const text = r.success ? r.text || "" : `Error: ${r.error}`;
        setFrames((prev) =>
          [
            {
              id: ++seq.current,
              at: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
              text,
              image: r.image,
            },
            ...prev,
          ].slice(0, MAX_FRAMES)
        );
        setOpen(true);
      } catch (e) {
        setFrames((prev) =>
          [
            {
              id: ++seq.current,
              at: new Date().toLocaleTimeString(),
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
            ...prev,
          ].slice(0, MAX_FRAMES)
        );
      }
      setBusy(false);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }, []);

  const toggle = () => {
    const next = !watching;
    setWatching(next);
    watchingRef.current = next;
    if (next) loop();
  };

  // Stop if the user leaves Debug mode.
  useEffect(() => {
    if (currentMode !== "debug" && watchingRef.current) {
      watchingRef.current = false;
      setWatching(false);
    }
  }, [currentMode]);

  if (currentMode !== "debug") return null;

  const latest = frames[0];

  return (
    <Popover open={open && frames.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant={watching ? "destructive" : "default"}
            onClick={toggle}
            title="Watch the screen and report changes/issues"
          >
            {watching ? (busy ? "Analyzing…" : "Stop watch") : "Watch screen"}
          </Button>
          {frames.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              title="Show what was captured and the full analysis"
            >
              {frames.length} frame{frames.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        className="w-screen p-0 border shadow-lg overflow-hidden"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-xs select-none">Debug · screen watch</h3>
            <span className="text-[10px] text-muted-foreground">
              {watching ? "capturing every ~5s after each analysis" : "stopped"}
            </span>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setOpen(false)} title="Close">
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-9rem)]">
          <div className="p-4 space-y-4">
            {latest && (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Sent to the model · {latest.at}
                  </div>
                  {latest.image ? (
                    <img
                      src={`data:image/png;base64,${latest.image}`}
                      alt="Captured screen"
                      className="w-full rounded-lg border border-input/50"
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">(no frame image)</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Analysis
                  </div>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                    {latest.text}
                  </pre>
                </div>
              </div>
            )}

            {frames.length > 1 && (
              <div className="space-y-2 pt-2 border-t border-input/40">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Earlier frames
                </div>
                {frames.slice(1).map((f) => (
                  <div key={f.id} className="text-xs rounded-md bg-muted/40 p-2">
                    <span className="text-muted-foreground mr-2">{f.at}</span>
                    <span className="whitespace-pre-wrap">{f.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
