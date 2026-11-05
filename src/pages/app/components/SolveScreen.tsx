import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components";
import { Loader2, ScanTextIcon } from "lucide-react";
import type { ModeKey } from "@/config/modes";

interface ExtractResult {
  success: boolean;
  found: boolean;
  kind?: string;
  title?: string;
  question?: string;
  image?: string;
  error?: string;
}

const GAP_MS = 4000;

// Question type on screen → interview mode used to answer it.
const MODE_FOR_KIND: Record<string, ModeKey> = {
  coding: "coding",
  design: "system_design",
  concept: "conceptual",
  mcq: "conceptual",
  debug: "debug",
};

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Same question if most of the words overlap (scrolling / small OCR differences).
const sameQuestion = (a: string, b: string) => {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return false;
  let common = 0;
  A.forEach((w) => B.has(w) && common++);
  return common / Math.min(A.size, B.size) >= 0.7;
};

/**
 * "Solve screen": keeps reading the screen; whenever a new question appears
 * (LeetCode, HackerRank, a quiz, a design prompt …) it is extracted and sent to
 * the answer queue in the matching mode. Questions already answered are skipped.
 */
export function SolveScreen({
  onQuestion,
}: {
  onQuestion: (question: string, mode: ModeKey, title?: string) => void;
}) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [found, setFound] = useState(0);
  const [last, setLast] = useState<{ image?: string; result: string; at: number } | null>(null);
  const onRef = useRef(false);
  const seen = useRef<string[]>([]);
  const onQuestionRef = useRef(onQuestion);
  onQuestionRef.current = onQuestion;

  const loop = useCallback(async () => {
    while (onRef.current) {
      setBusy(true);
      setStatus("Reading screen…");
      const t0 = Date.now();
      try {
        const r = await invoke<ExtractResult>("extract_screen_question");
        if (!onRef.current) break;
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        setLast({
          image: r.image,
          at: Date.now(),
          result: !r.success
            ? `Error: ${r.error}`
            : r.found && r.question
              ? `Found ${r.kind ?? "question"}: ${r.title ?? ""}\n\n${r.question}`
              : "No question on this screen.",
        });
        if (!r.success) {
          setStatus(`Error: ${r.error ?? "could not read screen"}`);
        } else if (!r.found || !r.question) {
          setStatus(`No question on screen (${secs}s)`);
        } else if (seen.current.some((q) => sameQuestion(q, r.question!))) {
          setStatus(`Same question still on screen (${secs}s)`);
        } else {
          seen.current.push(r.question);
          const mode = MODE_FOR_KIND[r.kind ?? ""] ?? "conceptual";
          onQuestionRef.current(r.question, mode, r.title);
          setFound((n) => n + 1);
          setStatus(`New ${r.kind ?? "question"}: ${r.title ?? r.question.slice(0, 40)} (${secs}s)`);
        }
      } catch (e) {
        setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
      setBusy(false);
      await new Promise((res) => setTimeout(res, GAP_MS));
    }
  }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    onRef.current = next;
    if (next) {
      setStatus("Starting…");
      loop();
    } else {
      setStatus("");
    }
  };

  useEffect(() => () => void (onRef.current = false), []);

  // ⌘⇧O (Ctrl+Shift+O) starts/stops monitoring.
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    let off: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ action: string }>("custom-shortcut-triggered", (e) => {
        if (e.payload?.action === "solve_screen") toggleRef.current();
      }).then((u) => (off = u))
    );
    return () => off?.();
  }, []);

  return (
    <div className="flex items-center gap-2 shrink-0 min-w-0">
      <Button
        size="sm"
        variant={on ? "destructive" : "default"}
        onClick={toggle}
        className="h-9 gap-1.5 px-3"
        title="Keep reading the screen and answer every new question that appears (⌘⇧O)"
      >
        {on && busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanTextIcon className="h-3.5 w-3.5" />}
        {on ? "Stop" : "Solve screen"}
      </Button>
      {last?.image && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-8 w-11 shrink-0 overflow-hidden rounded border border-input/60"
              title="What Solve screen captured last (click to see what it read)"
            >
              <img src={`data:image/png;base64,${last.image}`} alt="Last capture" className="h-full w-full object-cover object-top" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" sideOffset={8} className="w-screen max-w-[600px] p-3">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Captured {new Date(last.at).toLocaleTimeString()} · this is exactly what was read
            </div>
            <img src={`data:image/png;base64,${last.image}`} alt="Captured screen" className="mb-2 w-full rounded border border-input/50" />
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs">{last.result}</pre>
          </PopoverContent>
        </Popover>
      )}
      {on && (
        <span className="max-w-[140px] truncate whitespace-nowrap text-[10px] text-muted-foreground" title={status}>
          {found > 0 && <span className="text-green-400">{found} found · </span>}
          {status}
        </span>
      )}
    </div>
  );
}
