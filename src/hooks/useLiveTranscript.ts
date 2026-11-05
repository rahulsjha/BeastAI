import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import { useApp } from "@/contexts";
import { fetchSTT } from "@/lib";
import { floatArrayToWav } from "@/lib/utils";
import {
  isNoiseTranscript,
  looksLikeQuestion,
} from "@/lib/functions/transcript-filter";

export type Speaker = "you" | "interviewer";

export interface TranscriptEntry {
  id: number;
  speaker: Speaker;
  text: string;
  at: Date;
  status: "transcribing" | "done" | "error";
  isQuestion: boolean;
}

export type SourceState = "off" | "starting" | "on" | "error";

const VAD_ASSETS = { baseAssetPath: "/vad/", onnxWASMBasePath: "/vad/" };

/**
 * Live, speaker-labelled transcript.
 * - "You": the microphone.
 * - "Interviewer": audio shared from the meeting tab/window (getDisplayMedia),
 *   so the other side of a browser call is captured without virtual devices.
 * Each source runs its own voice-activity detector; every finished phrase is
 * transcribed and appended with its speaker and time.
 */
export function useLiveTranscript(opts: {
  onQuestion?: (text: string) => void;
}) {
  const { selectedSttProvider, allSttProviders } = useApp();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [mic, setMic] = useState<SourceState>("off");
  const [share, setShare] = useState<SourceState>("off");
  const [error, setError] = useState<string | null>(null);
  const [autoAnswer, setAutoAnswer] = useState(false);
  const [speaking, setSpeaking] = useState<Record<Speaker, boolean>>({
    you: false,
    interviewer: false,
  });

  const nextId = useRef(1);
  const vads = useRef<Partial<Record<Speaker, MicVAD>>>({});
  const streams = useRef<Partial<Record<Speaker, MediaStream>>>({});
  const autoRef = useRef(autoAnswer);
  autoRef.current = autoAnswer;
  const onQuestionRef = useRef(opts.onQuestion);
  onQuestionRef.current = opts.onQuestion;
  const sttRef = useRef({ selectedSttProvider, allSttProviders });
  sttRef.current = { selectedSttProvider, allSttProviders };

  const update = (id: number, patch: Partial<TranscriptEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const handleClip = useCallback(async (speaker: Speaker, audio: Float32Array) => {
    const id = nextId.current++;
    setEntries((prev) => [
      ...prev,
      { id, speaker, text: "", at: new Date(), status: "transcribing", isQuestion: false },
    ]);
    try {
      const { selectedSttProvider: sel, allSttProviders: all } = sttRef.current;
      const provider = all.find((p) => p.id === sel.provider);
      const text = await fetchSTT({
        provider,
        selectedProvider: sel,
        audio: floatArrayToWav(audio, 16000, "wav"),
      });
      if (!text || isNoiseTranscript(text)) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        return;
      }
      const clean = text.trim();
      const isQuestion = speaker === "interviewer" && looksLikeQuestion(clean);
      update(id, { text: clean, status: "done", isQuestion });
      if (isQuestion && autoRef.current) onQuestionRef.current?.(clean);
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
        onSpeechStart: () => setSpeaking((s) => ({ ...s, [speaker]: true })),
        onVADMisfire: () => setSpeaking((s) => ({ ...s, [speaker]: false })),
        onSpeechEnd: (audio: Float32Array) => {
          setSpeaking((s) => ({ ...s, [speaker]: false }));
          handleClip(speaker, audio);
        },
      } as any);
      vad.start();
      vads.current[speaker] = vad;
      streams.current[speaker] = stream;
    },
    [handleClip]
  );

  const stopSource = useCallback((speaker: Speaker) => {
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
      setShare("error");
      setError("Sharing call audio isn't supported here. In the desktop app use Listen (headphones) with BlackHole.");
      return;
    }
    setShare("starting");
    try {
      // Chrome only shares audio together with video; we drop the video track.
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      } as DisplayMediaStreamOptions);
      display.getVideoTracks().forEach((t) => t.stop());
      const audioTracks = display.getAudioTracks();
      if (!audioTracks.length) {
        setShare("error");
        setError('No audio was shared. Pick the meeting tab and turn on "Also share tab audio".');
        return;
      }
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
    toggleMic,
    toggleShare,
    clear,
  };
}
