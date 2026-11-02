import { PageLayout } from "@/layouts";
import { useApp } from "@/contexts";
import { MODES, MODE_ORDER } from "@/config/modes";
import { cn } from "@/lib/utils";

const modelLabel = (aiProvider: string) =>
  aiProvider === "groq-interview"
    ? "Groq · gpt-oss-120b (fast)"
    : "Claude Opus 5.5 · high effort";

const DevSpace = () => {
  const { currentMode, applyMode } = useApp();

  return (
    <PageLayout
      title="Dev Space"
      description="Everything is pre-configured. Pick a mode in the overlay (or here) and start — no providers to add, no keys to paste."
    >
      <div className="space-y-3">
        {MODE_ORDER.map((key) => {
          const m = MODES[key];
          const active = key === currentMode;
          return (
            <button
              key={key}
              onClick={() => applyMode(key)}
              className={cn(
                "w-full text-left rounded-xl border p-4 transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-input/50 hover:border-primary/50"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{m.label}</span>
                {active && (
                  <span className="text-[10px] font-medium text-primary border border-primary/40 rounded-full px-2 py-0.5">
                    active
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
                <span>Model: {modelLabel(m.aiProvider)}</span>
                <span>Voice: Cloudflare Whisper</span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground line-clamp-2">
                {m.systemPrompt.split("\n")[0]}
              </p>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Models and keys are loaded automatically for each mode. To change a key,
        edit <code>.env.local</code> and restart.
      </p>
    </PageLayout>
  );
};

export default DevSpace;
