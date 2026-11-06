// Listen engine for the desktop app.
//   Auto-detect: the computer's audio (interviewer, via ScreenCaptureKit) AND
//                your microphone (your own words; echo cancellation on so the
//                meeting isn't heard twice). If computer audio isn't allowed,
//                the microphone alone (echo cancellation off: hears you and the
//                meeting from the speakers).
//   Manual:      the microphone (echo cancellation off), one recording per press.
// The browser test build keeps its own shimmed path (webtest-shim.js).
import { invoke } from "@tauri-apps/api/core";
import { emit as tauriEmit } from "@tauri-apps/api/event";
import * as mic from "@/lib/webtest/browser-listen";

type VadConfig = { enabled?: boolean; max_recording_duration_secs?: number; [key: string]: any } | any;

const isWebtest = () => typeof window !== "undefined" && !!(window as any).__PLUELY_WEBTEST__;
const emit = (event: string, payload?: unknown) => {
  if (event !== "recording-progress") trace(`[listen] ${event}${typeof payload === "string" ? ` (${payload.length} chars)` : ""}`);
  void tauriEmit(event, payload);
};

const trace = (message: string) => {
  console.log(message);
  void invoke("log_frontend", { message }).catch(() => undefined); // shows in the app's log
};

let micOn = false;
let nativeOn = false;
let runningMode: "auto" | "manual" | null = null;
export let lastNote = "";

// Starts/stops run one at a time (two quick starts used to clash: "Capture already running").
let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
};

export function start(args: { vadConfig: VadConfig; deviceId?: string | null }): Promise<string> {
  if (isWebtest()) return invoke<string>("start_system_audio_capture", args);
  return serial(() => startNow(args));
}

async function startNow(args: { vadConfig: VadConfig; deviceId?: string | null }): Promise<string> {
  const auto = args.vadConfig?.enabled !== false;
  const mode = auto ? "auto" : "manual";
  // Already listening in this mode (auto): nothing to do. Manual = a new recording each time.
  if (auto && runningMode === "auto" && (micOn || nativeOn)) return "started";
  await stopNow();
  lastNote = "";
  if (auto) {
    try {
      await invoke<string>("start_system_audio_capture", args);
      nativeOn = true;
    } catch (e) {
      nativeOn = false;
      const msg = e instanceof Error ? e.message : String(e);
      lastNote = /permission|declined|TCC|not allowed/i.test(msg)
        ? "Computer audio is off (Screen & System Audio Recording not allowed for Pluely) — listening through the microphone."
        : `Computer audio unavailable (${msg}) — listening through the microphone.`;
      trace(`[listen] computer audio unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  try {
    await mic.start(emit, args.vadConfig as any, { echoCancellation: auto && nativeOn });
    micOn = true;
  } catch (e) {
    micOn = false;
    trace(`[listen] microphone failed: ${e instanceof Error ? e.message : String(e)}`);
    if (!nativeOn) throw e; // neither source works
    trace(`[listen] microphone unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }
  runningMode = mode;
  trace(`[listen] started: computer audio=${nativeOn} microphone=${micOn} mode=${auto ? "auto" : "manual"}${lastNote ? " — " + lastNote : ""}`);
  return "started";
}

export function stop(): Promise<void> {
  if (isWebtest()) return invoke<string>("stop_system_audio_capture").then(() => undefined);
  return serial(stopNow);
}

async function stopNow(): Promise<void> {
  runningMode = null;
  if (micOn) await mic.stop(emit, { silent: nativeOn }).catch(() => undefined);
  micOn = false;
  if (nativeOn) await invoke<string>("stop_system_audio_capture").catch(() => undefined);
  nativeOn = false;
  // Also stop any native capture left from an earlier session.
  await invoke<string>("stop_system_audio_capture").catch(() => undefined);
}

export async function manualStop(): Promise<void> {
  if (isWebtest()) {
    await invoke("manual_stop_continuous");
    return;
  }
  if (micOn) await mic.manualStop(emit);
  else await invoke("manual_stop_continuous");
}
