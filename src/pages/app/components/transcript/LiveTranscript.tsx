import { useEffect, useRef, useState } from "react";
import { saveSession } from "@/lib/storage/transcript-history";
import { TranscriptHistory } from "./TranscriptHistory";
import { Button, Switch } from "@/components";
import {
  HeadphonesIcon,
  HistoryIcon,
  Loader2,
  MicIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useLiveTranscript, type Speaker } from "@/hooks/useLiveTranscript";
import type { AnswerJob } from "@/hooks/useAnswerQueue";
import { AnswerQueue } from "./AnswerQueue";

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
  jobs = [],
  onRemoveJob,
  onClearFinished,
  getMode,
}: {
  onAnswer: (question: string, entryId: number | undefined, source: "auto" | "manual", mode?: string) => void;
  getMode?: () => string;
  onClose: () => void;
  jobs?: AnswerJob[];
  onRemoveJob: (id: number) => void;
  onClearFinished: () => void;
}) {
  const t = useLiveTranscript({ onQuestion: (q, id, mode) => onAnswer(q, id, "auto", mode), getMode });
  const answering = jobs.some((j) => j.status === "answering");
  const waitingCount = jobs.filter((j) => j.status === "waiting").length;
  const jobFor = (entryId: number) => [...jobs].reverse().find((j) => j.entryId === entryId);

  // Auto-save this session (lines + questions + answers) for History.
  const [sessionStart] = useState(() => Date.now());
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    if (!t.entries.length && !jobs.length) return;
    const timer = setTimeout(() => {
      saveSession({
        id: String(sessionStart),
        startedAt: sessionStart,
        updatedAt: Date.now(),
        entries: t.entries
          .filter((e) => e.status === "done")
          .map((e) => ({ ...e, at: e.at.getTime() })),
        jobs,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [t.entries, jobs, sessionStart]);
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
        {(answering || waitingCount > 0) && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground select-none">
            {answering && <Loader2 className="h-3 w-3 animate-spin" />}
            {answering ? "Answering" : ""}
            {waitingCount > 0 && ` · ${waitingCount} waiting`}
          </span>
        )}
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
          Auto-answer questions
          <Switch checked={t.autoAnswer} onCheckedChange={t.setAutoAnswer} className="scale-75" />
        </label>
        <Button
          size="icon"
          variant={showHistory ? "default" : "ghost"}
          className="h-7 w-7"
          onClick={() => setShowHistory((v) => !v)}
          title="Transcript history (past sessions and answers)"
        >
          <HistoryIcon className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={t.clear} title="Clear transcript">
          <Trash2Icon className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} title="Close">
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showHistory ? (
        <TranscriptHistory onBack={() => setShowHistory(false)} currentId={String(sessionStart)} />
      ) : (
      <>
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
                {(() => {
                  const job = jobFor(e.id);
                  if (!job) return null;
                  const cls =
                    job.status === "done" ? "text-green-400" : job.status === "answering" ? "text-sky-300" : job.status === "waiting" ? "text-muted-foreground" : "text-red-300";
                  const label =
                    job.status === "waiting" ? `queued #${jobs.filter((j) => j.status === "waiting").indexOf(job) + 1}` : job.status === "done" ? "answered" : job.status;
                  return <span className={`mt-0.5 shrink-0 text-[10px] ${cls}`}>{label}</span>;
                })()}
                {e.speaker === "interviewer" && e.status === "done" && !jobFor(e.id) && (
                  <Button
                    size="sm"
                    variant={e.isQuestion ? "default" : "ghost"}
                    className="h-6 shrink-0 gap-1 px-2 text-[10px]"
                    onClick={() => onAnswer(e.text, e.id, "manual", e.mode)}
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

      <AnswerQueue jobs={jobs} onRemove={onRemoveJob} onClearFinished={onClearFinished} />

      {lastQuestion && !t.autoAnswer && !jobFor(lastQuestion.id) && (
        <div className="flex items-center justify-between gap-2 border-t border-input/30 px-3 py-1.5">
          <span className="truncate text-[11px] text-muted-foreground">
            Last question: <span className="text-foreground">{lastQuestion.text}</span>
          </span>
          <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => onAnswer(lastQuestion.text, lastQuestion.id, "manual", lastQuestion.mode)}>
            Answer it
          </Button>
        </div>
      )}
      </>
      )}
    </div>
  );
}
