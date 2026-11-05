// Completion-related types
export interface AttachedFile {
  id: string;
  name: string;
  type: string;
  base64: string;
  size: number;
  /** Extracted text for parsed documents (txt/md/csv/code). Images leave this unset. */
  text?: string;
  label?: string; // e.g. Before / After / Trace (Debug mode)
  note?: string; // the user's message about this specific attachment
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  attachedFiles?: AttachedFile[];
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface CompletionState {
  input: string;
  response: string;
  /** The question the current response answers (typed or transcribed) */
  lastQuestion: string;
  isLoading: boolean;
  error: string | null;
  attachedFiles: AttachedFile[];
  currentConversationId: string | null;
  conversationHistory: ChatMessage[];
}

// Provider-related types
export interface Message {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
        source?: any;
        inline_data?: any;
      }>;
}
