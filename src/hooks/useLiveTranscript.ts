import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import { useApp } from "@/contexts";
import { fetchSTT } from "@/lib";
import { floatArrayToWav } from "@/lib/utils";
import {
  cleanTranscript,
  isNoiseTranscript,
  looksLikeQuestion,
  splitQuestions,
} from "@/lib/functions/transcript-filter";

export type Speaker = "you" | "interviewer";

export interface TranscriptEntry {
  id: number;
  speaker: Speaker;
  text: string;
  at: Date;
  status: "transcribing" | "done" | "error";
  isQuestion: boolean;
  mode?: string; // interview mode active when the speech ended
}

export type SourceState = "off" | "starting" | "on" | "error";

const VAD_ASSETS = { baseAssetPath: "/vad/", onnxWASMBasePath: "/vad/" };

// Test instrumentation (?simtest=1): timestamps every step on window.__txlog and
// keeps the shared tab's audio off the speakers so the mic doesn't hear it.
const SIMTEST =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("simtest");
const txlog = (event: string, data: Record<string, unknown> = {}) => {
  if (!SIMTEST) return;
  const w = window as any;
  (w.__txlog ||= []).push({ event, t: Date.now(), ...data });
};

/**
 * Live, speaker-labelled transcript.
 * - "You": the microphone.
 * - "Interviewer": audio shared from the meeting tab/window (getDisplayMedia),
 *   so the other side of a browser call is captured without virtual devices.
 * Each source runs its own voice-activity detector; every finished phrase is
 * transcribed and appended with its speaker and time.
 */
export function useLiveTranscript(opts: {
  onQuestion?: (text: string, entryId: number, mode?: string) => void;
  getMode?: () => string;
}) {
  const { selectedSttProvider, allSttProviders } = useApp();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [mic, setMic] = useState<SourceState>("off");
  const [share, setShare] = useState<SourceState>("off");
  const [error, setError] = useState<string | null>(null);
  // Auto-answer per speaker: interviewer questions, and your own questions too.
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [autoAnswerYou, setAutoAnswerYou] = useState(true);
  const [speaking, setSpeaking] = useState<Record<Speaker, boolean>>({
    you: false,
    interviewer: false,
  });

  const nextId = useRef(1);
  const nativeCapture = useRef(false);
  const nativeUnlisten = useRef<(() => void) | null>(null);
  const vads = useRef<Partial<Record<Speaker, MicVAD>>>({});
  const streams = useRef<Partial<Record<Speaker, MediaStream>>>({});
  const autoRef = useRef(autoAnswer);
  autoRef.current = autoAnswer;
  const autoYouRef = useRef(autoAnswerYou);
  autoYouRef.current = autoAnswerYou;
  const onQuestionRef = useRef(opts.onQuestion);
  onQuestionRef.current = opts.onQuestion;
  const getModeRef = useRef(opts.getMode);
  getModeRef.current = opts.getMode;
  const sttRef = useRef({ selectedSttProvider, allSttProviders });
  sttRef.current = { selectedSttProvider, allSttProviders };

  const update = (id: number, patch: Partial<TranscriptEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const handleClip = useCallback(
    (speaker: Speaker, audio: Float32Array) =>
      handleAudio(speaker, floatArrayToWav(audio, 16000, "wav"), audio.length / 16000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleAudio = useCallback(async (speaker: Speaker, wav: Blob, seconds: number) => {
    const id = nextId.current++;
    const mode = getModeRef.current?.(); // the mode when the question was asked
    txlog("speech_end", { id, speaker, mode, seconds: +seconds.toFixed(2) });
    setEntries((prev) => [
      ...prev,
      { id, speaker, text: "", at: new Date(), status: "transcribing", isQuestion: false, mode },
    ]);
    try {
      const { selectedSttProvider: sel, allSttProviders: all } = sttRef.current;
      const provider = all.find((p) => p.id === sel.provider);
      const text = await fetchSTT({
        provider,
        selectedProvider: sel,
        audio: wav,
      });
      txlog("transcribed", { id, speaker, text });
      if (!text || isNoiseTranscript(text)) {
        txlog("dropped_noise", { id, speaker, text });
        setEntries((prev) => prev.filter((e) => e.id !== id));
        return;
      }
      const clean = cleanTranscript(text);
      const isQuestion = looksLikeQuestion(clean);
      update(id, { text: clean, status: "done", isQuestion });
      txlog("shown", { id, speaker, text: clean, isQuestion });
      const auto = speaker === "interviewer" ? autoRef.current : autoYouRef.current;
      if (isQuestion && auto) {
        // Several questions in one breath → one queued job each.
        for (const q of splitQuestions(clean)) {
          txlog("auto_answer", { id, text: q });
          onQuestionRef.current?.(q, id, mode);
        }
      }
    } catch (e) {
      update(id, {
        status: "error",
        text: e instanceof Error ? e.message : "Transcription failed",
      });
    }
  }, []);

  const startSource = useCallback(
    async (speaker: Speaker, stream: MediaStream) => {
      const vad = await MicVAD.new({
        ...VAD_ASSETS,
        stream,
        positiveSpeechThreshold: 0.6,
        // Keep ~1s of audio from before speech was detected so first words
        // ("Write a…") aren't clipped, and wait a little longer before ending.
        preSpeechPadFrames: 10,
        redemptionFrames: 10,
        onSpeechStart: () => {
          txlog("speech_start", { speaker });
          setSpeaking((s) => ({ ...s, [speaker]: true }));
        },
        onVADMisfire: () => setSpeaking((s) => ({ ...s, [speaker]: false })),
        onSpeechEnd: (audio: Float32Array) => {
          setSpeaking((s) => ({ ...s, [speaker]: false }));
          handleClip(speaker, audio);
        },
      } as any);
      vad.start();
      void (await import("@/lib/audio-context-tracker")).resumeAllAudio();
      vads.current[speaker] = vad;
      streams.current[speaker] = stream;
    },
    [handleClip]
  );

  const stopSource = useCallback((speaker: Speaker) => {
    if (speaker === "interviewer" && nativeCapture.current) {
      nativeCapture.current = false;
      nativeUnlisten.current?.();
      nativeUnlisten.current = null;
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("stop_system_audio_capture").catch(() => {}));
    }
    try {
      vads.current[speaker]?.destroy();
    } catch {}
    streams.current[speaker]?.getTracks().forEach((t) => t.stop());
    delete vads.current[speaker];
    delete streams.current[speaker];
    setSpeaking((s) => ({ ...s, [speaker]: false }));
  }, []);

  const toggleMic = useCallback(async () => {
    if (mic === "on" || mic === "starting") {
      stopSource("you");
      setMic("off");
      return;
    }
    setError(null);
    setMic("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      await startSource("you", stream);
      setMic("on");
    } catch (e) {
      setMic("error");
      setError(
        "Microphone unavailable: " + (e instanceof Error ? e.message : String(e))
      );
    }
  }, [mic, startSource, stopSource]);

  const toggleShare = useCallback(async () => {
    if (share === "on" || share === "starting") {
      stopSource("interviewer");
      setShare("off");
      return;
    }
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      // Desktop app: capture the computer's audio natively (ScreenCaptureKit),
      // which hears everyone in any meeting app — no tab sharing, no BlackHole.
      setShare("starting");
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const { listen } = await import("@tauri-apps/api/event");
        nativeUnlisten.current?.();
        const unSpeech = await listen<string>("speech-detected", (ev) => {
          const bytes = Uint8Array.from(atob(ev.payload), (c) => c.charCodeAt(0));
          handleAudio("interviewer", new Blob([bytes], { type: "audio/wav" }), bytes.length / 32000);
        });
        const unStart = await listen("speech-start", () =>
          setSpeaking((sp) => ({ ...sp, interviewer: true }))
        );
        nativeUnlisten.current = () => {
          unSpeech();
          unStart();
        };
        const vadConfig = await invoke("get_vad_config").catch(() => undefined);
        await invoke("start_system_audio_capture", { vadConfig, deviceId: null });
        nativeCapture.current = true;
        setShare("on");
      } catch (e) {
        setShare("error");
        setError(
          "Couldn't capture the computer's audio: " +
            (e instanceof Error ? e.message : String(e)) +
            ". Allow Pluely in Privacy & Security → Screen & System Audio Recording."
        );
      }
      return;
    }
    setShare("starting");
    // Test mode (?simtest=1): take the interviewer simulator's stream directly.
    // It goes through the same detection → transcription → queue path; only
    // Chrome's share picker is skipped (automated Chrome can't share real tab audio).
    const simFrame = SIMTEST ? (document.getElementById("pluely-sim-frame") as any) : null;
    const simStream: MediaStream | undefined = simFrame?.contentWindow?.getSimStream?.() ?? undefined;
    if (simStream) {
      try {
        txlog("share_track", { surface: "simulator-stream" });
        await startSource("interviewer", simStream);
        setShare("on");
      } catch (e) {
        setShare("error");
        setError("Simulator stream failed: " + (e instanceof Error ? e.message : String(e)));
      }
      return;
    }
    try {
      // Chrome only shares audio together with video; we drop the video track.
      // Ask for a browser tab (the meeting tab): the picker opens on the tab
      // list, tab audio is supported, and no screen-recording permission is needed.
      const display = await navigator.mediaDevices.getDisplayMedia(
        (SIMTEST
          ? // Test mode: the interviewer simulator plays inside this tab, so share
            // this tab and keep its sound off the speakers (mic won't hear it).
            { video: { displaySurface: "browser" }, audio: { suppressLocalAudioPlayback: true }, preferCurrentTab: true, selfBrowserSurface: "include" }
          : {
              // Let the user pick a meeting tab OR the entire screen. With the
              // entire screen + "Share system audio", Chrome captures all
              // computer audio (Zoom/Teams/Meet apps) — no virtual audio device.
              video: { displaySurface: "browser" }, // opens on Tabs; Entire screen still selectable
              audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
              systemAudio: "include",
              selfBrowserSurface: "exclude",
              surfaceSwitching: "include",
              monitorTypeSurfaces: "include",
              preferCurrentTab: false,
            }) as any
      );
      const audioTracks = display.getAudioTracks();
      if (!audioTracks.length) {
        setShare("error");
        setError(
          'No audio was shared. Pick the meeting tab with "Also share tab audio", or Entire screen with "Share system audio" (for Zoom/Teams apps).'
        );
        return;
      }
      const vt = display.getVideoTracks()[0];
      txlog("share_track", {
        surface: (vt?.getSettings() as any)?.displaySurface,
        videoLabel: vt?.label,
        audioLabel: audioTracks[0]?.label,
      });
      display.getVideoTracks().forEach((t) => t.stop());
      const stream = new MediaStream(audioTracks);
      audioTracks[0].addEventListener("ended", () => {
        stopSource("interviewer");
        setShare("off");
      });
      await startSource("interviewer", stream);
      setShare("on");
    } catch (e) {
      setShare("off");
      const msg = e instanceof Error ? e.message : String(e);
      if (!/denied|cancel|abort/i.test(msg)) setError("Couldn't share audio: " + msg);
    }
  }, [share, startSource, stopSource]);

  const clear = useCallback(() => setEntries([]), []);

  useEffect(
    () => () => {
      stopSource("you");
      stopSource("interviewer");
    },
    [stopSource]
  );

  return {
    entries,
    mic,
    share,
    error,
    speaking,
    autoAnswer,
    setAutoAnswer,
    autoAnswerYou,
    setAutoAnswerYou,
    toggleMic,
    toggleShare,
    clear,
  };
}
