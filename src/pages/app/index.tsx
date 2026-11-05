import { Card, Updater, DragButton, CustomCursor, Button } from "@/components";
import {
  SystemAudio,
  AudioVisualizer,
  StatusIndicator,
  ModeSelector,
  DebugWatcher,
} from "./components";
import { Audio } from "./components/completion/Audio";
import { Input } from "./components/completion/Input";
import { Screenshot } from "./components/completion/Screenshot";
import { Files } from "./components/completion/Files";
import { useApp, useCompletion } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { CaptionsIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LiveTranscript } from "./components/transcript/LiveTranscript";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { getPlatform } from "@/lib";

const App = () => {
  const { isHidden, systemAudio } = useApp();
  const { customizable } = useAppContext();
  const completion = useCompletion();
  const platform = getPlatform();
  const capturing = systemAudio?.capturing;
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // Questions from the transcript are answered one at a time, in order.
  // A new question never cancels the answer that is still streaming.
  const [questionQueue, setQuestionQueue] = useState<string[]>([]);
  const pendingRef = useRef(false);
  const enqueueQuestion = (q: string) => setQuestionQueue((prev) => [...prev, q]);
  useEffect(() => {
    if (completion.isLoading) {
      pendingRef.current = false; // our submit has started
      return;
    }
    if (pendingRef.current || questionQueue.length === 0) return;
    const [next, ...rest] = questionQueue;
    setQuestionQueue(rest);
    pendingRef.current = true;
    completion.submit(next);
    // Safety: if the submit never starts loading, don't block the queue.
    const t = setTimeout(() => (pendingRef.current = false), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionQueue, completion.isLoading]);

  const openDashboard = async () => {
    try {
      await invoke("open_dashboard");
    } catch (error) {
      console.error("Failed to open dashboard:", error);
    }
  };

  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout isCompact />;
      }}
      resetKeys={["app-error"]}
      onReset={() => {
        console.log("Reset");
      }}
    >
      <div
        className={`w-screen h-screen flex overflow-hidden justify-center items-start ${
          isHidden ? "hidden pointer-events-none" : ""
        }`}
      >
        <Card className="w-full flex flex-col gap-1.5 p-2">
          {/* Header row — fixed height, never grows with the input */}
          <div className="flex flex-row items-center gap-2 w-full">
            <SystemAudio {...systemAudio} />

            {capturing ? (
              <div className="flex flex-1 items-center gap-2 justify-between">
                <div className="flex flex-1 items-center gap-2">
                  <AudioVisualizer isRecording={capturing} />
                </div>
                <StatusIndicator
                  setupRequired={systemAudio.setupRequired}
                  error={systemAudio.error}
                  isProcessing={systemAudio.isProcessing}
                  isAIProcessing={systemAudio.isAIProcessing}
                  capturing={systemAudio.capturing}
                />
              </div>
            ) : (
              <>
                <ModeSelector />
                <DebugWatcher />
                <Audio {...completion} />
                <Screenshot {...completion} />
                <Files {...completion} />
                <Button
                  size="icon"
                  variant={transcriptOpen ? "default" : "outline"}
                  className="cursor-pointer"
                  title="Live transcript (You + Interviewer)"
                  onClick={() => setTranscriptOpen((o) => !o)}
                >
                  <CaptionsIcon className="h-4 w-4" />
                </Button>
                <div className="flex-1" />
                <Button
                  size={"icon"}
                  className="cursor-pointer"
                  title="Open Dev Space"
                  onClick={openDashboard}
                >
                  <SparklesIcon className="h-4 w-4" />
                </Button>
              </>
            )}

            <Updater />
            <DragButton />
          </div>

          {/* Input row — below the divider, expands downward as you type */}
          {!capturing && (
            <div className="w-full border-t border-input/30 pt-1.5">
              <Input {...completion} isHidden={isHidden} />
            </div>
          )}

          {/* Live transcript — speaker-labelled You / Interviewer */}
          {transcriptOpen && !capturing && (
            <LiveTranscript
              onAnswer={enqueueQuestion}
              queued={questionQueue}
              answering={completion.isLoading}
              onClose={() => setTranscriptOpen(false)}
            />
          )}
        </Card>

        {customizable.cursor.type === "invisible" && platform !== "linux" ? (
          <CustomCursor />
        ) : null}
      </div>
    </ErrorBoundary>
  );
};

export default App;
