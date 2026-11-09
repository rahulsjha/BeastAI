import { useCallback, useEffect, useRef } from "react";
import { Loader2, RadioIcon } from "lucide-react";
import { Button } from "@/components";
import type { LiveTranscriptEngine } from "@/hooks/useLiveTranscript";

const isWebtest = () => !!(window as any).__PLUELY_WEBTEST__;
const isSimtest = () => window.location.search.includes("simtest");

/**
 * One switch for everything voice: hears you (mic) and the interviewer
 * (computer audio), detects questions and answers them in the current mode.
 * On when Beast starts; ⌘⇧M / ⌘⇧A or the button pause/resume it.
 */
export function useAutoListen(t: LiveTranscriptEngine) {
  const tRef = useRef(t);
  tRef.current = t;
  const busy = (s: string) => s === "on" || s === "starting";
  const on = busy(t.mic) || busy(t.share);

  const start = useCallback(async () => {
    const e = tRef.current;
    if (!busy(e.mic)) await e.toggleMic();
    // Interviewer audio: captured natively in the desktop app (and from the
    // simulator in tests); the plain browser version has only the mic.
    if (!busy(tRef.current.share) && (!isWebtest() || isSimtest())) await tRef.current.toggleShare();
  }, []);

  const stop = useCallback(async () => {
    const e = tRef.current;
    if (busy(e.mic)) await e.toggleMic();
    if (busy(tRef.current.share)) await tRef.current.toggleShare();
  }, []);

  const toggle = useCallback(async () => {
    const e = tRef.current;
    if (busy(e.mic) || busy(e.share)) await stop();
    else await start();
  }, [start, stop]);

  // On at start.
  const started = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void start();
    }, 600);
    return () => clearTimeout(id);
  }, [start]);

  return { on, start, stop, toggle };
}

export function AutoButton({ t, on, onToggle }: { t: LiveTranscriptEngine; on: boolean; onToggle: () => void }) {
  const starting = t.mic === "starting" || t.share === "starting";
  const speaking = t.speaking.you || t.speaking.interviewer;
  return (
    <Button
      id="auto-button"
      size="sm"
      variant={on ? "default" : "outline"}
      className="h-7 cursor-pointer gap-1 px-2 text-[11px]"
      title={
        on
          ? "Auto is ON — hearing you and the interviewer, answering every question in the current mode. Click (or ⌘⇧M) to pause."
          : "Auto is paused. Click (or ⌘⇧M) to start hearing you and the interviewer and answer questions automatically."
      }
      aria-pressed={on}
      onClick={onToggle}
    >
      {starting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span className={`h-2 w-2 rounded-full ${on ? (speaking ? "bg-green-400 animate-pulse" : "bg-green-500") : "bg-muted-foreground/50"}`} />
      )}
      Auto
    </Button>
  );
}

/** One quiet line under the header while Auto is on. */
export function AutoStatus({ t, waiting, answering }: { t: LiveTranscriptEngine; waiting: number; answering: boolean }) {
  const last = [...t.entries].reverse().find((e) => e.status !== "error");
  const heard =
    t.speaking.interviewer ? "Interviewer is speaking…" : t.speaking.you ? "You are speaking…" : last?.status === "transcribing" ? "Transcribing…" : null;
  return (
    <div id="auto-status" className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-2 py-1 text-[11px]">
      <RadioIcon className="h-3.5 w-3.5 shrink-0 text-green-400" />
      <span className="shrink-0 font-medium text-green-300">Auto</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {t.error
          ? t.error
          : heard ??
            (last?.text
              ? `${last.speaker === "you" ? "You" : "Interviewer"}: ${last.text}`
              : "Listening to you" + (t.share === "on" ? " and the interviewer" : "") + " — questions are answered automatically")}
      </span>
      {(answering || waiting > 0) && (
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          {answering && <Loader2 className="h-3 w-3 animate-spin" />}
          {waiting > 0 ? `${waiting} waiting` : "answering"}
        </span>
      )}
    </div>
  );
}
