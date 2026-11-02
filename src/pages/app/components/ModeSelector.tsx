import { useApp } from "@/contexts";
import { MODES, MODE_ORDER, type ModeKey } from "@/config/modes";

/**
 * Compact mode picker for the overlay. A small dropdown (keeps the horizontal
 * bar from overflowing on narrow windows). Picking a mode reconfigures the
 * model, voice, and system prompt in one step — no Dev Space needed.
 */
export const ModeSelector = () => {
  const { currentMode, applyMode } = useApp();

  return (
    <select
      aria-label="Interview mode"
      title="Interview mode"
      value={currentMode}
      onChange={(e) => applyMode(e.target.value as ModeKey)}
      className="h-9 shrink-0 rounded-xl border border-input/60 bg-transparent px-2 text-xs font-medium outline-none focus-visible:ring-[2px] focus-visible:ring-ring/60 cursor-pointer"
    >
      {MODE_ORDER.map((key) => (
        <option key={key} value={key}>
          {MODES[key].label}
        </option>
      ))}
    </select>
  );
};
