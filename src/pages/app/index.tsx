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
import { CaptionsIcon, HistoryIcon, SparklesIcon } from "lucide-react";
import { HistoryPanel } from "./components/history/HistoryPanel";
import { useRef, useState } from "react";
import { useAnswerQueue } from "@/hooks/useAnswerQueue";
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
  const [historyOpen, setHistoryOpen] = useState(false);

  // Questions are answered one at a time, in order, each in the mode it was
  // asked in; a new question never cancels the answer that is streaming.
  const { currentMode, applyMode } = useAppContext();
  const modeRef = useRef(currentMode);
  modeRef.current = currentMode;
  const queue = useAnswerQueue({
    submit: completion.submit,
    isLoading: completion.isLoading,
    error: completion.error,
    response: completion.response,
    cancelCount: completion.cancelCount,
    currentMode,
    applyMode,
  });
  // Test hook (?simtest=1 only): expose the queue to the test runner.
  if (typeof window !== "undefined" && window.location.search.includes("simtest")) {
    (window as any).__queue = queue;
  }

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
        <Card id="app-card" className="w-full flex flex-col gap-1.5 p-2">
          {/* Header row — fixed height, never grows with the input */}
          <div className="flex flex-row items-center gap-1.5 w-full min-w-0 [&_button.size-9]:size-8">
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
                <Audio
                  {...completion}
                  // Voice questions join the answer queue, so they never cancel an answer in progress.
                  submit={async (text?: string) => {
                    if (text) queue.enqueue(text, { mode: currentMode, source: "manual" });
                  }}
                />
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
                <Button
                  size="icon"
                  variant={historyOpen ? "default" : "outline"}
                  className="cursor-pointer"
                  title="History — previous questions and answers"
                  onClick={() => setHistoryOpen((o) => !o)}
                >
                  <HistoryIcon className="h-4 w-4" />
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

          {/* Live transcript — above the question bar so answers (which open below it) never cover it */}
          {transcriptOpen && !capturing && (
            <LiveTranscript
              onAnswer={(text, entryId, source, mode) =>
                queue.enqueue(text, { mode: (mode as typeof currentMode) || currentMode, source, entryId })
              }
              getMode={() => modeRef.current}
              jobs={queue.jobs}
              onRemoveJob={queue.remove}
              onClearFinished={queue.clearFinished}
              onClose={() => setTranscriptOpen(false)}
            />
          )}

          {/* Input row — below the divider, expands downward as you type */}
          {!capturing && (
            <div className="w-full border-t border-input/30 pt-1.5 flex items-center gap-2">
              {/* Debug mode: screen-watch control sits beside the question bar (the header is full at 600px). */}
              <DebugWatcher />
              <div className="flex-1 min-w-0">
              <Input
                {...completion}
                // Hide the answer overlay while History is open so it doesn't cover it.
                isPopoverOpen={completion.isPopoverOpen && !historyOpen}
                isHidden={isHidden}
              />
              </div>
            </div>
          )}

          {/* History — every previous question and answer */}
          {historyOpen && !capturing && <HistoryPanel onClose={() => setHistoryOpen(false)} />}


        </Card>

        {customizable.cursor.type === "invisible" && platform !== "linux" ? (
          <CustomCursor />
        ) : null}
      </div>
    </ErrorBoundary>
  );
};

export default App;
