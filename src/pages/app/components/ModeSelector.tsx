import { useApp } from "@/contexts";
import { MODES, MODE_ORDER } from "@/config/modes";
import { cn } from "@/lib/utils";

/**
 * Segmented mode picker in the overlay header — four clickable pills. The input
 * now lives in its own row below, so the header has room for these. Picking a
 * mode reconfigures the model, voice, and system prompt in one tap.
 */
export const ModeSelector = () => {
  const { currentMode, applyMode } = useApp();

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-input/60 bg-background/50 p-0.5 shrink-0"
      role="tablist"
      aria-label="Interview mode"
    >
      {MODE_ORDER.map((key) => {
        const active = key === currentMode;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            title={MODES[key].label}
            onClick={() => applyMode(key)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            {MODES[key].short}
          </button>
        );
      })}
    </div>
  );
};
