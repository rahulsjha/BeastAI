import { useState } from "react";
import { Button, Markdown } from "@/components";
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
  readOnly = false,
  title = "Answer queue",
}: {
  jobs: AnswerJob[];
  onRemove?: (id: number) => void;
  onClearFinished?: () => void;
  readOnly?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (!jobs.length) return null;
  const waiting = jobs.filter((j) => j.status === "waiting").length;
  const finished = jobs.filter((j) => j.status !== "waiting" && j.status !== "answering").length;
  return (
    <div className="border-t border-input/30">
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <h4 className="text-[11px] font-semibold select-none">{title}</h4>
        <span className="text-[10px] text-muted-foreground">
          {readOnly
            ? `${jobs.length} question${jobs.length > 1 ? "s" : ""} · click one to read its answer`
            : `${waiting ? `${waiting} waiting` : "nothing waiting"} · answered in order, none dropped · click to read`}
        </span>
        <div className="flex-1" />
        {!readOnly && finished > 0 && onClearFinished && (
          <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={onClearFinished}>
            Clear finished
          </button>
        )}
      </div>
      <ol className={`${readOnly ? "max-h-[50vh]" : "max-h-56"} overflow-y-auto px-3 pb-2 space-y-1`}>
        {jobs.map((j, i) => {
          const s = STATUS[j.status];
          const timing =
            j.status === "waiting"
              ? ""
              : j.status === "answering"
                ? `waited ${secs((j.startedAt ?? j.queuedAt) - j.queuedAt)}`
                : `waited ${secs((j.startedAt ?? j.queuedAt) - j.queuedAt)} · answered in ${secs((j.doneAt ?? 0) - (j.startedAt ?? 0))}`;
          return (
            <li key={j.id} className="text-xs">
              <div
                className={`flex items-center gap-2 rounded px-1 ${j.answer ? "cursor-pointer hover:bg-muted/40" : ""}`}
                onClick={() => j.answer && setOpen(open === j.id ? null : j.id)}
              >
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
              {!readOnly && j.status === "waiting" && onRemove && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onRemove(j.id);
                  }}
                  title="Remove from queue"
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              )}
              </div>
              {open === j.id && j.answer && (
                <div className="mt-1 mb-2 ml-6 max-h-80 overflow-y-auto rounded-md border border-input/40 bg-background/40 p-2 text-sm">
                  <Markdown>{j.answer}</Markdown>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
