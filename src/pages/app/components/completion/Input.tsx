import { Loader2, XIcon } from "lucide-react";
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
}: UseCompletionReturn & { isHidden: boolean }) => {
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
        >
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <div className="flex flex-row gap-1 items-center">
              <h3 className="font-semibold text-xs select-none">
                {keepEngaged ? "Conversation Mode" : "AI Response"}
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
              <CopyButton content={response} />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (isLoading) {
                    cancel();
                  } else if (keepEngaged) {
                    // When keepEngaged is on, close everything and start new conversation
                    setKeepEngaged(false);
                    startNewConversation();
                  } else {
                    reset();
                  }
                }}
                className="cursor-pointer"
                title={
                  isLoading
                    ? "Cancel loading"
                    : keepEngaged
                    ? "Close and start new conversation"
                    : "Clear conversation"
                }
              >
                <XIcon />
              </Button>
            </div>
          </div>

          <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-7rem)]">
            <div className="p-4">
              {error && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                  <strong>Error:</strong> {error}
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
        </PopoverContent>
      </Popover>
    </div>
  );
};
