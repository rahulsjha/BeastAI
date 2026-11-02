import { useApp } from "@/contexts";
import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components";

interface DebugResult {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * Debug mode: when active, repeatedly captures the screen, compares it with the
 * previous frame via Opus vision, and shows a concise "changed / issue / fix"
 * note. Runs back-to-back (each pass takes a few seconds) rather than a fixed
 * 5s tick, so analyses never overlap.
 */
export const DebugWatcher = () => {
  const { currentMode } = useApp();
  const [watching, setWatching] = useState(false);
  const [latest, setLatest] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const watchingRef = useRef(false);

  const loop = useCallback(async () => {
    while (watchingRef.current) {
      setBusy(true);
      try {
        const r = await invoke<DebugResult>("debug_analyze_screen");
        if (!watchingRef.current) break;
        setLatest(r.success ? r.text || "" : `Error: ${r.error}`);
      } catch (e) {
        setLatest(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      setBusy(false);
      // small gap before the next capture
      await new Promise((res) => setTimeout(res, 5000));
    }
  }, []);

  const toggle = () => {
    const next = !watching;
    setWatching(next);
    watchingRef.current = next;
    if (next) loop();
  };

  // Stop watching if the user leaves Debug mode.
  useEffect(() => {
    if (currentMode !== "debug" && watchingRef.current) {
      watchingRef.current = false;
      setWatching(false);
    }
  }, [currentMode]);

  if (currentMode !== "debug") return null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button
        size="sm"
        variant={watching ? "destructive" : "default"}
        onClick={toggle}
        title="Watch the screen and report changes/issues"
      >
        {watching ? (busy ? "Analyzing…" : "Stop watch") : "Watch screen"}
      </Button>
      {latest && (
        <span
          className="text-[11px] text-muted-foreground max-w-[340px] truncate"
          title={latest}
        >
          {latest.replace(/\n/g, " · ")}
        </span>
      )}
    </div>
  );
};
