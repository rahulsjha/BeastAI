import { Card, Updater, DragButton, CustomCursor, Button } from "@/components";
import { ModeSelector } from "./components";
import { Input } from "./components/completion/Input";
import { Screenshot } from "./components/completion/Screenshot";
import { Files } from "./components/completion/Files";
import { useApp, useCompletion } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { CaptionsIcon, HistoryIcon, KeyboardIcon, SparklesIcon } from "lucide-react";
import { ShortcutsPanel } from "./components/help/ShortcutsPanel";
import { HideButton, HidePanel } from "./components/HideMenu";
import { AutoButton, AutoStatus, useAutoListen } from "./components/AutoListen";
import { useLiveTranscript } from "@/hooks/useLiveTranscript";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { HistoryPanel } from "./components/history/HistoryPanel";
import { SolveScreen } from "./components/SolveScreen";
import { AnswerQueue } from "./components/transcript/AnswerQueue";
import { AttachmentTray } from "./components/completion/AttachmentTray";
import { useEffect, useRef, useState } from "react";
import { useAnswerQueue } from "@/hooks/useAnswerQueue";
import { LiveTranscript } from "./components/transcript/LiveTranscript";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { getPlatform } from "@/lib";

const App = () => {
  const { isHidden } = useApp();
  const { customizable } = useAppContext();
  const completion = useCompletion();
  const platform = getPlatform();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
  // The single Auto switch: always-on listening (you + interviewer) that answers
  // every detected question in the current mode, with the fast model.
  const live = useLiveTranscript({
    onQuestion: (q, entryId, mode) =>
      queue.enqueue(q, { mode: (mode as typeof currentMode) || modeRef.current, source: "auto", entryId, fast: true }),
    getMode: () => modeRef.current,
  });
  const auto = useAutoListen(live);
  const shortcuts = useGlobalShortcuts();
  const toggleAutoRef = useRef(auto.toggle);
  toggleAutoRef.current = auto.toggle;
  useEffect(() => {
    // ⌘⇧M (was Listen) and ⌘⇧A (was Mic) both pause / resume Auto now.
    shortcuts.registerSystemAudioCallback(() => void toggleAutoRef.current());
    shortcuts.registerAudioCallback(() => void toggleAutoRef.current());
  }, [shortcuts.registerSystemAudioCallback, shortcuts.registerAudioCallback]);
  const autoWasOn = useRef(false);
  useEffect(() => {
    if (completion.enableVAD) {
      autoWasOn.current = auto.on;
      if (auto.on) void auto.stop();
    } else if (autoWasOn.current) {
      autoWasOn.current = false;
      void auto.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completion.enableVAD]);
  const waitingJobs = queue.jobs.filter((j) => j.status === "waiting").length;
  const answeringJob = queue.jobs.some((j) => j.status === "answering");

  // Test hook (?simtest=1 only): expose the queue to the test runner.
  if (typeof window !== "undefined" && window.location.search.includes("simtest")) {
    (window as any).__queue = queue;
  }
  // Browser test version only: let test scripts read the answer state.
  if (typeof window !== "undefined" && (window as any).__PLUELY_WEBTEST__) {
    (window as any).__completionState = {
      isLoading: completion.isLoading,
      response: completion.response.length,
      error: completion.error,
      isPopoverOpen: completion.isPopoverOpen,
      history: completion.conversationHistory.length,
    };
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
        <Card
          id="app-card"
          className={`w-full flex flex-col gap-1.5 p-2 ${dragOver ? "ring-2 ring-sky-400/70" : ""}`}
          // Drop screenshots, images, PDFs, logs or documents anywhere on the bar.
          onDragOver={(e) => {
            if (e.dataTransfer?.types?.includes("Files")) {
              e.preventDefault();
              setDragOver(true);
            }
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragOver(false);
            for (const f of Array.from(e.dataTransfer?.files ?? [])) await completion.addFile(f);
          }}
        >
          {/* Header row — fixed height, never grows with the input */}
          <div className="flex flex-row items-center gap-0.5 w-full min-w-0 pr-1.5 [&_button.size-9]:size-7 [&>*]:shrink-0">
            <AutoButton t={live} on={auto.on} onToggle={() => void auto.toggle()} />

            {(
              <>
                <ModeSelector />
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
                <Button
                  size="icon"
                  variant={helpOpen ? "default" : "outline"}
                  className="cursor-pointer"
                  title="Shortcuts & controls — test each shortcut, hide or quit Beast"
                  onClick={() => setHelpOpen((o) => !o)}
                >
                  <KeyboardIcon className="h-4 w-4" />
                </Button>
                <div className="flex-1" />
                <HideButton open={hideOpen} onToggle={() => setHideOpen((o) => !o)} />
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

          {hideOpen && <HidePanel onClose={() => setHideOpen(false)} />}

          {/* Auto is on: one quiet status line (who is speaking / last line heard). */}
          {auto.on && <AutoStatus t={live} waiting={waitingJobs} answering={answeringJob} />}

          {/* Live transcript — above the question bar so answers (which open below it) never cover it */}
          {transcriptOpen && (
            <LiveTranscript
              t={live}
              onAnswer={(text, entryId, source, mode) =>
                queue.enqueue(text, { mode: (mode as typeof currentMode) || currentMode, source, entryId })
              }
              jobs={queue.jobs}
              onRemoveJob={queue.remove}
              onClearFinished={queue.clearFinished}
              onClose={() => setTranscriptOpen(false)}
            />
          )}

          {/* Answer queue (when the Live transcript, which also shows it, is closed) */}
          {!transcriptOpen && !historyOpen && queue.jobs.length > 0 && (
            <div className="w-full rounded-xl border border-input/50 bg-muted/20">
              <AnswerQueue jobs={queue.jobs} onRemove={queue.remove} onClearFinished={queue.clearFinished} />
            </div>
          )}

          {/* What will be sent with the next question (screenshots, documents) */}
          {/* While an answer is open, its follow-up box shows (and sends) these instead. */}
          {!completion.isPopoverOpen && (
            <AttachmentTray
              files={completion.attachedFiles}
              onRemove={completion.removeFile}
              onClear={completion.clearFiles}
              onNote={completion.setFileNote}
              onAddScreen={completion.captureFullScreen}
              onAddArea={completion.captureScreenshot}
              onSend={() => void completion.submit()}
              onAddText={() => {
                const ta = document.querySelector<HTMLTextAreaElement>("#app-card textarea");
                ta?.focus();
              }}
              busy={completion.isLoading || completion.isScreenshotLoading}
            />
          )}

          {/* Input row — below the divider, expands downward as you type */}
          {(
            <div className="w-full border-t border-input/30 pt-1.5 flex items-center gap-2">
              {/* Solve screen: reads the screen and answers new questions (not in Debug). */}
              {currentMode !== "debug" && (
                <SolveScreen
                  onQuestion={(q, mode) => queue.enqueue(q, { mode, source: "auto" })}
                />
              )}
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
          {historyOpen && (
            <HistoryPanel
              onClose={() => setHistoryOpen(false)}
              onContinue={async (item, action) => {
                const ok = await completion.continueConversation(item.conversationId, {
                  question: item.question,
                  answer: item.answer,
                  at: item.at,
                });
                if (!ok) return;
                setHistoryOpen(false);
                // 📸: add the current screen to it (waits as a chip until Send).
                if (action === "screen") setTimeout(() => void completion.captureFullScreen(), 250);
                // 🎤: start a voice follow-up in it.
                if (action === "voice") completion.setEnableVAD(true);
              }}
            />
          )}

          {/* Shortcuts & controls — every shortcut, Try buttons, ✓ when a key press works, Hide / Quit */}
          {helpOpen && <ShortcutsPanel onClose={() => setHelpOpen(false)} />}


        </Card>

        {customizable.cursor.type === "invisible" && platform !== "linux" ? (
          <CustomCursor />
        ) : null}
      </div>
    </ErrorBoundary>
  );
};

export default App;
