// The desktop web view (WKWebView) creates AudioContexts in a "suspended" state
// unless started by a real click. Starting the mic from a shortcut then gives an
// open mic with no audio frames. Track every AudioContext and resume them.

const contexts = new Set<AudioContext>();

export function installAudioContextTracker() {
  const w = window as any;
  if (w.__audioCtxTracked || typeof w.AudioContext !== "function") return;
  w.__audioCtxTracked = true;
  const Original = w.AudioContext;
  class TrackedAudioContext extends Original {
    constructor(...args: any[]) {
      super(...args);
      contexts.add(this as unknown as AudioContext);
    }
  }
  w.AudioContext = TrackedAudioContext;
  if (w.webkitAudioContext) w.webkitAudioContext = TrackedAudioContext;
  // Any real interaction also resumes suspended audio.
  const resume = () => void resumeAllAudio();
  window.addEventListener("pointerdown", resume, true);
  window.addEventListener("keydown", resume, true);
  window.addEventListener("focus", resume);
}

/** Resumes every suspended AudioContext; returns their states afterwards. */
export async function resumeAllAudio(): Promise<string[]> {
  const states: string[] = [];
  for (const ctx of contexts) {
    if (ctx.state === "closed") {
      contexts.delete(ctx);
      continue;
    }
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {}
    }
    states.push(ctx.state);
  }
  return states;
}
