import { useApp } from "@/contexts";
import { useState } from "react";
import { MODES, MODE_ORDER, getConceptStyle, setConceptStyle, type ConceptStyle } from "@/config/modes";
import { cn } from "@/lib/utils";

/**
 * Segmented mode picker in the overlay header — four clickable pills. The input
 * now lives in its own row below, so the header has room for these. Picking a
 * mode reconfigures the model, voice, and system prompt in one tap.
 */
export const ModeSelector = () => {
  const { currentMode, applyMode } = useApp();
  const [style, setStyle] = useState<ConceptStyle>(getConceptStyle());
  const toggleStyle = () => {
    const next: ConceptStyle = style === "short" ? "general" : "short";
    setConceptStyle(next);
    setStyle(next);
    applyMode("conceptual"); // re-apply so model + prompt switch now (typed, voice and Listen)
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
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
              "px-2 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap",
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
    {/* Concept only: General (full answer) or Short (definition in ≤3 lines, fastest) */}
    {currentMode === "conceptual" && (
      <button
        onClick={toggleStyle}
        title={style === "short" ? "Short: definition only, ≤3 lines (click for General)" : "General: full answer (click for Short)"}
        className={cn(
          "rounded-full border px-1.5 py-1 text-[10px] font-semibold whitespace-nowrap transition-colors",
          style === "short"
            ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
            : "border-input/60 text-muted-foreground hover:text-foreground"
        )}
      >
        {style === "short" ? "⚡ Short" : "Full"}
      </button>
    )}
    </div>
  );
};
