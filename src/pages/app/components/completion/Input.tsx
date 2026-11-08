import { useRef, useState } from "react";
import { Loader2, PaperclipIcon, PlusIcon, XIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  ScrollArea,
  Markdown,
  Switch,
  CopyButton,
} from "@/components";
import { UseCompletionReturn } from "@/types";
import { MessageHistory } from "./MessageHistory";

// The question bar keeps one fixed height. Long or multi-line questions scroll
// inside it instead of growing the bar; the full text shows as "Asked:" above
// the answer.

export const Input = ({
  isPopoverOpen,
  isLoading,
  reset,
  input,
  lastQuestion,
  lastImages,
  setInput,
  handleKeyPress,
  handlePaste,
  currentConversationId,
  conversationHistory,
  startNewConversation,
  messageHistoryOpen,
  setMessageHistoryOpen,
  error,
  response,
  cancel,
  scrollAreaRef,
  inputRef,
  isHidden,
  keepEngaged,
  setKeepEngaged,
  submit,
  attachedFiles,
  captureFullScreen,
  captureScreenshot,
  isScreenshotLoading,
  addFile,
  removeFile,
}: UseCompletionReturn & { isHidden: boolean }) => {
  const [followUp, setFollowUp] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const followUpFileRef = useRef<HTMLInputElement>(null);
  // Earlier turns of this conversation (the latest one is shown below them as the answer).
  const sorted = [...conversationHistory].sort((a, b) => a.timestamp - b.timestamp);
  const latestShown = !isLoading && !!response;
  const earlier = latestShown ? sorted.slice(0, Math.max(0, sorted.length - 2)) : sorted;
  const turns: { q?: (typeof sorted)[number]; a?: (typeof sorted)[number] }[] = [];
  for (const m of earlier) {
    if (m.role === "user") turns.push({ q: m });
    else if (m.role === "assistant") {
      if (turns.length && !turns[turns.length - 1].a) turns[turns.length - 1].a = m;
      else turns.push({ a: m });
    }
  }
  const questionCount = sorted.filter((m) => m.role === "user").length + (isLoading ? 1 : 0);
  const endConversation = () => {
    setKeepEngaged(false);
    startNewConversation();
    setFollowUp("");
  };
  const sendFollowUp = () => {
    const t = followUp.trim();
    if (isLoading || (!t && !attachedFiles.length)) return;
    setFollowUp("");
    void submit(t || undefined);
  };
  // Auto-grow the textarea with its content (and shrink back when cleared).
  return (
    <div className="relative flex-1">
      <Popover
        open={isPopoverOpen}
        onOpenChange={(open) => {
          if (!open && !isLoading && !keepEngaged) {
            reset();
          }
        }}
      >
        <PopoverTrigger asChild className="!border-none !bg-transparent">
          <div className="relative select-none">
            <textarea
              ref={inputRef as unknown as React.Ref<HTMLTextAreaElement>}
              placeholder="Ask anything…  ↵ send · ⇧↵ new line"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              onPaste={handlePaste}
              disabled={isLoading || isHidden}
              rows={1}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-primary/50 dark:border-input/80 flex h-9 max-h-9 w-full min-w-0 resize-none overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-xl border bg-transparent px-3 py-2 text-base leading-snug shadow-xs outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring/60 focus-visible:ring-ring dark:focus-visible:ring-ring/60 focus-visible:ring-[2px] ${
                currentConversationId && conversationHistory.length > 0
                  ? "pr-14"
                  : "pr-2"
              }`}
            />

            {/* Conversation thread indicator */}
            {currentConversationId &&
              conversationHistory.length > 0 &&
              !isLoading && (
                <div className="absolute select-none right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <MessageHistory
                    conversationHistory={conversationHistory}
                    currentConversationId={currentConversationId}
                    onStartNewConversation={startNewConversation}
                    messageHistoryOpen={messageHistoryOpen}
                    setMessageHistoryOpen={setMessageHistoryOpen}
                  />
                </div>
              )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </PopoverTrigger>

        {/* Response Panel */}
        <PopoverContent
          align="end"
          side="bottom"
          className="w-screen p-0 border shadow-lg overflow-hidden"
          sideOffset={8}
          // Keep the conversation open while you add screenshots, files or use the bar;
          // it closes only with ✕ or Esc.
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <div className="flex flex-row gap-1 items-center">
              <h3 className="font-semibold text-xs select-none" id="answer-title">
                {keepEngaged
                  ? "Conversation Mode"
                  : questionCount > 1
                  ? `Conversation · ${questionCount} questions`
                  : "AI Response"}
              </h3>
              <div className="text-[10px] text-muted-foreground/70">
                (Use arrow keys to scroll)
              </div>
            </div>
            <div className="flex items-center gap-2 select-none">
              <div className="flex flex-row items-center gap-2 mr-2">
                <p className="text-[10px]">{`Toggle ${
                  keepEngaged ? "AI response" : "conversation mode"
                }`}</p>
                <span className="text-[10px] text-muted-foreground/60 bg-muted/30 px-1 py-0 rounded border border-input/50">
                  {navigator.platform.toLowerCase().includes("mac")
                    ? "⌘"
                    : "Ctrl"}{" "}
                  + K
                </span>
                <Switch
                  checked={keepEngaged}
                  onCheckedChange={(checked) => {
                    setKeepEngaged(checked);
                    // Focus input after toggle
                    setTimeout(() => {
                      inputRef?.current?.focus();
                    }, 100);
                  }}
                />
              </div>
              {conversationHistory.length > 0 && !isLoading && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-[10px]"
                  onClick={endConversation}
                  title="Start a new conversation (the next question won't continue this one)"
                >
                  <PlusIcon className="h-3 w-3" /> New
                </Button>
              )}
              <CopyButton content={response} />
              <Button
                id="answer-close"
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (isLoading) {
                    cancel();
                  } else {
                    // Close = this conversation is finished; reopen it any time from History → Continue.
                    endConversation();
                  }
                }}
                className="cursor-pointer"
                title={
                  isLoading
                    ? "Cancel loading"
                    : "Close (end this conversation — reopen it from History → Continue)"
                }
              >
                <XIcon />
              </Button>
            </div>
          </div>

          <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-16.5rem)] min-h-[180px]">
            <div className="p-4">
              {error && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                  <strong>Error:</strong> {error}
                </div>
              )}
              {/* Earlier questions in this conversation, oldest first */}
              {!keepEngaged && turns.length > 0 && (
                <div id="conversation-thread" className="mb-3 space-y-2">
                  {turns.map((t, i) => {
                    const key = t.q?.id || t.a?.id || String(i);
                    const open = expanded[key];
                    const imgs = (t.q?.attachedFiles || []).filter((f) => f.type.startsWith("image/") && f.base64);
                    const docs = (t.q?.attachedFiles || []).filter((f) => !f.type.startsWith("image/"));
                    return (
                      <div key={key} data-turn={i + 1} className="rounded-lg border border-input/40 bg-muted/20 p-2">
                        <div className="flex items-start gap-2 text-[11px]">
                          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-px font-semibold">Q{i + 1}</span>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap text-muted-foreground">{t.q?.content}</span>
                          {t.q && (
                            <span className="shrink-0 text-[10px] text-muted-foreground/70">
                              {new Date(t.q.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        {(imgs.length > 0 || docs.length > 0) && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {imgs.map((f) => (
                              <img
                                key={f.id}
                                src={`data:${f.type};base64,${f.base64}`}
                                alt="Earlier screenshot"
                                className="h-12 w-20 rounded border border-input/60 object-cover object-top"
                              />
                            ))}
                            {docs.map((f) => (
                              <span key={f.id} className="rounded border border-input/50 px-1.5 py-0.5 text-[10px]">{f.name}</span>
                            ))}
                          </div>
                        )}
                        {t.a && (
                          <div className={`mt-1.5 text-sm ${open ? "" : "max-h-24 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"}`}>
                            <Markdown>{t.a.content}</Markdown>
                          </div>
                        )}
                        {t.a && (
                          <button
                            className="mt-1 text-[10px] text-sky-300 hover:underline"
                            onClick={() => setExpanded((e) => ({ ...e, [key]: !open }))}
                          >
                            {open ? "Show less" : "Show full answer"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {(isLoading || response) && (
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span className="h-px flex-1 bg-input/50" /> Latest <span className="h-px flex-1 bg-input/50" />
                    </div>
                  )}
                  {!isLoading && !response && (
                    <p className="text-[11px] text-muted-foreground">
                      Type below, or add screenshots / files, to continue this conversation.
                    </p>
                  )}
                </div>
              )}
              {/* What was asked (typed, or transcribed from the mic) */}
              {(isLoading || response) && lastQuestion && (
                <p className="text-[11px] text-muted-foreground mb-2 whitespace-pre-wrap">
                  <span className="font-semibold">Asked:</span> {lastQuestion}
                </p>
              )}
              {/* The screenshot(s) sent with this question — click to view full size */}
              {(isLoading || response) && lastImages?.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {lastImages.map((b64, i) => (
                    <a
                      key={i}
                      href={`data:image/png;base64,${b64}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block h-16 w-28 overflow-hidden rounded border border-input/60"
                      title="Screenshot sent with this question (click to open)"
                    >
                      <img src={`data:image/png;base64,${b64}`} alt="Sent screenshot" className="h-full w-full object-cover object-top" />
                    </a>
                  ))}
                </div>
              )}
              {isLoading && (
                <div className="flex items-center gap-2 my-4 text-muted-foreground animate-pulse select-none">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Generating response...</span>
                </div>
              )}
              {response && <Markdown>{response}</Markdown>}

              {/* Conversation History - Separate scroll, no auto-scroll */}
              {keepEngaged && conversationHistory.length > 1 && (
                <div className="space-y-3 pt-3">
                  {[...conversationHistory]
                    .sort((a, b) => b?.timestamp - a?.timestamp)
                    .map((message, index) => {
                      if (!isLoading && index === 0) {
                        return null;
                      }
                      return (
                        <div
                          key={message.id}
                          className={`p-3 rounded-lg text-sm ${
                            message.role === "user"
                              ? "bg-primary/10 border-l-4 border-primary"
                              : "bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-muted-foreground uppercase">
                              {message.role === "user" ? "You" : "AI"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(message.timestamp).toLocaleTimeString(
                                [],
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </span>
                          </div>
                          <Markdown>{message.content}</Markdown>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </ScrollArea>
          {/* Follow-up in the same conversation: text and/or more screenshots */}
          {attachedFiles.length > 0 && (
            <div id="followup-pending" className="flex flex-wrap items-center gap-1.5 border-t border-input/50 px-2 pt-2">
              <span className="text-[10px] text-muted-foreground">Will be added to this conversation ({attachedFiles.length}):</span>
              {attachedFiles.map((f) => (
                <span key={f.id} className="relative inline-flex items-center gap-1 rounded border border-input/60 bg-background/40 pr-1 text-[10px]">
                  {f.type.startsWith("image/") ? (
                    <img src={`data:${f.type};base64,${f.base64}`} alt="Pending" className="h-8 w-12 rounded-l object-cover object-top" />
                  ) : (
                    <span className="px-1.5 py-1">{f.name}</span>
                  )}
                  <button onClick={() => removeFile(f.id)} title="Remove" className="text-muted-foreground hover:text-foreground">
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p id="followup-hint" className="border-t border-input/50 px-2 pt-1.5 text-[10px] text-muted-foreground">
            Keep adding screenshots to this conversation — <b>+ Screen</b>, <b>+ Area</b>, 📎, or <kbd>⌘⇧↵</kbd> from any app — then <b>Send</b> them together.
          </p>
          <div className="p-2 pt-1 flex items-center gap-1.5">
            <input
              ref={followUpFileRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.csv,.json,.log,.py,.js,.ts,.tsx,.java,.go,.rs,.c,.cpp,.sql,.sh,.html,.css"
              className="hidden"
              onChange={async (e) => {
                for (const f of Array.from(e.target.files || [])) await addFile(f);
                e.target.value = "";
              }}
            />
            <input
              id="followup-input"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  sendFollowUp();
                }
              }}
              placeholder={attachedFiles.length ? `Follow-up about the ${attachedFiles.length} attached…` : "Ask a follow-up in this conversation…"}
              className="h-8 min-w-0 flex-1 rounded-md border border-input/50 bg-background/40 px-2 text-xs outline-none focus:border-ring/60"
              aria-label="Follow-up question"
            />
            <Button size="sm" variant="outline" className="h-8 px-2 text-[10px]" disabled={isScreenshotLoading} onClick={() => void captureFullScreen()} title="Add the whole screen to this follow-up">
              + Screen
            </Button>
            <Button size="sm" variant="outline" className="h-8 px-2 text-[10px]" disabled={isScreenshotLoading} onClick={() => void captureScreenshot()} title="Add an area to this follow-up (⌘⇧S)">
              + Area
            </Button>
            <Button size="sm" variant="outline" className="h-8 px-2 text-[10px]" onClick={() => followUpFileRef.current?.click()} title="Attach images or files to this follow-up">
              <PaperclipIcon className="h-3 w-3" />
            </Button>
            <Button id="followup-send" size="sm" className="h-8 px-3 text-[10px]" disabled={isLoading || (!followUp.trim() && !attachedFiles.length)} onClick={sendFollowUp}>
              Send{attachedFiles.length ? ` (${attachedFiles.length})` : ""}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
