import { Button } from "@/components";
import { MODES } from "@/config/modes";
import { CheckIcon, Clock3Icon, Loader2, XCircleIcon, XIcon } from "lucide-react";
import type { AnswerJob } from "@/hooks/useAnswerQueue";

const secs = (ms?: number) => (ms === undefined ? "" : `${(ms / 1000).toFixed(1)}s`);

const STATUS = {
  waiting: { label: "waiting", cls: "text-muted-foreground", Icon: Clock3Icon },
  answering: { label: "answering", cls: "text-sky-300", Icon: Loader2 },
  done: { label: "answered", cls: "text-green-400", Icon: CheckIcon },
  cancelled: { label: "cancelled", cls: "text-muted-foreground", Icon: XCircleIcon },
  failed: { label: "failed", cls: "text-red-300", Icon: XCircleIcon },
} as const;

/** The "Answer queue" section: every question as a job with mode, status and timings. */
export function AnswerQueue({
  jobs,
  onRemove,
  onClearFinished,
}: {
  jobs: AnswerJob[];
  onRemove: (id: number) => void;
  onClearFinished: () => void;
}) {
  if (!jobs.length) return null;
  const waiting = jobs.filter((j) => j.status === "waiting").length;
  const finished = jobs.filter((j) => j.status !== "waiting" && j.status !== "answering").length;
  return (
    <div className="border-t border-input/30">
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <h4 className="text-[11px] font-semibold select-none">Answer queue</h4>
        <span className="text-[10px] text-muted-foreground">
          {waiting ? `${waiting} waiting` : "nothing waiting"} · answered in order, none dropped
        </span>
        <div className="flex-1" />
        {finished > 0 && (
          <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={onClearFinished}>
            Clear finished
          </button>
        )}
      </div>
      <ol className="max-h-40 overflow-y-auto px-3 pb-2 space-y-1">
        {jobs.map((j, i) => {
          const s = STATUS[j.status];
          const timing =
            j.status === "waiting"
              ? ""
              : j.status === "answering"
                ? `waited ${secs((j.startedAt ?? j.queuedAt) - j.queuedAt)}`
                : `waited ${secs((j.startedAt ?? j.queuedAt) - j.queuedAt)} · answered in ${secs((j.doneAt ?? 0) - (j.startedAt ?? 0))}`;
          return (
            <li key={j.id} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-right text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>
              <span className={`flex w-[78px] shrink-0 items-center gap-1 ${s.cls}`}>
                <s.Icon className={`h-3 w-3 ${j.status === "answering" ? "animate-spin" : ""}`} />
                {s.label}
              </span>
              <span className="shrink-0 rounded border border-input/50 px-1 text-[10px] text-muted-foreground">
                {MODES[j.mode]?.short ?? j.mode}
              </span>
              <span className="flex-1 min-w-0 truncate" title={j.text}>
                {j.text}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                {j.error ? j.error : timing}
              </span>
              {j.status === "waiting" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={() => onRemove(j.id)}
                  title="Remove from queue"
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
