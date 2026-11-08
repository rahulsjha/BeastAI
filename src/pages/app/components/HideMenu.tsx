import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EyeOffIcon, PowerIcon, TimerIcon } from "lucide-react";
import { Button } from "@/components";

// 👁 in the header: hide Beast now, hide it for a while (it comes back on its
// own), or quit. ⌘\ brings it back any time.
const LATER = [
  { label: "1 min", secs: 60 },
  { label: "5 min", secs: 300 },
  { label: "15 min", secs: 900 },
];

export const HideButton = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
  <Button
    id="hide-button"
    size="icon"
    variant={open ? "default" : "outline"}
    className="cursor-pointer"
    title="Hide or quit Beast"
    aria-label="Hide or quit Beast"
    onClick={onToggle}
  >
    <EyeOffIcon className="h-4 w-4" />
  </Button>
);

// Shown in the page flow under the header (so the window grows to fit it).
export const HidePanel = ({ onClose }: { onClose: () => void }) => {
  const [confirmQuit, setConfirmQuit] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hide = (secs: number) => {
    onClose();
    void invoke("hide_main_window_for", { seconds: secs }).catch(() => {});
  };

  return (
    <div ref={ref} id="hide-menu" className="w-full">
      {(
        <div className="ml-auto w-full max-w-sm rounded-lg border border-input/60 bg-background/95 p-1.5 text-xs shadow-xl backdrop-blur">
          <button
            data-hide="now"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => hide(0)}
          >
            <EyeOffIcon className="h-3.5 w-3.5" />
            <span className="flex-1">Hide now</span>
            <kbd className="text-[10px] text-muted-foreground">⌘\ or menu-bar icon to show</kbd>
          </button>
          <div className="flex items-center gap-1 px-2 py-1.5">
            <TimerIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="mr-auto">Hide for</span>
            {LATER.map((l) => (
              <button
                key={l.secs}
                data-hide={l.secs}
                className="rounded border border-input/60 px-1.5 py-0.5 text-[10px] hover:bg-muted"
                title={`Hide now and come back by itself in ${l.label}`}
                onClick={() => hide(l.secs)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-input/50" />
          {!confirmQuit ? (
            <button
              data-hide="quit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-red-500 hover:bg-red-500/10"
              onClick={() => setConfirmQuit(true)}
            >
              <PowerIcon className="h-3.5 w-3.5" />
              Quit Beast
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <span className="mr-auto">Quit Beast?</span>
              <button
                data-hide="quit-yes"
                className="rounded bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white"
                onClick={() => void invoke("exit_app").catch(() => {})}
              >
                Yes, quit
              </button>
              <button
                className="rounded border border-input/60 px-2 py-0.5 text-[10px]"
                onClick={() => setConfirmQuit(false)}
              >
                Cancel
              </button>
            </div>
          )}
          <p className="px-2 pb-1 pt-1 text-[10px] leading-snug text-muted-foreground">
            Bring it back any time: click the Beast icon in the menu bar (top right) or press ⌘\. After Quit, start it from Applications or <code>open -a Beast</code>.
          </p>
        </div>
      )}
    </div>
  );
};
