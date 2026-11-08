import { requestScreenPermissionOnce } from "@/lib/screen-permission-once";
import { useState, useCallback, useRef, useEffect } from "react";
import { useWindowResize } from "./useWindow";
import { useGlobalShortcuts } from "@/hooks";
import { MAX_FILES } from "@/config";
import { useApp } from "@/contexts";
import { getModeDef, type ModeKey, FAST_TEXT_PROVIDER } from "@/config/modes";
import { downscalePng } from "@/lib/image-resize";
import { addQA } from "@/lib/storage/qa-history";
import { attachmentsForHistory, cacheConversation, getCachedConversation } from "@/lib/conversation-cache";
import {
  fetchAIResponse,
  saveConversation,
  getConversationById,
  generateConversationTitle,
  shouldUsePluelyAPI,
  MESSAGE_ID_OFFSET,
  generateConversationId,
  generateMessageId,
  generateRequestId,
  getResponseSettings,
} from "@/lib";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Types for completion
interface AttachedFile {
  id: string;
  name: string;
  type: string;
  base64: string;
  size: number;
  text?: string;
  label?: string; // e.g. Before / After / Trace (Debug mode)
  note?: string; // the user's message about this specific attachment
}

// The screenshot button always lets the user drag-select the area to capture
// (full-screen grabs are used only by Solve screen).
const SCREENSHOT_FULL_SCREEN = false;

// Documents we can parse to text (no image/vision needed).
const isTextDocument = (file: File): boolean => {
  if (file.type.startsWith("text/")) return true;
  return /\.(txt|md|markdown|csv|tsv|json|ya?ml|log|py|js|ts|tsx|jsx|java|go|rs|rb|php|c|cpp|h|cs|sql|sh|html?|css)$/i.test(
    file.name
  );
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  attachedFiles?: AttachedFile[];
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface CompletionState {
  input: string;
  response: string;
  lastQuestion: string;
  /** Images sent with the last question (shown next to "Asked:"). */
  lastImages: string[];
  isLoading: boolean;
  error: string | null;
  attachedFiles: AttachedFile[];
  currentConversationId: string | null;
  conversationHistory: ChatMessage[];
}

export const useCompletion = () => {
  const {
    selectedAIProvider: storedAIProvider,
    allAiProviders,
    systemPrompt: storedSystemPrompt,
    screenshotConfiguration,
    setScreenshotConfiguration,
    currentMode,
  } = useApp();

  // The selected interview mode is the source of truth for routing: every
  // question uses that mode's model, keys and prompt at send time, so an async
  // reload of saved settings can never send it to the previous mode's model.
  const modeDef = getModeDef(currentMode as ModeKey);
  const modeProvider = modeDef
    ? { provider: modeDef.aiProvider, variables: modeDef.aiVariables }
    : storedAIProvider;
  const modeSystemPrompt = modeDef?.systemPrompt ?? storedSystemPrompt;
  const selectedAIProvider = modeProvider;
  const systemPrompt = modeSystemPrompt;
  const globalShortcuts = useGlobalShortcuts();

  const [state, setState] = useState<CompletionState>({
    input: "",
    response: "",
    lastQuestion: "",
    lastImages: [],
    isLoading: false,
    error: null,
    attachedFiles: [],
    currentConversationId: null,
    conversationHistory: [],
  });
  const [micOpen, setMicOpen] = useState(false);
  const [enableVAD, setEnableVAD] = useState(false);
  const [messageHistoryOpen, setMessageHistoryOpen] = useState(false);
  const [isFilesPopoverOpen, setIsFilesPopoverOpen] = useState(false);
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);
  const [keepEngaged, setKeepEngaged] = useState(false);
  // An earlier conversation reopened from History: show its thread until closed.
  const [threadOpen, setThreadOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isProcessingScreenshotRef = useRef(false);
  const screenshotConfigRef = useRef(screenshotConfiguration);
  const hasCheckedPermissionRef = useRef(false);
  const screenshotInitiatedByThisContext = useRef(false);

  const { resizeWindow } = useWindowResize();

  useEffect(() => {
    screenshotConfigRef.current = screenshotConfiguration;
  }, [screenshotConfiguration]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const cancelCountRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  const setInput = useCallback((value: string) => {
    setState((prev) => ({ ...prev, input: value }));
  }, []);

  const setResponse = useCallback((value: string) => {
    setState((prev) => ({ ...prev, response: value }));
  }, []);

  const addFile = useCallback(async (file: File, label?: string) => {
    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const parseAsText = isPdf || isTextDocument(file);
      const isImage = !parseAsText && file.type.startsWith("image/");
      const raw = parseAsText ? "" : await fileToBase64(file);
      // Images are sent as PNG ≤1568px (fast to send, still readable).
      const base64 = isImage ? await downscalePng(raw, undefined, file.type) : raw;
      const text = isPdf
        ? await (await import("@/lib/pdf-text")).pdfToText(file)
        : parseAsText
          ? await file.text()
          : undefined;
      const attachedFile: AttachedFile = {
        // Unique even when several files are added in the same millisecond.
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        label,
        type: isImage ? "image/png" : file.type || (isPdf ? "application/pdf" : parseAsText ? "text/plain" : ""),
        base64,
        size: isImage ? Math.round((base64.length * 3) / 4) : file.size,
        text,
      };

      setState((prev) => ({
        ...prev,
        attachedFiles: [...prev.attachedFiles, attachedFile],
      }));
    } catch (error) {
      console.error("Failed to process file:", error);
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((f) => f.id !== fileId),
    }));
  }, []);

  const setFileNote = useCallback((fileId: string, note: string) => {
    setState((prev) => ({
      ...prev,
      attachedFiles: prev.attachedFiles.map((f) => (f.id === fileId ? { ...f, note } : f)),
    }));
  }, []);

  const clearFiles = useCallback(() => {
    setState((prev) => ({ ...prev, attachedFiles: [] }));
  }, []);

  const submit = useCallback(
    async (speechText?: string, opts?: { mode?: string; fast?: boolean }) => {
      // Attachments can be sent without a message; use a sensible default.
      const typed = speechText || state.input;
      const input = typed.trim()
        ? typed
        : state.attachedFiles.length
          ? (opts?.mode ?? currentMode) === "debug"
            ? "Debug this using the attached evidence."
            : "Answer using the attached screenshots and documents."
          : typed;
      const submitStartedAt = Date.now();
      // A queued job can ask for its own mode without changing the UI mode.
      const overrideDef = opts?.mode ? getModeDef(opts.mode as ModeKey) : undefined;
      let selectedAIProvider = overrideDef
        ? { provider: overrideDef.aiProvider, variables: overrideDef.aiVariables }
        : modeProvider;
      // Spoken questions (Auto): answer with fast Groq even in Code/Debug, so the
      // answer starts in ~1-3s instead of ~6-14s. Same mode prompt and layout.
      if (opts?.fast && selectedAIProvider?.provider === "claude-cli" && FAST_TEXT_PROVIDER.variables.api_key) {
        selectedAIProvider = { provider: FAST_TEXT_PROVIDER.provider, variables: FAST_TEXT_PROVIDER.variables };
      }
      const systemPrompt = overrideDef?.systemPrompt ?? modeSystemPrompt;

      if (!input.trim()) {
        return;
      }

      if (speechText) {
        setState((prev) => ({
          ...prev,
          input: speechText,
        }));
      }

      // The attachments go with this question: empty the tray right away.
      if (state.attachedFiles.length) setState((prev) => ({ ...prev, attachedFiles: [] }));

      // Generate unique request ID
      const requestId = generateRequestId();
      currentRequestIdRef.current = requestId;

      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        // Prepare message history for the AI
        // Always send history oldest → newest (never rely on display order).
        const messageHistory = [...state.conversationHistory]
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        // Handle image attachments + parsed documents
        const imagesBase64: string[] = [];
        const docSections: string[] = [];
        if (state.attachedFiles.length > 0) {
          const imageLabels: string[] = [];
          state.attachedFiles.forEach((file) => {
            if (file.type.startsWith("image/")) {
              imagesBase64.push(file.base64);
              const kind = file.label ? `${file.label.toUpperCase()} screenshot` : "screenshot";
              imageLabels.push(file.note?.trim() ? `${kind} — user's note: "${file.note.trim()}"` : kind);
            } else if (file.text) {
              const head = file.label ? `${file.label} (${file.name})` : `Document: ${file.name}`;
              const note = file.note?.trim() ? `\nUser's note about this document: ${file.note.trim()}` : "";
              docSections.push(`--- ${head} ---${note}\n${file.text}`);
            }
          });
          // Tell the model which image is which (e.g. Before vs After).
          if (imageLabels.some((l) => l !== "screenshot")) { // labels or notes present
            docSections.unshift(
              "Attached images, in order: " +
                imageLabels.map((l, i) => `image ${i + 1} = ${l}`).join("; ") + "."
            );
          }
        }
        // Prepend parsed document text to the question so the model can use it.
        const userMessageWithDocs = docSections.length
          ? `${docSections.join("\n\n")}\n\n---\n\n${input}`
          : input;

        let fullResponse = "";

        const usePluelyAPI = await shouldUsePluelyAPI();
        // Check if AI provider is configured
        if (!selectedAIProvider.provider && !usePluelyAPI) {
          setState((prev) => ({
            ...prev,
            error: "Please select an AI provider in settings",
          }));
          return;
        }

        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );
        if (!provider && !usePluelyAPI) {
          setState((prev) => ({
            ...prev,
            error: "Invalid provider selected",
          }));
          return;
        }

        // Clear previous response and set loading state
        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
          response: "",
          lastQuestion: input,
          lastImages: state.attachedFiles.filter((f) => f.type.startsWith("image/")).map((f) => f.base64),
        }));

        try {
          // Use the fetchAIResponse function with signal
          for await (const chunk of fetchAIResponse({
            provider: usePluelyAPI ? undefined : provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: systemPrompt || undefined,
            history: messageHistory,
            userMessage: userMessageWithDocs,
            imagesBase64,
            signal,
            // Debug keeps top quality: screenshots go to Claude Opus (lean CLI start),
            // not the fast Groq vision path used by the other modes.
            noFastVision: (opts?.mode ?? currentMode) === "debug",
          } as any)) {
            // Only update if this is still the current request
            if (currentRequestIdRef.current !== requestId) {
              return; // Request was superseded, stop processing
            }

            // Check if request was aborted
            if (signal.aborted) {
              return; // Request was cancelled, stop processing
            }

            fullResponse += chunk;
            setState((prev) => ({
              ...prev,
              response: prev.response + chunk,
            }));
          }
        } catch (e: any) {
          // Only show error if this is still the current request and not aborted
          if (currentRequestIdRef.current === requestId && !signal.aborted) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: e.message || "An error occurred",
            }));
          }
          return;
        }

        // Only proceed if this is still the current request
        if (currentRequestIdRef.current !== requestId || signal.aborted) {
          return;
        }

        setState((prev) => ({ ...prev, isLoading: false }));

        // Focus input after AI response is complete
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);

        // Save the conversation after successful completion
        if (fullResponse) {
          const conversationId = await saveCurrentConversation(
            input,
            fullResponse,
            state.attachedFiles
          );
          if (!/^\s*Claude CLI error:/.test(fullResponse)) {
            addQA({
              conversationId,
              question: input,
              answer: fullResponse,
              mode: opts?.mode ?? currentMode,
              at: Date.now(),
              durationMs: Date.now() - submitStartedAt,
              hadImage: state.attachedFiles.some((f) => f.type.startsWith("image/")),
              hadDocs: state.attachedFiles.some((f) => !f.type.startsWith("image/")),
            });
          }

          // Clear input and attached files after saving
          setState((prev) => ({
            ...prev,
            input: "",
            attachedFiles: [],
          }));
        }
      } catch (error) {
        // Only show error if not aborted
        if (!signal?.aborted && currentRequestIdRef.current === requestId) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "An error occurred",
            isLoading: false,
          }));
        }
      }
    },
    [
      state.input,
      state.attachedFiles,
      currentMode,
      allAiProviders,
      state.conversationHistory,
    ]
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    currentRequestIdRef.current = null;
    cancelCountRef.current += 1; // lets the answer queue tell "cancelled" from "done"
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  const reset = useCallback(() => {
    // Don't reset if keep engaged mode is active
    if (keepEngaged) {
      return;
    }
    cancel();
    setThreadOpen(false);
    setState((prev) => ({
      ...prev,
      input: "",
      response: "",
      error: null,
      attachedFiles: [],
    }));
  }, [cancel, keepEngaged]);

  // Helper function to convert file to base64
  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string)?.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }, []);

  // Note: saveConversation, getConversationById, and generateConversationTitle
  // are now imported from lib/database/chat-history.action.ts

  const loadConversation = useCallback((conversation: ChatConversation) => {
    setState((prev) => ({
      ...prev,
      currentConversationId: conversation.id,
      conversationHistory: conversation.messages,
      input: "",
      response: "",
      error: null,
      isLoading: false,
    }));
  }, []);

  const startNewConversation = useCallback(() => {
    setThreadOpen(false);
    setState((prev) => ({
      ...prev,
      currentConversationId: null,
      conversationHistory: [],
      input: "",
      response: "",
      error: null,
      isLoading: false,
      attachedFiles: [],
    }));
  }, []);

  const saveCurrentConversation = useCallback(
    async (
      userMessage: string,
      assistantResponse: string,
      attachedFiles: AttachedFile[]
    ): Promise<string | undefined> => {
      // Validate inputs
      if (!userMessage || !assistantResponse) {
        console.error("Cannot save conversation: missing message content");
        return;
      }

      const conversationId =
        state.currentConversationId || generateConversationId("chat");
      const timestamp = Date.now();

      const userMsg: ChatMessage = {
        id: generateMessageId("user", timestamp),
        role: "user",
        content: userMessage,
        timestamp,
        // Small thumbnails of the screenshots (and document names) sent with it.
        attachedFiles: await attachmentsForHistory(attachedFiles),
      };

      const assistantMsg: ChatMessage = {
        id: generateMessageId("assistant", timestamp + MESSAGE_ID_OFFSET),
        role: "assistant",
        content: assistantResponse,
        timestamp: timestamp + MESSAGE_ID_OFFSET,
      };

      const newMessages = [...state.conversationHistory, userMsg, assistantMsg];

      // Get existing conversation if updating
      let existingConversation = null;
      if (state.currentConversationId) {
        try {
          existingConversation = await getConversationById(
            state.currentConversationId
          );
        } catch (error) {
          console.error("Failed to get existing conversation:", error);
        }
      }

      const title =
        state.conversationHistory.length === 0
          ? generateConversationTitle(userMessage)
          : existingConversation?.title ||
            generateConversationTitle(userMessage);

      const conversation: ChatConversation = {
        id: conversationId,
        title,
        messages: newMessages,
        createdAt: existingConversation?.createdAt || timestamp,
        updatedAt: timestamp,
      };

      cacheConversation(conversation);
      try {
        await saveConversation(conversation);

        setState((prev) => ({
          ...prev,
          currentConversationId: conversationId,
          conversationHistory: newMessages,
        }));
        return conversationId;
      } catch (error) {
        // The local copy is saved; keep the thread going so follow-ups have context.
        console.error("Failed to save conversation:", error);
        setState((prev) => ({
          ...prev,
          currentConversationId: conversationId,
          conversationHistory: newMessages,
        }));
        return conversationId;
      }
    },
    [state.currentConversationId, state.conversationHistory]
  );

  // Listen for conversation events from the main ChatHistory component
  useEffect(() => {
    const handleConversationSelected = async (event: any) => {
      console.log(event, "event");
      // Only the conversation ID is passed through the event
      const { id } = event.detail;
      console.log(id, "id");
      if (!id || typeof id !== "string") {
        console.error("No conversation ID provided");
        setState((prev) => ({
          ...prev,
          error: "Invalid conversation selected",
        }));
        return;
      }
      console.log(id, "id");
      try {
        // Fetch the full conversation from SQLite
        const conversation = await getConversationById(id);

        if (conversation) {
          loadConversation(conversation);
        } else {
          console.error(`Conversation ${id} not found in database`);
          setState((prev) => ({
            ...prev,
            error: "Conversation not found. It may have been deleted.",
          }));
        }
      } catch (error) {
        console.error("Failed to load conversation:", error);
        setState((prev) => ({
          ...prev,
          error: "Failed to load conversation. Please try again.",
        }));
      }
    };

    const handleNewConversation = () => {
      startNewConversation();
    };

    const handleConversationDeleted = (event: any) => {
      const deletedId = event.detail;
      // If the currently active conversation was deleted, start a new one
      if (state.currentConversationId === deletedId) {
        startNewConversation();
      }
    };

    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key === "pluely-conversation-selected" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          const { id } = data;
          if (id && typeof id === "string") {
            const conversation = await getConversationById(id);
            if (conversation) {
              loadConversation(conversation);
            }
          }
        } catch (error) {
          console.error("Failed to parse conversation selection:", error);
        }
      }
    };

    window.addEventListener("conversationSelected", handleConversationSelected);
    window.addEventListener("newConversation", handleNewConversation);
    window.addEventListener("conversationDeleted", handleConversationDeleted);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(
        "conversationSelected",
        handleConversationSelected
      );
      window.removeEventListener("newConversation", handleNewConversation);
      window.removeEventListener(
        "conversationDeleted",
        handleConversationDeleted
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadConversation, startNewConversation, state.currentConversationId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_FILES = 10;

    files.forEach((file) => {
      // Accept images (for vision models) and parsable text documents.
      if (
        (file.type.startsWith("image/") || isTextDocument(file) || file.type === "application/pdf" || /\.pdf$/i.test(file.name)) &&
        state.attachedFiles.length < MAX_FILES
      ) {
        addFile(file);
      }
    });

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleScreenshotSubmit = useCallback(
    async (rawBase64: string, prompt?: string) => {
      const base64 = await downscalePng(rawBase64);
      if (state.attachedFiles.length >= MAX_FILES) {
        setState((prev) => ({
          ...prev,
          error: `You can only upload ${MAX_FILES} files`,
        }));
        return;
      }

      try {
        if (prompt) {
          // Auto mode: Submit directly to AI with screenshot
          const attachedFile: AttachedFile = {
            id: Date.now().toString(),
            name: `screenshot_${Date.now()}.png`,
            type: "image/png",
            base64: base64,
            size: base64.length,
          };

          // Generate unique request ID
          const requestId = generateRequestId();
          currentRequestIdRef.current = requestId;

          // Cancel any existing request
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }

          abortControllerRef.current = new AbortController();
          const signal = abortControllerRef.current.signal;

          try {
            // Prepare message history for the AI
            // Always send history oldest → newest (never rely on display order).
        const messageHistory = [...state.conversationHistory]
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((msg) => ({
              role: msg.role,
              content: msg.content,
            }));

            let fullResponse = "";

            const usePluelyAPI = await shouldUsePluelyAPI();
            // Check if AI provider is configured
            if (!selectedAIProvider.provider && !usePluelyAPI) {
              setState((prev) => ({
                ...prev,
                error: "Please select an AI provider in settings",
              }));
              return;
            }

            const provider = allAiProviders.find(
              (p) => p.id === selectedAIProvider.provider
            );
            if (!provider && !usePluelyAPI) {
              setState((prev) => ({
                ...prev,
                error: "Invalid provider selected",
              }));
              return;
            }

            // Clear previous response and set loading state
            setState((prev) => ({
              ...prev,
              input: prompt,
              isLoading: true,
              error: null,
              response: "",
            }));

            // Use the fetchAIResponse function with image and signal
            for await (const chunk of fetchAIResponse({
              provider: usePluelyAPI ? undefined : provider,
              selectedProvider: selectedAIProvider,
              systemPrompt: systemPrompt || undefined,
              history: messageHistory,
              userMessage: prompt,
              imagesBase64: [base64],
              signal,
            })) {
              // Only update if this is still the current request
              if (currentRequestIdRef.current !== requestId || signal.aborted) {
                return; // Request was superseded or cancelled
              }

              fullResponse += chunk;
              setState((prev) => ({
                ...prev,
                response: prev.response + chunk,
              }));
            }

            // Only proceed if this is still the current request
            if (currentRequestIdRef.current !== requestId || signal.aborted) {
              return;
            }

            setState((prev) => ({ ...prev, isLoading: false }));

            // Focus input after screenshot AI response is complete
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);

            // Save the conversation after successful completion
            if (fullResponse) {
              const conversationId = await saveCurrentConversation(prompt, fullResponse, [
                attachedFile,
              ]);
              addQA({ conversationId, question: prompt, answer: fullResponse, mode: currentMode, at: Date.now(), hadImage: true });
              // Clear input after saving
              setState((prev) => ({
                ...prev,
                input: "",
              }));
            }
          } catch (e: any) {
            // Only show error if this is still the current request and not aborted
            if (currentRequestIdRef.current === requestId && !signal.aborted) {
              setState((prev) => ({
                ...prev,
                error: e.message || "An error occurred",
              }));
            }
          } finally {
            // Only update loading state if this is still the current request
            if (currentRequestIdRef.current === requestId && !signal.aborted) {
              setState((prev) => ({ ...prev, isLoading: false }));
            }
          }
        } else {
          // Manual mode: Add to attached files
          const attachedFile: AttachedFile = {
            id: Date.now().toString(),
            name: `screenshot_${Date.now()}.png`,
            type: "image/png",
            base64: base64,
            size: base64.length,
          };

          setState((prev) => ({
            ...prev,
            attachedFiles: [...prev.attachedFiles, attachedFile],
          }));
        }
      } catch (error) {
        console.error("Failed to process screenshot:", error);
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "An error occurred processing screenshot",
          isLoading: false,
        }));
      }
    },
    [
      state.attachedFiles.length,
      state.conversationHistory,
      currentMode,
      allAiProviders,
      saveCurrentConversation,
      inputRef,
    ]
  );

  const onRemoveAllFiles = () => {
    clearFiles();
    setIsFilesPopoverOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) return; // ⌘↵ = screenshot shortcut, not send
      if (!state.isLoading && (state.input.trim() || state.attachedFiles.length)) {
        submit();
      }
    }
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      // Check if clipboard contains images
      const items = e.clipboardData?.items;
      if (!items) return;

      const hasImages = Array.from(items).some((item) =>
        item.type.startsWith("image/")
      );

      // A long paste (stack trace, logs, a file's contents) becomes an
      // attachment instead of flooding the question bar.
      const pastedText = e.clipboardData?.getData("text") ?? "";
      if (!hasImages && (pastedText.length > 600 || pastedText.split("\n").length > 12)) {
        e.preventDefault();
        const looksLikeTrace = /traceback|exception|error|at .+\(.+:\d+\)|^\s+at /im.test(pastedText);
        await addFile(
          new File([pastedText], `${looksLikeTrace ? "trace" : "pasted"}-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}.txt`, {
            type: "text/plain",
          })
        );
        return;
      }

      // If we have images, prevent default text pasting and process images
      if (hasImages) {
        e.preventDefault();

        const processedFiles: File[] = [];

        Array.from(items).forEach((item) => {
          if (
            item.type.startsWith("image/") &&
            state.attachedFiles.length + processedFiles.length < MAX_FILES
          ) {
            const file = item.getAsFile();
            if (file) {
              processedFiles.push(file);
            }
          }
        });

        // Process all files
        await Promise.all(processedFiles.map((file) => addFile(file)));
      }
    },
    [state.attachedFiles.length, addFile]
  );

  // Reopen any earlier conversation (History → Continue) and keep adding to it.
  const continueConversation = useCallback(
    async (id: string | undefined, fallback?: { question: string; answer: string; at: number }) => {
      let conv: ChatConversation | null = null;
      if (id) {
        try {
          conv = await getConversationById(id);
        } catch {
          /* fall back to the local copy */
        }
        if (!conv || !conv.messages?.length) conv = getCachedConversation(id);
      }
      // Older answers saved before conversations were linked: rebuild a one-question thread.
      if (!conv && fallback) {
        const t = fallback.at;
        conv = {
          id: id || generateConversationId("chat"),
          title: fallback.question.slice(0, 60),
          createdAt: t,
          updatedAt: t,
          messages: [
            { id: generateMessageId("user", t), role: "user", content: fallback.question, timestamp: t },
            { id: generateMessageId("assistant", t + MESSAGE_ID_OFFSET), role: "assistant", content: fallback.answer, timestamp: t + MESSAGE_ID_OFFSET },
          ],
        };
        cacheConversation(conv);
      }
      if (!conv) {
        setState((prev) => ({ ...prev, error: "That conversation is no longer saved." }));
        return false;
      }
      loadConversation(conv);
      setState((prev) => ({ ...prev, lastQuestion: "", lastImages: [] }));
      setThreadOpen(true);
      setTimeout(() => document.getElementById("followup-input")?.focus(), 150);
      return true;
    },
    [loadConversation]
  );

  const isPopoverOpen =
    threadOpen ||
    state.isLoading ||
    state.response !== "" ||
    state.error !== null ||
    keepEngaged;

  useEffect(() => {
    resizeWindow(
      isPopoverOpen || micOpen || messageHistoryOpen || isFilesPopoverOpen
    );
  }, [
    isPopoverOpen,
    micOpen,
    messageHistoryOpen,
    resizeWindow,
    isFilesPopoverOpen,
  ]);

  // Auto scroll to bottom when response updates
  useEffect(() => {
    const responseSettings = getResponseSettings();
    if (
      !keepEngaged &&
      state.response &&
      scrollAreaRef.current &&
      responseSettings.autoScroll
    ) {
      const scrollElement = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollElement) {
        scrollElement.scrollTo({
          top: scrollElement.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [state.response, keepEngaged]);

  // Keyboard arrow key support for scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPopoverOpen) return;

      const activeScrollRef = scrollAreaRef.current || scrollAreaRef.current;
      const scrollElement = activeScrollRef?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement;

      if (!scrollElement) return;

      const scrollAmount = 100; // pixels to scroll

      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollElement.scrollBy({ top: scrollAmount, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollElement.scrollBy({ top: -scrollAmount, behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPopoverOpen, scrollAreaRef]);

  // Keyboard shortcut for toggling keep engaged mode (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleToggleShortcut = (e: KeyboardEvent) => {
      // Only trigger when popover is open
      if (!isPopoverOpen) return;

      // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setKeepEngaged((prev) => !prev);
        // Focus the input after toggle (with delay to ensure DOM is ready)
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    };

    window.addEventListener("keydown", handleToggleShortcut);
    return () => window.removeEventListener("keydown", handleToggleShortcut);
  }, [isPopoverOpen]);

  const captureScreenshot = useCallback(async () => {
    if (!handleScreenshotSubmit) return;

    const config = screenshotConfigRef.current;
    screenshotInitiatedByThisContext.current = true;
    setIsScreenshotLoading(true);

    try {
      // Check screen recording permission on macOS
      const platform = navigator.platform.toLowerCase();
      if (platform.includes("mac") && !hasCheckedPermissionRef.current) {
        const {
          checkScreenRecordingPermission,
          requestScreenRecordingPermission,
        } = await import("tauri-plugin-macos-permissions-api");

        const hasPermission = await checkScreenRecordingPermission();

        if (!hasPermission) {
          // Ask macOS once per session (not on every screenshot), then re-check.
          if (await requestScreenPermissionOnce(requestScreenRecordingPermission)) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }

          const hasPermissionNow = await checkScreenRecordingPermission();

          if (!hasPermissionNow) {
            setState((prev) => ({
              ...prev,
              error:
                "Screen Recording is off for Beast. System Settings → Privacy & Security → Screen & System Audio Recording → switch Beast on, then Quit & Reopen Beast.",
            }));
            setIsScreenshotLoading(false);
            screenshotInitiatedByThisContext.current = false;
            return;
          }
        }
        hasCheckedPermissionRef.current = true;
      }

      if (SCREENSHOT_FULL_SCREEN && config.enabled) {
        const base64 = await invoke("capture_to_base64");

        if (config.mode === "auto") {
          // Auto mode: Submit directly to AI with the configured prompt
          await handleScreenshotSubmit(base64 as string, config.autoPrompt);
        } else if (config.mode === "manual") {
          // Manual mode: Add to attached files without prompt
          await handleScreenshotSubmit(base64 as string);
        }
        screenshotInitiatedByThisContext.current = false;
      } else {
        // Selection Mode: Open overlay to select an area
        isProcessingScreenshotRef.current = false;
        await invoke("start_screen_capture");
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Failed to capture screenshot. Please try again.",
      }));
      isProcessingScreenshotRef.current = false;
      screenshotInitiatedByThisContext.current = false;
    } finally {
      if (SCREENSHOT_FULL_SCREEN && config.enabled) {
        setIsScreenshotLoading(false);
      }
    }
  }, [handleScreenshotSubmit]);

  useEffect(() => {
    let unlisten: any;

    const setupListener = async () => {
      unlisten = await listen("captured-selection", async (event: any) => {
        if (!screenshotInitiatedByThisContext.current) {
          return;
        }

        if (isProcessingScreenshotRef.current) {
          return;
        }

        isProcessingScreenshotRef.current = true;
        const base64 = event.payload;
        const config = screenshotConfigRef.current;

        try {
          // Always attach (so notes, mode routing and the queue apply). With ⌘↵
          // it is then sent straight away, together with anything typed.
          void config;
          await handleScreenshotSubmit(base64 as string);
          if (autoSendRef.current) {
            autoSendRef.current = false;
            setAutoSendTick((t) => t + 1);
          }
        } catch (error) {
          console.error("Error processing selection:", error);
        } finally {
          setIsScreenshotLoading(false);
          screenshotInitiatedByThisContext.current = false;
          setTimeout(() => {
            isProcessingScreenshotRef.current = false;
          }, 100);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleScreenshotSubmit]);

  // ⌘↵ / Ctrl+Enter: capture an area, then send it right away and show the answer.
  const autoSendRef = useRef(false);
  const [autoSendTick, setAutoSendTick] = useState(0);
  const captureRef = useRef<() => Promise<void>>(async () => {});
  const captureAndSendRef = useRef<() => Promise<void>>(async () => {});
  const captureFullScreenRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    listen<{ action: string }>("custom-shortcut-triggered", (e) => {
      if (e.payload?.action === "screenshot_add") {
        void captureFullScreenRef.current();
        return;
      }
      if (e.payload?.action !== "screenshot_enter") return;
      void captureAndSendRef.current();
    }).then((u) => (cancelled ? u() : (off = u)));
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);
  // 💻 / ⌘↵: grab the whole screen at once (no selection step), attach it and
  // send it with anything typed; the answer shows the screenshot that was sent.
  const screenshotSubmitRef = useRef<(b64: string) => Promise<void>>(async () => {});
  // "+ Screen": add the whole screen to the tray without sending (for questions
  // spread over several screens; send them all together afterwards).
  const captureFullScreen = useCallback(async () => {
    setIsScreenshotLoading(true);
    try {
      const base64 = await invoke<string>("capture_to_base64");
      await screenshotSubmitRef.current(base64);
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: `Screenshot failed: ${e instanceof Error ? e.message : String(e)}. Allow Screen & System Audio Recording for Beast.`,
      }));
    } finally {
      setIsScreenshotLoading(false);
    }
  }, []);
  const captureAndSend = useCallback(async () => {
    setIsScreenshotLoading(true);
    try {
      const base64 = await invoke<string>("capture_to_base64");
      await screenshotSubmitRef.current(base64);
      setAutoSendTick((t) => t + 1);
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: `Screenshot failed: ${e instanceof Error ? e.message : String(e)}. Allow Screen & System Audio Recording for Beast.`,
      }));
    } finally {
      setIsScreenshotLoading(false);
    }
  }, []);
  useEffect(() => {
    if (autoSendTick > 0) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendTick]);

  useEffect(() => {
    const unlisten = listen("capture-closed", () => {
      autoSendRef.current = false;
      setIsScreenshotLoading(false);
      isProcessingScreenshotRef.current = false;
      screenshotInitiatedByThisContext.current = false;
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const toggleRecording = useCallback(() => {
    setEnableVAD(!enableVAD);
    setMicOpen(!micOpen);
  }, [enableVAD, micOpen]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      currentRequestIdRef.current = null;
    };
  }, []);

  // register callbacks for global shortcuts
  useEffect(() => {
    globalShortcuts.registerInputRef(inputRef.current);
    captureRef.current = captureScreenshot;
    captureAndSendRef.current = captureAndSend;
    captureFullScreenRef.current = captureFullScreen;
    screenshotSubmitRef.current = (b64: string) => handleScreenshotSubmit(b64);
    globalShortcuts.registerScreenshotCallback(captureScreenshot);
  }, [
    globalShortcuts.registerAudioCallback,
    globalShortcuts.registerInputRef,
    globalShortcuts.registerScreenshotCallback,
    toggleRecording,
    captureScreenshot,
    inputRef,
  ]);

  return {
    cancelCount: cancelCountRef,
    lastQuestion: state.lastQuestion,
    lastImages: state.lastImages,
    input: state.input,
    setInput,
    response: state.response,
    setResponse,
    isLoading: state.isLoading,
    error: state.error,
    attachedFiles: state.attachedFiles,
    addFile,
    removeFile,
    clearFiles,
    setFileNote,
    submit,
    cancel,
    reset,
    setState,
    enableVAD,
    setEnableVAD,
    micOpen,
    setMicOpen,
    currentConversationId: state.currentConversationId,
    conversationHistory: state.conversationHistory,
    loadConversation,
    startNewConversation,
    continueConversation,
    closeThread: () => setThreadOpen(false),
    messageHistoryOpen,
    setMessageHistoryOpen,
    screenshotConfiguration,
    setScreenshotConfiguration,
    handleScreenshotSubmit,
    handleFileSelect,
    handleKeyPress,
    handlePaste,
    isPopoverOpen,
    scrollAreaRef,
    resizeWindow,
    isFilesPopoverOpen,
    setIsFilesPopoverOpen,
    onRemoveAllFiles,
    inputRef,
    captureScreenshot,
    captureAndSend,
    captureFullScreen,
    isScreenshotLoading,
    keepEngaged,
    setKeepEngaged,
  };
};
