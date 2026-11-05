import { useApp } from "@/contexts";
import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Popover, PopoverContent, PopoverTrigger, ScrollArea } from "@/components";
import { CheckCircle2Icon, CircleDotIcon, EyeIcon, Loader2, XIcon } from "lucide-react";

interface DebugResult {
  success: boolean;
  text?: string;
  error?: string;
  image?: string; // base64 PNG of the frame that was sent to the model
}

interface Frame {
  id: number;
  at: number;
  durationMs: number;
  changed: string;
  issue: string;
  fix: string;
  raw: string;
  image?: string;
  error?: string;
}

interface TrackedIssue {
  id: number;
  text: string;
  fix: string;
  firstSeen: number;
  lastSeen: number;
  resolvedAt?: number;
}

const MAX_FRAMES = 8;
const GAP_MS = 5000;

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// "Changed: … / Issue: … / Fix: …" → fields (tolerates extra lines).
function parseAnalysis(text: string) {
  const grab = (label: string) => {
    const m = text.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(Changed|Issue|Fix)\\s*:|$)`, "i"));
    return (m?.[1] ?? "").trim();
  };
  return { changed: grab("Changed"), issue: grab("Issue"), fix: grab("Fix") };
}

const isNoIssue = (issue: string) =>
  !issue || /^(none|no issue|nothing|n\/a|-|none visible)/i.test(issue.replace(/[*_`]/g, "").trim());

const sameIssue = (a: string, b: string) => {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? []);
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let common = 0;
  A.forEach((w) => B.has(w) && common++);
  return common / Math.min(A.size, B.size) >= 0.4;
};

/**
 * Debug mode "Watch screen": captures the screen every few seconds, compares it
 * with the previous frame, and shows live progress, what is on screen, the
 * current issue and fix, and an issue tracker that marks issues resolved once
 * they disappear from the screen.
 */
export const DebugWatcher = () => {
  const { currentMode } = useApp();
  const [watching, setWatching] = useState(false);
  const [phase, setPhase] = useState<"idle" | "analyzing" | "waiting">("idle");
  const [phaseStart, setPhaseStart] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [frames, setFrames] = useState<Frame[]>([]);
  const [issues, setIssues] = useState<TrackedIssue[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const watchingRef = useRef(false);
  const seq = useRef(0);
  const issueSeq = useRef(0);

  // Live timer for the progress line.
  useEffect(() => {
    if (!watching) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [watching]);

  const trackIssues = useCallback((frame: Frame) => {
    setIssues((prev) => {
      const next = prev.map((i) => ({ ...i }));
      const openOnes = next.filter((i) => !i.resolvedAt);
      if (isNoIssue(frame.issue)) {
        // Nothing wrong on screen now → everything still open is resolved.
        openOnes.forEach((i) => (i.resolvedAt = frame.at));
        return next;
      }
      const match = openOnes.find((i) => sameIssue(i.text, frame.issue));
      if (match) {
        match.lastSeen = frame.at;
        match.text = frame.issue;
        match.fix = frame.fix || match.fix;
      } else {
        // A different issue replaced the old one(s) → those are resolved.
        openOnes.forEach((i) => (i.resolvedAt = frame.at));
        next.push({ id: ++issueSeq.current, text: frame.issue, fix: frame.fix, firstSeen: frame.at, lastSeen: frame.at });
      }
      return next;
    });
  }, []);

  const loop = useCallback(async () => {
    while (watchingRef.current) {
      const t0 = Date.now();
      setPhase("analyzing");
      setPhaseStart(t0);
      let frame: Frame;
      try {
        const r = await invoke<DebugResult>("debug_analyze_screen");
        const raw = r.success ? r.text || "" : "";
        frame = {
          id: ++seq.current,
          at: Date.now(),
          durationMs: Date.now() - t0,
          ...parseAnalysis(raw),
          raw,
          image: r.image,
          error: r.success ? undefined : r.error,
        };
      } catch (e) {
        frame = {
          id: ++seq.current,
          at: Date.now(),
          durationMs: Date.now() - t0,
          changed: "",
          issue: "",
          fix: "",
          raw: "",
          error: e instanceof Error ? e.message : String(e),
        };
      }
      if (!watchingRef.current) break;
      setFrames((prev) => [frame, ...prev].slice(0, MAX_FRAMES));
      setSelected(null);
      if (!frame.error) trackIssues(frame);
      setOpen(true);
      setPhase("waiting");
      setPhaseStart(Date.now());
      await new Promise((res) => setTimeout(res, GAP_MS));
    }
    setPhase("idle");
  }, [trackIssues]);

  const toggle = () => {
    const next = !watching;
    setWatching(next);
    watchingRef.current = next;
    if (next) {
      setOpen(true);
      loop();
    }
  };

  useEffect(() => {
    if (currentMode !== "debug" && watchingRef.current) {
      watchingRef.current = false;
      setWatching(false);
    }
  }, [currentMode]);

  if (currentMode !== "debug") return null;

  const shown = frames.find((f) => f.id === selected) ?? frames[0];
  const openIssues = issues.filter((i) => !i.resolvedAt);
  const resolved = issues.filter((i) => i.resolvedAt);
  const elapsed = ((now - phaseStart) / 1000).toFixed(1);
  const avg = frames.length
    ? (frames.reduce((a, f) => a + f.durationMs, 0) / frames.length / 1000).toFixed(1)
    : null;

  return (
    <Popover open={open && (watching || frames.length > 0)} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant={watching ? "destructive" : "default"} onClick={toggle} className="h-9 gap-1.5 px-3">
            {watching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeIcon className="h-3.5 w-3.5" />}
            {watching ? (phase === "analyzing" ? `Analyzing ${elapsed}s` : "Stop") : "Watch screen"}
          </Button>
          {(frames.length > 0 || watching) && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="whitespace-nowrap text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              {frames.length} frame{frames.length === 1 ? "" : "s"}
              {openIssues.length > 0 && ` · ${openIssues.length} open`}
            </button>
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent align="start" side="bottom" className="w-screen p-0 border shadow-lg overflow-hidden" sideOffset={8}>
        {/* Header + live progress */}
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30">
          <h3 className="font-semibold text-xs select-none">Debug · screen watch</h3>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {phase === "analyzing" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-sky-300" />
                Frame {seq.current + 1}: capturing screen &amp; analyzing with Opus… {elapsed}s
              </>
            )}
            {phase === "waiting" && watching && (
              <>
                <CircleDotIcon className="h-3 w-3 text-green-400" />
                Next capture in {Math.max(0, (GAP_MS - (now - phaseStart)) / 1000).toFixed(0)}s
              </>
            )}
            {!watching && "stopped"}
            {avg && <span className="ml-2">· avg {avg}s per frame</span>}
          </span>
          <div className="flex-1" />
          <Button size="icon" variant="ghost" onClick={() => setOpen(false)} title="Close">
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-9rem)]">
          <div className="p-4 space-y-4">
            {!shown && (
              <p className="text-sm text-muted-foreground">Capturing the first frame…</p>
            )}

            {shown && (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* What's on screen */}
                <div className="min-w-0">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    On screen · frame {shown.id} · {clock(shown.at)} · analyzed in {(shown.durationMs / 1000).toFixed(1)}s
                  </div>
                  {shown.image ? (
                    <img src={`data:image/png;base64,${shown.image}`} alt="Captured screen" className="w-full rounded-lg border border-input/50" />
                  ) : (
                    <div className="text-xs text-muted-foreground">(no frame image)</div>
                  )}
                </div>

                {/* What we're resolving */}
                <div className="min-w-0 space-y-2">
                  {shown.error ? (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                      {shown.error}
                    </div>
                  ) : (
                    <>
                      <Card label="What changed" tone="muted" text={shown.changed || "—"} />
                      <Card
                        label={isNoIssue(shown.issue) ? "Issue · none visible" : "Issue found"}
                        tone={isNoIssue(shown.issue) ? "ok" : "warn"}
                        text={shown.issue || "None visible."}
                      />
                      {!isNoIssue(shown.fix) && <Card label="Suggested fix" tone="fix" text={shown.fix} />}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Issue tracker */}
            {issues.length > 0 && (
              <div className="rounded-lg border border-input/40">
                <div className="flex items-center gap-2 border-b border-input/30 px-3 py-1.5">
                  <h4 className="text-[11px] font-semibold">Issues this session</h4>
                  <span className="text-[10px] text-muted-foreground">
                    {openIssues.length} open · {resolved.length} resolved
                  </span>
                </div>
                <ul className="divide-y divide-input/20">
                  {[...openIssues, ...resolved].map((i) => (
                    <li key={i.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                      {i.resolvedAt ? (
                        <CheckCircle2Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
                      ) : (
                        <CircleDotIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className={i.resolvedAt ? "text-muted-foreground line-through decoration-muted-foreground/40" : ""}>
                          {i.text}
                        </div>
                        {i.fix && !i.resolvedAt && <div className="mt-0.5 text-sky-300">Fix: {i.fix}</div>}
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {i.resolvedAt ? `resolved ${clock(i.resolvedAt)}` : `open since ${clock(i.firstSeen)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Timeline */}
            {frames.length > 1 && (
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Timeline (click a frame)</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {frames.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelected(f.id)}
                      className={`w-36 shrink-0 rounded-md border p-1 text-left ${f.id === shown?.id ? "border-primary" : "border-input/40"}`}
                    >
                      {f.image && <img src={`data:image/png;base64,${f.image}`} alt="" className="mb-1 w-full rounded" />}
                      <div className="text-[10px] text-muted-foreground">
                        #{f.id} · {clock(f.at)}
                      </div>
                      <div className={`truncate text-[10px] ${isNoIssue(f.issue) ? "text-green-400" : "text-amber-300"}`}>
                        {f.error ? "error" : isNoIssue(f.issue) ? "no issue" : f.issue}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

function Card({ label, text, tone }: { label: string; text: string; tone: "muted" | "warn" | "ok" | "fix" }) {
  const cls = {
    muted: "border-input/40 bg-muted/30",
    warn: "border-amber-500/30 bg-amber-500/10",
    ok: "border-green-500/30 bg-green-500/10",
    fix: "border-sky-500/30 bg-sky-500/10",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>
    </div>
  );
}
