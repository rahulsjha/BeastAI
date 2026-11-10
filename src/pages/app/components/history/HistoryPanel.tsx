import { useEffect, useMemo, useState } from "react";
import { Button, CopyButton, Markdown } from "@/components";
import { MODES } from "@/config/modes";
import {
  CameraIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MessageSquarePlusIcon,
  MicIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  clearQA,
  deleteConversationQA,
  deleteQAOlderThan,
  loadQA,
  type QAItem,
} from "@/lib/storage/qa-history";
import { removeCachedConversations } from "@/lib/conversation-cache";
import { deleteConversation, getAllConversations } from "@/lib/database/chat-history.action";
import { TranscriptHistory } from "../transcript/TranscriptHistory";

const dayLabel = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** How to reopen a past conversation: just open it, or open it and add a screenshot / speak. */
export type ContinueAction = "text" | "screen" | "voice";

interface Conversation {
  key: string; // conversationId (or the item id for old stand-alone answers)
  items: QAItem[]; // oldest first
  latest: number;
}

/**
 * History: every past conversation (typed, voice, screenshot, Auto), newest first.
 * Open one to read all its questions and answers; Continue / 📸 / 🎤 reopen it to
 * add more; 🗑 deletes it (asks first). Plus saved Live-transcript sessions.
 */
export function HistoryPanel({
  onClose,
  onContinue,
}: {
  onClose: () => void;
  /** Reopen this conversation (and optionally add a screenshot or start speaking). */
  onContinue?: (item: QAItem, action?: ContinueAction) => void;
}) {
  const [items, setItems] = useState<QAItem[]>(() => loadQA());
  const [tab, setTab] = useState<"qa" | "sessions">("qa");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  // What's waiting for a "Yes": one conversation's key, "old" or "all".
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setItems(loadQA());
    window.addEventListener("pluely:qa-history", refresh);
    return () => window.removeEventListener("pluely:qa-history", refresh);
  }, []);

  const conversations = useMemo(() => {
    const byKey = new Map<string, Conversation>();
    for (const i of items) {
      const key = i.conversationId || i.id;
      const c = byKey.get(key) ?? { key, items: [], latest: 0 };
      c.items.push(i);
      c.latest = Math.max(c.latest, i.at);
      byKey.set(key, c);
    }
    const q = query.trim().toLowerCase();
    return [...byKey.values()]
      .map((c) => ({ ...c, items: [...c.items].sort((a, b) => a.at - b.at) }))
      .filter(
        (c) =>
          (mode === "all" || c.items.some((i) => i.mode === mode)) &&
          (!q || c.items.some((i) => i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q)))
      )
      .sort((a, b) => b.latest - a.latest);
  }, [items, query, mode]);

  const groups = useMemo(() => {
    const g: { day: string; convs: Conversation[] }[] = [];
    for (const c of conversations) {
      const day = dayLabel(c.latest);
      if (!g.length || g[g.length - 1].day !== day) g.push({ day, convs: [] });
      g[g.length - 1].convs.push(c);
    }
    return g;
  }, [conversations]);

  const totalConversations = useMemo(
    () => new Set(items.map((i) => i.conversationId || i.id)).size,
    [items]
  );

  const removeConversation = (key: string) => {
    deleteConversationQA(key);
    removeCachedConversations([key]);
    void deleteConversation(key).catch(() => undefined);
    setItems(loadQA());
    setConfirm(null);
    if (open === key) setOpen(null);
  };
  const removeOld = () => {
    const ids = deleteQAOlderThan(7);
    removeCachedConversations(ids);
    ids.forEach((id) => void deleteConversation(id).catch(() => undefined));
    setItems(loadQA());
    setConfirm(null);
  };
  const removeAll = () => {
    clearQA();
    removeCachedConversations("all");
    void getAllConversations()
      .then((all) => all.forEach((c) => void deleteConversation(c.id).catch(() => undefined)))
      .catch(() => undefined);
    setItems([]);
    setConfirm(null);
  };
  const oldCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    return conversations.filter((c) => c.latest < cutoff).length;
  }, [conversations]);

  const ConfirmBar = ({ text, onYes }: { text: string; onYes: () => void }) => (
    <div className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px]">
      <span className="mr-auto">{text}</span>
      <button data-confirm="yes" className="rounded bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white" onClick={onYes}>
        Yes, delete
      </button>
      <button className="rounded border border-input/60 px-2 py-0.5 text-[10px]" onClick={() => setConfirm(null)}>
        Cancel
      </button>
    </div>
  );

  return (
    <div id="history-panel" className="w-full rounded-xl border border-input/50 bg-muted/20">
      <div className="border-b border-input/30 px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold select-none mr-1">History</h3>
          <div className="flex rounded-lg bg-muted/40 p-0.5 text-[11px]">
            {(["qa", "sessions"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2 py-0.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {t === "qa" ? `Conversations (${totalConversations})` : "Transcript sessions"}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} title="Close">
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
        {tab === "qa" && (
          <>
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="h-7 min-w-0 flex-1 rounded-md border border-input/50 bg-transparent px-2 text-xs outline-none focus:border-ring/60"
              />
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="h-7 rounded-md border border-input/50 bg-transparent px-1 text-xs"
              >
                <option value="all">All modes</option>
                {Object.values(MODES).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.short}
                  </option>
                ))}
              </select>
            </div>
            {items.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-muted-foreground mr-auto">Delete:</span>
                <button
                  id="delete-old"
                  disabled={!oldCount}
                  className="rounded border border-input/60 px-2 py-0.5 hover:bg-muted disabled:opacity-40"
                  title="Delete conversations older than 7 days"
                  onClick={() => setConfirm("old")}
                >
                  Older than 7 days ({oldCount})
                </button>
                <button
                  id="delete-all"
                  className="rounded border border-red-500/40 px-2 py-0.5 text-red-400 hover:bg-red-500/10"
                  title="Delete every saved conversation"
                  onClick={() => setConfirm("all")}
                >
                  Clear all
                </button>
              </div>
            )}
            {confirm === "old" && (
              <ConfirmBar text={`Delete ${oldCount} conversation${oldCount === 1 ? "" : "s"} older than 7 days?`} onYes={removeOld} />
            )}
            {confirm === "all" && (
              <ConfirmBar text={`Delete all ${totalConversations} conversations? This can't be undone.`} onYes={removeAll} />
            )}
          </>
        )}
      </div>

      {tab === "sessions" ? (
        <TranscriptHistory onBack={() => setTab("qa")} currentId="" />
      ) : (
        <div className="max-h-[60vh] overflow-auto scroll-smooth overscroll-contain px-3 py-2">
          {groups.length === 0 && (
            <p className="py-4 text-center text-[11px] text-muted-foreground">
              {items.length ? "No matches." : "Your conversations will appear here."}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.day} className="mb-2">
              <div className="sticky top-0 z-10 bg-muted/60 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {g.day}
              </div>
              <ul className="space-y-0.5">
                {g.convs.map((c) => {
                  const first = c.items[0];
                  const last = c.items[c.items.length - 1];
                  const isOpen = open === c.key;
                  return (
                    <li key={c.key} data-conversation={c.key} className="text-xs">
                      <div
                        className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 hover:bg-muted/40"
                        onClick={() => setOpen(isOpen ? null : c.key)}
                        title="Show every question and answer in this conversation"
                      >
                        {isOpen ? (
                          <ChevronDownIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRightIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="w-[38px] shrink-0 text-[10px] tabular-nums text-muted-foreground">{time(c.latest)}</span>
                        <span className="shrink-0 rounded border border-input/50 px-1 text-[10px] text-muted-foreground">
                          {MODES[first.mode as keyof typeof MODES]?.short ?? first.mode}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{first.question}</span>
                        {c.items.length > 1 && (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground" title={`${c.items.length} questions`}>
                            {c.items.length} Q
                          </span>
                        )}
                        {onContinue && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-5 shrink-0 gap-1 px-1.5 text-[10px]"
                              title="Open this conversation to read it and ask more"
                              data-continue
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onContinue(last, "text");
                              }}
                            >
                              <MessageSquarePlusIcon className="h-3 w-3" /> Continue
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-5 w-5 shrink-0"
                              title="Open this conversation and add a screenshot of the screen"
                              data-continue-screen
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onContinue(last, "screen");
                              }}
                            >
                              <CameraIcon className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-5 w-5 shrink-0"
                              title="Open this conversation and continue by voice"
                              data-continue-voice
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onContinue(last, "voice");
                              }}
                            >
                              <MicIcon className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 shrink-0 text-muted-foreground hover:text-red-400"
                          title="Delete this conversation"
                          data-delete
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setConfirm(c.key);
                          }}
                        >
                          <Trash2Icon className="h-3 w-3" />
                        </Button>
                      </div>
                      {confirm === c.key && (
                        <div className="mb-1 ml-5">
                          <ConfirmBar
                            text={`Delete this conversation${c.items.length > 1 ? ` (${c.items.length} questions)` : ""}?`}
                            onYes={() => removeConversation(c.key)}
                          />
                        </div>
                      )}
                      {isOpen && (
                        <div className="answer-content mb-2 ml-5 max-h-96 space-y-2 overflow-auto scroll-smooth overscroll-contain rounded-md border border-input/40 bg-background/40 p-2">
                          {c.items.map((i, n) => (
                            <div key={i.id} className={n ? "border-t border-input/30 pt-2" : ""}>
                              <div className="mb-1 flex items-start justify-between gap-2">
                                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                                  <span className="mr-1 rounded bg-primary/15 px-1 font-semibold">Q{n + 1}</span>
                                  {i.question}
                                  <span className="ml-1 text-[10px] opacity-70">· {time(i.at)}</span>
                                </p>
                                <CopyButton content={i.answer} />
                              </div>
                              <div className="text-sm">
                                <Markdown>{i.answer}</Markdown>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
