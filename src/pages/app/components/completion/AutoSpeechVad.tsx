import { fetchSTT } from "@/lib";
import { UseCompletionReturn } from "@/types";
import { useMicVAD } from "@ricky0123/vad-react";
import { LoaderCircleIcon, MicIcon, MicOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components";
import { useApp } from "@/contexts";
import { floatArrayToWav } from "@/lib/utils";
import { shouldUsePluelyAPI } from "@/lib/functions/pluely.api";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";

// Mic pipeline diagnostics → app log ("[frontend] mic: …" in the tauri dev output).
const micLog = (msg: string) => {
  console.debug("[mic]", msg);
  invoke("log_frontend", { message: `mic: ${msg}` }).catch(() => {});
};

// In development React mounts effects twice, which can leave two VAD
// instances alive; both fire onSpeechEnd for the same clip. Drop the copy.
let lastClip = { sig: "", at: 0 };
const isDuplicateClip = (audio: Float32Array) => {
  const sig = `${audio.length}:${audio[0]}:${audio[audio.length >> 1]}`;
  const now = Date.now();
  const dup = sig === lastClip.sig && now - lastClip.at < 3000;
  lastClip = { sig, at: now };
  return dup;
};

// Audio-level diagnostics, logged every ~2s while listening.
const levelStats = { frames: 0, maxProb: 0, maxRms: 0, last: 0 };
const trackFrame = (prob: number, frame: Float32Array) => {
  levelStats.frames++;
  levelStats.maxProb = Math.max(levelStats.maxProb, prob);
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  levelStats.maxRms = Math.max(levelStats.maxRms, Math.sqrt(sum / (frame.length || 1)));
  const now = Date.now();
  if (now - levelStats.last > 2000) {
    micLog(`audio: ${levelStats.frames} frames, loudest rms ${levelStats.maxRms.toFixed(4)}, top speech score ${levelStats.maxProb.toFixed(2)}`);
    Object.assign(levelStats, { frames: 0, maxProb: 0, maxRms: 0, last: now });
  }
};

interface AutoSpeechVADProps {
  submit: UseCompletionReturn["submit"];
  setState: UseCompletionReturn["setState"];
  setEnableVAD: UseCompletionReturn["setEnableVAD"];
  microphoneDeviceId?: string;
}

const AutoSpeechVADInternal = ({
  submit,
  setState,
  setEnableVAD,
  microphoneDeviceId,
}: AutoSpeechVADProps) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const { selectedSttProvider, allSttProviders } = useApp();

  const audioConstraints: MediaTrackConstraints =
    microphoneDeviceId && microphoneDeviceId !== "default"
      ? { deviceId: { exact: microphoneDeviceId } }
      : {};

  const vad = useMicVAD({
    // Serve the VAD model, audio worklet, and onnxruntime WASM from the app
    // bundle (public/vad/) instead of a CDN — the native webview can't rely on
    // CDN fetches, which made the mic silently do nothing.
    baseAssetPath: "/vad/",
    onnxWASMBasePath: "/vad/",
    userSpeakingThreshold: 0.6,
    onFrameProcessed: (probs: { isSpeech: number }, frame: Float32Array) =>
      trackFrame(probs.isSpeech, frame),
    startOnLoad: true,
    additionalAudioConstraints: audioConstraints,
    onSpeechEnd: async (audio) => {
      if (isDuplicateClip(audio)) return;
      micLog(`speech ended (${(audio.length / 16000).toFixed(1)}s of audio)`);
      try {
        // convert float32array to blob
        const audioBlob = floatArrayToWav(audio, 16000, "wav");

        let transcription: string;
        const usePluelyAPI = await shouldUsePluelyAPI();

        // Check if we have a configured speech provider
        if (!selectedSttProvider.provider && !usePluelyAPI) {
          console.warn("No speech provider selected");
          setState((prev: any) => ({
            ...prev,
            error:
              "No speech provider selected. Please select one in settings.",
          }));
          return;
        }

        const providerConfig = allSttProviders.find(
          (p) => p.id === selectedSttProvider.provider
        );

        if (!providerConfig && !usePluelyAPI) {
          console.warn("Selected speech provider configuration not found");
          setState((prev: any) => ({
            ...prev,
            error:
              "Speech provider configuration not found. Please check your settings.",
          }));
          return;
        }

        setIsTranscribing(true);
        micLog(`transcribing with ${selectedSttProvider.provider || "default"}`);

        // Use the fetchSTT function for all providers
        transcription = await fetchSTT({
          provider: usePluelyAPI ? undefined : providerConfig,
          selectedProvider: selectedSttProvider,
          audio: audioBlob,
        });

        micLog(`transcript: "${(transcription || "").slice(0, 120)}"`);
        // Whisper emits filler phrases on silence/noise; don't send those.
        const clean = transcription?.trim() ?? "";
        const isNoise =
          clean.replace(/[^a-z]/gi, "").length < 3 ||
          /^(thank(s| you)( for watching)?|you|bye|okay|uh|um)[.!]?$/i.test(clean);
        if (clean && !isNoise) {
          micLog("question sent");
          submit(clean);
        } else if (clean) {
          console.debug("[VAD] ignored noise transcription:", clean);
        }
      } catch (error) {
        console.error("Failed to transcribe audio:", error);
        micLog(`ERROR transcribing: ${error instanceof Error ? error.message : String(error)}`);
        setState((prev: any) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Transcription failed",
        }));
      } finally {
        setIsTranscribing(false);
      }
    },
  });

  useEffect(() => {
    if (vad.errored) micLog(`ERROR voice detector failed to start: ${vad.errored}`);
    else if (!vad.loading) micLog(vad.listening ? "listening (mic open)" : "paused");
  }, [vad.errored, vad.loading, vad.listening]);
  useEffect(() => {
    if (vad.userSpeaking) micLog("speech detected");
  }, [vad.userSpeaking]);

  return (
    <>
      <Button
        size="icon"
        onClick={() => {
          if (vad.listening) {
            vad.pause();
            setEnableVAD(false);
          } else {
            vad.start();
            setEnableVAD(true);
          }
        }}
        className="cursor-pointer"
      >
        {isTranscribing ? (
          <LoaderCircleIcon className="h-4 w-4 animate-spin text-green-500" />
        ) : vad.userSpeaking ? (
          <LoaderCircleIcon className="h-4 w-4 animate-spin" />
        ) : vad.listening ? (
          <MicOffIcon className="h-4 w-4 animate-pulse" />
        ) : (
          <MicIcon className="h-4 w-4" />
        )}
      </Button>
    </>
  );
};

export const AutoSpeechVAD = (props: AutoSpeechVADProps) => {
  return <AutoSpeechVADInternal key={props.microphoneDeviceId} {...props} />;
};
