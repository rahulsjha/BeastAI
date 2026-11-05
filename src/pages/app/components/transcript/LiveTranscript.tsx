import { useEffect, useRef } from "react";
import { Button, Switch } from "@/components";
import {
  HeadphonesIcon,
  Loader2,
  MicIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useLiveTranscript, type Speaker } from "@/hooks/useLiveTranscript";

const SPEAKER = {
  you: {
    label: "You",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    icon: MicIcon,
  },
  interviewer: {
    label: "Interviewer",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: HeadphonesIcon,
  },
} as const;

const time = (d: Date) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function SourceButton({
  speaker,
  state,
  speaking,
  onClick,
  title,
}: {
  speaker: Speaker;
  state: string;
  speaking: boolean;
  onClick: () => void;
  title: string;
}) {
  const s = SPEAKER[speaker];
  const Icon = s.icon;
  const on = state === "on";
  return (
    <Button
      size="sm"
      variant={on ? "default" : "outline"}
      onClick={onClick}
      title={title}
      className="h-7 gap-1.5 px-2.5 text-xs"
    >
      {state === "starting" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      {s.label}
      <span
        className={`ml-0.5 h-1.5 w-1.5 rounded-full ${
          on ? (speaking ? "bg-green-400 animate-pulse" : "bg-green-600") : "bg-muted-foreground/40"
        }`}
      />
    </Button>
  );
}

/**
 * Live transcript panel: labels every phrase as You (mic) or Interviewer
 * (shared meeting-tab audio), with time, and lets you answer interviewer
 * questions with one click (or automatically).
 */
export function LiveTranscript({
  onAnswer,
  onClose,
}: {
  onAnswer: (question: string) => void;
  onClose: () => void;
}) {
  const t = useLiveTranscript({ onQuestion: onAnswer });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [t.entries]);

  const lastQuestion = [...t.entries].reverse().find((e) => e.isQuestion);

  return (
    <div className="w-full rounded-xl border border-input/50 bg-muted/20">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-input/30 px-3 py-2">
        <h3 className="text-xs font-semibold select-none mr-1">Live transcript</h3>
        <SourceButton
          speaker="you"
          state={t.mic}
          speaking={t.speaking.you}
          onClick={t.toggleMic}
          title="Transcribe your microphone"
        />
        <SourceButton
          speaker="interviewer"
          state={t.share}
          speaking={t.speaking.interviewer}
          onClick={t.toggleShare}
          title='Share the meeting tab with "Also share tab audio" to transcribe the interviewer'
        />
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
          Auto-answer questions
          <Switch checked={t.autoAnswer} onCheckedChange={t.setAutoAnswer} className="scale-75" />
        </label>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={t.clear} title="Clear transcript">
          <Trash2Icon className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} title="Close">
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {t.error && (
        <div className="mx-3 mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
          {t.error}
        </div>
      )}

      {/* Entries */}
      <div ref={listRef} className="max-h-64 overflow-y-auto px-3 py-2 space-y-1.5">
        {t.entries.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-muted-foreground select-none">
            Turn on <b>You</b> to transcribe your mic. Turn on <b>Interviewer</b> and share the meeting
            tab (tick “Also share tab audio”) to transcribe the other side.
          </p>
        ) : (
          t.entries.map((e) => {
            const s = SPEAKER[e.speaker];
            return (
              <div key={e.id} className="group flex items-start gap-2 text-sm leading-snug">
                <span className="mt-0.5 w-[58px] shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {time(e.at)}
                </span>
                <span
                  className={`mt-0.5 shrink-0 rounded border px-1.5 py-px text-[10px] font-medium ${s.badge}`}
                >
                  {s.label}
                </span>
                <span
                  className={`flex-1 min-w-0 break-words ${
                    e.status === "error" ? "text-red-300" : ""
                  }`}
                >
                  {e.status === "transcribing" ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> transcribing…
                    </span>
                  ) : (
                    e.text
                  )}
                </span>
                {e.speaker === "interviewer" && e.status === "done" && (
                  <Button
                    size="sm"
                    variant={e.isQuestion ? "default" : "ghost"}
                    className="h-6 shrink-0 gap-1 px-2 text-[10px]"
                    onClick={() => onAnswer(e.text)}
                    title="Answer this with the current mode"
                  >
                    <SendIcon className="h-3 w-3" /> Answer
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>

      {lastQuestion && !t.autoAnswer && (
        <div className="flex items-center justify-between gap-2 border-t border-input/30 px-3 py-1.5">
          <span className="truncate text-[11px] text-muted-foreground">
            Last question: <span className="text-foreground">{lastQuestion.text}</span>
          </span>
          <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => onAnswer(lastQuestion.text)}>
            Answer it
          </Button>
        </div>
      )}
    </div>
  );
}
