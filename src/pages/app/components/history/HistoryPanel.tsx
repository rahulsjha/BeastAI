import { useEffect, useMemo, useState } from "react";
import { Button, CopyButton, Markdown } from "@/components";
import { MODES } from "@/config/modes";
import { Trash2Icon, XIcon } from "lucide-react";
import { clearQA, deleteQA, loadQA, type QAItem } from "@/lib/storage/qa-history";
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

/**
 * History: every past question and answer (any mode, typed / voice / screenshot /
 * transcript), searchable and filterable by mode, plus saved transcript sessions.
 */
export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<QAItem[]>(() => loadQA());
  const [tab, setTab] = useState<"qa" | "sessions">("qa");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setItems(loadQA());
    window.addEventListener("pluely:qa-history", refresh);
    return () => window.removeEventListener("pluely:qa-history", refresh);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (mode === "all" || i.mode === mode) &&
        (!q || i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q))
    );
  }, [items, query, mode]);

  const groups = useMemo(() => {
    const g: { day: string; items: QAItem[] }[] = [];
    for (const i of filtered) {
      const day = dayLabel(i.at);
      if (!g.length || g[g.length - 1].day !== day) g.push({ day, items: [] });
      g[g.length - 1].items.push(i);
    }
    return g;
  }, [filtered]);

  return (
    <div className="w-full rounded-xl border border-input/50 bg-muted/20">
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
              {t === "qa" ? `Questions & answers (${items.length})` : "Transcript sessions"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} title="Close">
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
        {tab === "qa" && (
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions and answers…"
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
            {items.length > 0 && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Clear all history"
                onClick={() => {
                  clearQA();
                  setItems([]);
                }}
              >
                <Trash2Icon className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {tab === "sessions" ? (
        <TranscriptHistory onBack={() => setTab("qa")} currentId="" />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
          {groups.length === 0 && (
            <p className="py-4 text-center text-[11px] text-muted-foreground">
              {items.length ? "No matches." : "Answered questions will appear here."}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.day} className="mb-2">
              <div className="sticky top-0 bg-muted/60 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {g.day}
              </div>
              <ul className="space-y-0.5">
                {g.items.map((i) => (
                  <li key={i.id} className="text-xs">
                    <div
                      className="group flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/40"
                      onClick={() => setOpen(open === i.id ? null : i.id)}
                    >
                      <span className="w-[42px] shrink-0 text-[10px] tabular-nums text-muted-foreground">{time(i.at)}</span>
                      <span className="shrink-0 rounded border border-input/50 px-1 text-[10px] text-muted-foreground">
                        {MODES[i.mode as keyof typeof MODES]?.short ?? i.mode}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{i.question}</span>
                      {i.durationMs !== undefined && (
                        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                          {(i.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                        title="Delete"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          deleteQA(i.id);
                          setItems(loadQA());
                        }}
                      >
                        <Trash2Icon className="h-3 w-3" />
                      </Button>
                    </div>
                    {open === i.id && (
                      <div className="mb-2 ml-12 rounded-md border border-input/40 bg-background/40 p-2">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                            <span className="font-semibold">Asked:</span> {i.question}
                          </p>
                          <CopyButton content={i.answer} />
                        </div>
                        <div className="max-h-96 overflow-y-auto text-sm">
                          <Markdown>{i.answer}</Markdown>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
