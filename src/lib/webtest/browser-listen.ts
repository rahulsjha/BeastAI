// Browser stand-in for the desktop "Listen" engine (Rust speaker/commands.rs).
//
// No tab-sharing pop-up: the browser version listens through the MICROPHONE,
// with echo cancellation off so it also hears the meeting playing on the
// speakers. (The desktop app captures the computer's audio directly.)
// It emits the SAME events the Rust engine does, so useSystemAudio is unchanged:
//   Auto-detect: speech-start → speech-detected (base64 WAV), one per phrase
//   Manual:      continuous-recording-start → recording-progress (s)
//                → speech-detected (on stop / max length) → continuous-recording-stopped
import { MicVAD } from "@ricky0123/vad-web";
import { floatArrayToWav } from "@/lib/utils";
import { resumeAllAudio } from "@/lib/audio-context-tracker";
import { getDefaultMic } from "@/lib/default-mic";

type Emit = (event: string, payload?: unknown) => void;
type VadConfig = { enabled?: boolean; max_recording_duration_secs?: number } | undefined;

let stream: MediaStream | null = null;
let vad: MicVAD | null = null;
let recorder: { ctx: AudioContext; node: ScriptProcessorNode; chunks: Float32Array[]; rate: number } | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;

const blobToBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(b);
  });

function resample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)];
  return out;
}

async function emitClip(emit: Emit, samples: Float32Array) {
  if (samples.length < 16000 * 0.3) {
    emit("speech-discarded", "too short");
    return;
  }
  emit("speech-detected", await blobToBase64(floatArrayToWav(samples, 16000, "wav")));
}

export async function start(emit: Emit, vadConfig: VadConfig) {
  await stop(emit, { silent: true });
  try {
    // System default mic; echo cancellation off to keep the speakers' meeting audio.
    stream = await getDefaultMic({ echoCancellation: false, noiseSuppression: true, autoGainControl: true });
  } catch (e) {
    throw new Error(
      "Microphone access is needed for Listen in the browser: " + (e instanceof Error ? e.message : String(e))
    );
  }
  emit("capture-started", 16000);

  if (vadConfig?.enabled !== false) {
    vad = await MicVAD.new({
      stream,
      baseAssetPath: "/vad/",
      onnxWASMBasePath: "/vad/",
      positiveSpeechThreshold: 0.6,
      preSpeechPadFrames: 10,
      redemptionFrames: 6, // ~0.6s of silence ends a phrase
      onSpeechStart: () => emit("speech-start"),
      onSpeechEnd: (audio: Float32Array) => void emitClip(emit, audio),
    } as any);
    vad.start();
    void resumeAllAudio();
    return;
  }

  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(node);
  node.connect(ctx.destination);
  recorder = { ctx, node, chunks, rate: ctx.sampleRate };
  void ctx.resume();
  const max = vadConfig?.max_recording_duration_secs ?? 180;
  const startedAt = Date.now();
  emit("continuous-recording-start", max);
  progressTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    emit("recording-progress", secs);
    if (secs >= max) void manualStop(emit);
  }, 1000);
}

export async function manualStop(emit: Emit) {
  if (!recorder) return;
  const { ctx, node, chunks, rate } = recorder;
  recorder = null;
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = null;
  node.disconnect();
  await ctx.close().catch(() => {});
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  await emitClip(emit, resample(all, rate));
  emit("continuous-recording-stopped");
}

export async function stop(emit: Emit, { silent = false } = {}) {
  if (recorder) {
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
    recorder.node.disconnect();
    await recorder.ctx.close().catch(() => {});
    recorder = null;
  }
  try {
    vad?.destroy();
  } catch {}
  vad = null;
  stream?.getTracks().forEach((t) => t.stop());
  const had = !!stream;
  stream = null;
  if (had && !silent) emit("capture-stopped");
}

export function installBrowserListen() {
  (window as any).__browserListen = { start, stop, manualStop };
}
