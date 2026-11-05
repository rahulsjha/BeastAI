import { useCallback, useEffect, useRef, useState } from "react";
import type { ModeKey } from "@/config/modes";

export type JobStatus = "waiting" | "answering" | "done" | "cancelled" | "failed";

export interface AnswerJob {
  id: number;
  text: string;
  mode: ModeKey;
  source: "auto" | "manual";
  entryId?: number; // transcript line this came from
  status: JobStatus;
  queuedAt: number;
  startedAt?: number;
  doneAt?: number;
  error?: string;
}

const DEDUPE_WINDOW_MS = 30_000;
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Answers questions one at a time, in arrival order, each in the mode it was
 * asked in. A new question never cancels the answer that is streaming.
 */
export function useAnswerQueue(opts: {
  submit: (text: string) => void;
  isLoading: boolean;
  error: string | null;
  response: string;
  currentMode: ModeKey;
  applyMode: (m: ModeKey) => void;
}) {
  const { submit, isLoading, error, response, currentMode, applyMode } = opts;
  const [jobs, setJobs] = useState<AnswerJob[]>([]);
  const nextId = useRef(1);
  const startingRef = useRef<number | null>(null); // job submitted, waiting for isLoading
  const sawLoading = useRef(false);

  const patch = (id: number, p: Partial<AnswerJob>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const enqueue = useCallback(
    (text: string, o: { mode: ModeKey; source: "auto" | "manual"; entryId?: number }) => {
      const key = norm(text);
      if (!key) return null;
      let added: AnswerJob | null = null;
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
        added = { id: nextId.current++, text, ...o, status: "waiting", queuedAt: now };
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
    const status: JobStatus = error ? "failed" : response.trim() ? "done" : "cancelled";
    patch(active.id, { status, doneAt: Date.now(), error: error ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, active?.id]);

  // Start the next waiting job when idle (switching to its mode first).
  useEffect(() => {
    if (active || isLoading || startingRef.current !== null) return;
    const next = jobs.find((j) => j.status === "waiting");
    if (!next) return;
    if (next.mode !== currentMode) {
      applyMode(next.mode); // effect re-runs once the mode has switched
      return;
    }
    startingRef.current = next.id;
    sawLoading.current = false;
    patch(next.id, { status: "answering", startedAt: Date.now() });
    submit(next.text);
    // If loading never starts (e.g. empty answer path), don't block the queue.
    const t = setTimeout(() => {
      if (startingRef.current === next.id) {
        startingRef.current = null;
        if (!sawLoading.current) patch(next.id, { status: "failed", doneAt: Date.now(), error: "did not start" });
      }
    }, 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, isLoading, currentMode, active?.id]);

  return { jobs, enqueue, remove, clearFinished, active };
}
