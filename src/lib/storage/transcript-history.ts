// Saved Live-transcript sessions (this device only): lines, questions and answers.
import type { TranscriptEntry } from "@/hooks/useLiveTranscript";
import type { AnswerJob } from "@/hooks/useAnswerQueue";

const KEY = "pluely_transcript_sessions";
const MAX_SESSIONS = 30;

export interface TranscriptSession {
  id: string; // start time (ms) as string
  startedAt: number;
  updatedAt: number;
  entries: Array<Omit<TranscriptEntry, "at"> & { at: number }>;
  jobs: AnswerJob[];
}

export function loadSessions(): TranscriptSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as TranscriptSession[]) : [];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveSession(session: TranscriptSession) {
  try {
    const others = loadSessions().filter((s) => s.id !== session.id);
    const list = [session, ...others].slice(0, MAX_SESSIONS);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable — history is best-effort */
  }
}

export function deleteSession(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadSessions().filter((s) => s.id !== id)));
  } catch {}
}
