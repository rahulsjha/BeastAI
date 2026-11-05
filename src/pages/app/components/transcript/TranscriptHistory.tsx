import { useState } from "react";
import { Button } from "@/components";
import { ArrowLeftIcon, Trash2Icon } from "lucide-react";
import {
  deleteSession,
  loadSessions,
  type TranscriptSession,
} from "@/lib/storage/transcript-history";
import { AnswerQueue } from "./AnswerQueue";

const when = (ms: number) =>
  new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Past Live-transcript sessions: pick one to read its transcript and answers. */
export function TranscriptHistory({ onBack, currentId }: { onBack: () => void; currentId: string }) {
  const [sessions, setSessions] = useState<TranscriptSession[]>(() => loadSessions());
  const [openId, setOpenId] = useState<string | null>(null);
  const open = sessions.find((s) => s.id === openId);

  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center gap-2">
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={open ? () => setOpenId(null) : onBack}>
          <ArrowLeftIcon className="h-3 w-3" /> {open ? "All sessions" : "Back to live"}
        </Button>
        <h4 className="text-[11px] font-semibold select-none">
          {open ? `Session · ${when(open.startedAt)}` : "Transcript history"}
        </h4>
      </div>

      {!open && (
        <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
          {sessions.length === 0 && (
            <li className="py-3 text-center text-[11px] text-muted-foreground">No saved sessions yet.</li>
          )}
          {sessions.map((s) => {
            const questions = s.jobs.length;
            const firstQ = s.jobs[0]?.text || s.entries.find((e) => e.text)?.text || "";
            return (
              <li
                key={s.id}
                className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/40"
                onClick={() => setOpenId(s.id)}
              >
                <span className="w-[92px] shrink-0 text-[10px] text-muted-foreground">{when(s.startedAt)}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {s.entries.length} lines · {questions} answer{questions === 1 ? "" : "s"}
                </span>
                <span className="min-w-0 flex-1 truncate">{firstQ}</span>
                {s.id === currentId && <span className="text-[10px] text-green-400">current</span>}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100"
                  title="Delete session"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    deleteSession(s.id);
                    setSessions(loadSessions());
                  }}
                >
                  <Trash2Icon className="h-3 w-3" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className="space-y-2">
          <div className="max-h-[30vh] space-y-1 overflow-y-auto">
            {open.entries.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-sm leading-snug">
                <span className="mt-0.5 w-[58px] shrink-0 text-[10px] tabular-nums text-muted-foreground">{time(e.at)}</span>
                <span
                  className={`mt-0.5 shrink-0 rounded border px-1.5 py-px text-[10px] font-medium ${
                    e.speaker === "you"
                      ? "border-sky-500/30 bg-sky-500/15 text-sky-300"
                      : "border-amber-500/30 bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {e.speaker === "you" ? "You" : "Interviewer"}
                </span>
                <span className="min-w-0 flex-1 break-words">{e.text}</span>
              </div>
            ))}
          </div>
          <AnswerQueue jobs={open.jobs} readOnly title="Questions & answers" />
        </div>
      )}
    </div>
  );
}
