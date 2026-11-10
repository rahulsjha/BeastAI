// Every answered question (typed, voice, screenshot or transcript), kept on this
// device so it can be reviewed later from the History panel.

const KEY = "pluely_qa_history";
const MAX_ITEMS = 500;

export interface QAItem {
  id: string;
  conversationId?: string; // the conversation it belongs to (History → Continue)
  question: string;
  answer: string;
  mode: string; // interview mode key (e.g. "coding")
  at: number; // when the answer finished
  durationMs?: number; // how long the answer took
  hadImage?: boolean;
  hadDocs?: boolean;
}

export function loadQA(): QAItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QAItem[]) : [];
  } catch {
    return [];
  }
}

export function addQA(item: Omit<QAItem, "id">) {
  try {
    const list = loadQA();
    const id = `${item.at}-${Math.random().toString(36).slice(2, 7)}`;
    list.unshift({ id, ...item });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new CustomEvent("pluely:qa-history"));
  } catch {
    /* storage unavailable — history is best-effort */
  }
}

export function deleteQA(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadQA().filter((q) => q.id !== id)));
    window.dispatchEvent(new CustomEvent("pluely:qa-history"));
  } catch {}
}

export function clearQA() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("pluely:qa-history"));
  } catch {}
}

/** Delete every saved question of one conversation (or one stand-alone item). */
export function deleteConversationQA(key: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(loadQA().filter((q) => (q.conversationId || q.id) !== key))
    );
    window.dispatchEvent(new CustomEvent("pluely:qa-history"));
  } catch {}
}

/** Delete everything older than `days` days; returns the conversation ids removed. */
export function deleteQAOlderThan(days: number): string[] {
  try {
    const cutoff = Date.now() - days * 86_400_000;
    const all = loadQA();
    const removed = all.filter((q) => q.at < cutoff);
    localStorage.setItem(KEY, JSON.stringify(all.filter((q) => q.at >= cutoff)));
    window.dispatchEvent(new CustomEvent("pluely:qa-history"));
    return Array.from(new Set(removed.map((q) => q.conversationId).filter(Boolean) as string[]));
  } catch {
    return [];
  }
}
