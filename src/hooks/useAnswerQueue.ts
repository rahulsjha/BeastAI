import { useCallback, useEffect, useRef, useState } from "react";
import type { ModeKey } from "@/config/modes";

export type JobStatus = "waiting" | "answering" | "done" | "cancelled" | "failed";

export interface AnswerJob {
  id: number;
  text: string;
  mode: ModeKey;
  source: "auto" | "manual";
  entryId?: number; // transcript line this came from
  fast?: boolean; // spoken question: answer with the fast model
  status: JobStatus;
  queuedAt: number;
  startedAt?: number;
  doneAt?: number;
  error?: string;
  answer?: string; // the full answer text, kept for history
}

const DEDUPE_WINDOW_MS = 30_000;
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Answers questions one at a time, in arrival order, each in the mode it was
 * asked in. A new question never cancels the answer that is streaming.
 */
export function useAnswerQueue(opts: {
  submit: (text: string, opts?: { mode?: string; fast?: boolean }) => void;
  isLoading: boolean;
  error: string | null;
  response: string;
  cancelCount?: { current: number };
  currentMode?: ModeKey;
  applyMode?: (m: ModeKey) => void;
}) {
  const { submit, isLoading, error, response, cancelCount } = opts;
  const cancelAtStart = useRef(0);
  const [jobs, setJobs] = useState<AnswerJob[]>([]);
  const nextId = useRef(1);
  const startingRef = useRef<number | null>(null); // job submitted, waiting for isLoading
  const sawLoading = useRef(false);

  const patch = (id: number, p: Partial<AnswerJob>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const enqueue = useCallback(
    (text: string, o: { mode: ModeKey; source: "auto" | "manual"; entryId?: number; fast?: boolean }) => {
      const key = norm(text);
      if (!key) return null;
      let added: AnswerJob | null = null;
      const id = nextId.current++; // assigned outside the updater (StrictMode runs updaters twice)
      setJobs((prev) => {
        const now = Date.now();
        const dup = prev.find(
          (j) =>
            norm(j.text) === key &&
            (j.status === "waiting" ||
              j.status === "answering" ||
              now - (j.doneAt ?? j.queuedAt) < DEDUPE_WINDOW_MS)
        );
        if (dup) return prev;
        added = { id, text, ...o, status: "waiting", queuedAt: now };
        return [...prev, added];
      });
      return added;
    },
    []
  );

  const remove = useCallback(
    (id: number) => setJobs((prev) => prev.filter((j) => !(j.id === id && j.status === "waiting"))),
    []
  );
  const clearFinished = useCallback(
    () => setJobs((prev) => prev.filter((j) => j.status === "waiting" || j.status === "answering")),
    []
  );

  const active = jobs.find((j) => j.status === "answering");

  // Finish the active job when its answer stops loading.
  useEffect(() => {
    if (!active) return;
    if (isLoading) {
      sawLoading.current = true;
      startingRef.current = null;
      return;
    }
    if (!sawLoading.current) return; // submit hasn't started loading yet
    sawLoading.current = false;
    const cancelled = (cancelCount?.current ?? 0) > cancelAtStart.current;
    const cliError = /^\s*Claude CLI error:/.test(response) ? response.trim().slice(0, 120) : null;
    const status: JobStatus = cancelled ? "cancelled" : error || cliError ? "failed" : response.trim() ? "done" : "failed";
    patch(active.id, {
      status,
      doneAt: Date.now(),
      error: error ?? cliError ?? (status === "failed" ? "no answer" : undefined),
      answer: response || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, active?.id]);

  // Start the next waiting job when idle (switching to its mode first).
  useEffect(() => {
    if (active || isLoading || startingRef.current !== null) return;
    const next = jobs.find((j) => j.status === "waiting");
    if (!next) return;
    startingRef.current = next.id;
    sawLoading.current = false;
    cancelAtStart.current = cancelCount?.current ?? 0;
    patch(next.id, { status: "answering", startedAt: Date.now() });
    // answered in its own mode (UI mode untouched); spoken questions take the fast model
    submit(next.text, { mode: next.mode, fast: !!next.fast });
    // If loading never starts (e.g. empty answer path), don't block the queue.
    const t = setTimeout(() => {
      if (startingRef.current === next.id) {
        startingRef.current = null;
        if (!sawLoading.current) patch(next.id, { status: "failed", doneAt: Date.now(), error: "did not start" });
      }
    }, 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, isLoading, active?.id]);

  return { jobs, enqueue, remove, clearFinished, active };
}
