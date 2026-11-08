import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Button } from "@/components";
import { CheckIcon, CopyIcon, PlayIcon, PowerIcon, XIcon } from "lucide-react";
import { getShortcutsConfig, formatShortcutKeyForDisplay } from "@/lib";

type Row = {
  id: string; // binding id in the shortcuts config
  fallback: string; // default macOS key
  what: string;
  how: string;
  event?: string; // frontend event the real key press sends (used to tick ✓)
  action?: string; // custom-shortcut-triggered action name
  tryIt?: () => Promise<void> | void;
};

// Send the same event a real key press sends (desktop: Tauri event; browser test: shim).
const fire = async (event: string, payload: unknown = {}) => {
  const testEmit = (window as any).__webtestEmit;
  if (testEmit) testEmit(event, payload);
  else await emit(event, payload);
};

const ROWS: Row[] = [
  {
    id: "screenshot_enter",
    fallback: "cmd+enter",
    what: "Screenshot & send",
    how: "Takes the whole screen and sends it at once, with anything typed in the bar. The answer opens.",
    event: "custom-shortcut-triggered",
    action: "screenshot_enter",
    tryIt: () => fire("custom-shortcut-triggered", { action: "screenshot_enter" }),
  },  {
    id: "screenshot_add",
    fallback: "cmd+shift+enter",
    what: "Add screenshot to conversation",
    how: "Adds the whole screen to the open conversation without sending. Scroll, press it again for each page, then Send them together.",
    event: "custom-shortcut-triggered",
    action: "screenshot_add",
    tryIt: () => fire("custom-shortcut-triggered", { action: "screenshot_add" }),
  },

  {
    id: "screenshot",
    fallback: "cmd+shift+s",
    what: "Area screenshot",
    how: "Drag to pick an area (double-click = whole screen, Esc = cancel). It waits in the tray; press Enter to send.",
    event: "trigger-screenshot",
    tryIt: () => fire("trigger-screenshot"),
  },
  {
    id: "solve_screen",
    fallback: "cmd+shift+o",
    what: "Solve screen",
    how: "Watches the screen every few seconds and answers each new question it finds. Press again to stop.",
    event: "custom-shortcut-triggered",
    action: "solve_screen",
    tryIt: () => fire("custom-shortcut-triggered", { action: "solve_screen" }),
  },
  {
    id: "system_audio",
    fallback: "cmd+shift+m",
    what: "Listen",
    how: "Hears the meeting (computer audio) and your mic, and answers questions. Press again to stop.",
    event: "toggle-system-audio",
    tryIt: () => fire("toggle-system-audio"),
  },
  {
    id: "audio_recording",
    fallback: "cmd+shift+a",
    what: "Voice question",
    how: "Speak your question; it is typed and sent when you stop. Press again to stop.",
    event: "start-audio-recording",
    tryIt: () => fire("start-audio-recording"),
  },
  {
    id: "focus_input",
    fallback: "cmd+shift+i",
    what: "Type a question",
    how: "Brings Beast forward and puts the cursor in the question bar.",
    event: "focus-text-input",
    tryIt: () => fire("focus-text-input"),
  },
  {
    id: "toggle_window",
    fallback: "cmd+backslash",
    what: "Hide / show Beast",
    how: "Hides the overlay completely; press again to bring it back. The app keeps running.",
    event: "toggle-window-visibility",
  },
  {
    id: "toggle_dashboard",
    fallback: "cmd+shift+d",
    what: "Dashboard",
    how: "Opens settings, history, and the shortcut editor (change any key there).",
    tryIt: async () => {
      try {
        await invoke("open_dashboard");
      } catch {
        /* browser test: no dashboard window */
      }
    },
  },
  {
    id: "move_window",
    fallback: "cmd",
    what: "Move the overlay",
    how: "Hold ⌘ and press the arrow keys; hold to keep moving.",
  },
];

const STOP_COMMANDS = [
  ["Quit normally", `osascript -e 'quit app "Beast"'`],
  ["If it doesn't respond", "pkill -x Beast"],
  ["Force kill (last resort)", "pkill -9 -x Beast"],
  ["Is it running?", "pgrep -lx Beast"],
  ["Start it again", "open -a Beast"],
] as const;

const keyFor = (id: string, fallback: string) => {
  try {
    const b = getShortcutsConfig().bindings?.[id];
    if (b && b.enabled === false) return "off";
    return formatShortcutKeyForDisplay(b?.key || fallback);
  } catch {
    return formatShortcutKeyForDisplay(fallback);
  }
};

/**
 * Shortcuts & controls: every shortcut with what it does, a Try button, and a
 * ✓ when the real key press reaches Beast — plus how to hide or quit the app.
 */
export function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);

  // Tick a row when its shortcut fires (key press or Try).
  useEffect(() => {
    let cancelled = false;
    const offs: UnlistenFn[] = [];
    const mark = (id: string) =>
      setSeen((s) => ({ ...s, [id]: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }));
    // Desktop: Rust reports every global shortcut as "shortcut-used" { action }.
    listen("shortcut-used", (e: any) => {
      const a = String(e?.payload?.action || "");
      const id = a.startsWith("move_window") ? "move_window" : a;
      if (ROWS.some((r) => r.id === id)) mark(id);
    }).then((off) => (cancelled ? off() : offs.push(off)));
    // Browser test (and Try buttons): the per-feature events.
    const events = Array.from(new Set(ROWS.map((r) => r.event).filter(Boolean))) as string[];
    for (const ev of events) {
      listen(ev, (e: any) => {
        for (const r of ROWS) {
          if (r.event !== ev) continue;
          if (r.action && e?.payload?.action !== r.action) continue;
          mark(r.id);
        }
      }).then((off) => (cancelled ? off() : offs.push(off)));
    }
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
  }, []);

  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const tested = Object.keys(seen).length;
  const testable = ROWS.length;

  return (
    <div id="shortcuts-panel" className="w-full rounded-xl border border-input/50 bg-muted/20">
      <div className="flex items-center gap-2 border-b border-input/30 px-3 py-2">
        <h3 className="text-xs font-semibold select-none">Shortcuts &amp; controls</h3>
        <span className="text-[10px] text-muted-foreground select-none">
          Press a shortcut (from any app) to test it — {tested}/{testable} worked
        </span>
        <div className="flex-1" />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} title="Close">
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="max-h-[calc(100vh-12rem)] min-h-[180px] overflow-y-auto px-3 py-2 space-y-1">
        {ROWS.map((r) => {
          const keys = keyFor(r.id, r.fallback);
          const ok = seen[r.id];
          return (
            <div key={r.id} data-shortcut={r.id} className="flex items-start gap-2 rounded-md px-1 py-1 text-xs hover:bg-muted/30">
              <kbd className="mt-0.5 w-[74px] shrink-0 rounded border border-input/60 bg-background/40 px-1.5 py-0.5 text-center font-mono text-[11px]">
                {r.id === "move_window" ? `${keys} + ←↑→↓` : keys}
              </kbd>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.what}</div>
                <div className="text-[11px] leading-snug text-muted-foreground">{r.how}</div>
              </div>
              {ok ? (
                <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-[10px] text-green-400" title={`Worked at ${ok}`}>
                  <CheckIcon className="h-3 w-3" /> {ok}
                </span>
              ) : null}
              {r.tryIt && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 gap-1 px-2 text-[10px]"
                  onClick={() => void r.tryIt?.()}
                  title={`Run "${r.what}" now (same as pressing ${keys})`}
                >
                  <PlayIcon className="h-3 w-3" /> Try
                </Button>
              )}
            </div>
          );
        })}

        <div className="mt-2 border-t border-input/30 pt-2">
          <div className="mb-1 text-xs font-semibold">Stop Beast</div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => void invoke("toggle_main_window").catch(() => {})}
              title="Hide the overlay; press ⌘\ to bring it back"
            >
              Hide (⌘\)
            </Button>
            {confirmQuit ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => void invoke("exit_app").catch(() => {})}
                >
                  <PowerIcon className="h-3.5 w-3.5" /> Yes, quit Beast
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setConfirmQuit(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => setConfirmQuit(true)}
                title="Close the app completely (Listen, Solve screen and shortcuts stop)"
              >
                <PowerIcon className="h-3.5 w-3.5" /> Quit Beast
              </Button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mb-1">
            From Terminal (⌘Q won't work: Beast has no Dock icon). Click to copy:
          </div>
          <div className="space-y-1">
            {STOP_COMMANDS.map(([label, cmd]) => (
              <button
                key={cmd}
                onClick={() => void copy(cmd)}
                className="flex w-full items-center gap-2 rounded-md border border-input/40 bg-background/30 px-2 py-1 text-left hover:bg-muted/40"
                title="Copy"
              >
                <span className="w-[130px] shrink-0 text-[11px] text-muted-foreground">{label}</span>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{cmd}</code>
                {copied === cmd ? (
                  <CheckIcon className="h-3 w-3 shrink-0 text-green-400" />
                ) : (
                  <CopyIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Change a key: Dashboard (⌘⇧D) → Shortcuts. Stop it opening at login: System Settings → General → Login Items.
          </div>
        </div>
      </div>
    </div>
  );
}
