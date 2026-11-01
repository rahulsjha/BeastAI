// Interview modes: each mode fully defines which model answers, which speech
// provider transcribes, and the system prompt — so the user only picks a mode
// and starts. No provider selection, no key entry.
//
// Credentials come from Vite env vars (set them in a gitignored `.env.local`):
//   VITE_GROQ_API_KEY=...      (Groq key for interview modes)
//   VITE_CF_API_KEY=...        (Cloudflare Workers AI token for voice)
//   VITE_CF_ACCOUNT_ID=...     (optional; defaults to the configured account)
// They are never committed; the repo builds without them (calls just fail until set).
const env = (import.meta as any).env || {};
const SECRETS = {
  GROQ_API_KEY: env.VITE_GROQ_API_KEY || "",
  CF_ACCOUNT_ID: env.VITE_CF_ACCOUNT_ID || "d27053e91cdcc6f2e55d2157e09cf132",
  CF_API_KEY: env.VITE_CF_API_KEY || "",
};

export type ModeKey = "system_design" | "coding" | "conceptual" | "debug";

export interface ModeDef {
  key: ModeKey;
  label: string;
  short: string;
  /** AI provider id (from AI_PROVIDERS) this mode routes to. */
  aiProvider: string;
  /** Model passed to that provider. */
  model: string;
  /** Variables pre-filled for the AI provider (keys, model). */
  aiVariables: Record<string, string>;
  /** STT provider id + its variables (voice). */
  sttProvider: string;
  sttVariables: Record<string, string>;
  systemPrompt: string;
}

// Variable keys are lowercase: the app extracts {{API_KEY}} -> "api_key" and
// uppercases again at substitution time.
const CF_STT = {
  sttProvider: "cloudflare-whisper",
  sttVariables: { api_key: SECRETS.CF_API_KEY },
};

const GROQ = {
  aiProvider: "groq-interview",
  model: "openai/gpt-oss-120b",
  aiVariables: { api_key: SECRETS.GROQ_API_KEY, model: "openai/gpt-oss-120b" },
};

// Coding/debug route to the local Claude CLI (Opus 5.5, high effort — set in Rust).
const OPUS = {
  aiProvider: "claude-cli",
  model: "opus",
  aiVariables: { model: "opus" },
};

export const MODES: Record<ModeKey, ModeDef> = {
  system_design: {
    key: "system_design",
    label: "System Design",
    short: "Design",
    ...GROQ,
    ...CF_STT,
    systemPrompt:
      "You are an interview assistant for SYSTEM DESIGN / full-stack / AI-design rounds. " +
      "Answer interview-ready and concise, in this exact structure:\n" +
      "**Definition:** one line.\n**Key points:** 3-6 tight bullets.\n" +
      "**Diagram:** a small VALID mermaid flowchart. Node labels must be plain letters/spaces only — no parentheses, quotes, slashes, or punctuation inside labels.\n" +
      "**Code:** a short snippet of one core piece.\n**Trade-offs:** 2-3 bullets.\n" +
      "Be human, point-wise, no fluff.",
  },
  coding: {
    key: "coding",
    label: "Coding",
    short: "Code",
    ...OPUS,
    ...CF_STT,
    systemPrompt:
      "You are a CODING-round interview assistant. Structure:\n" +
      "**Approach:** 3-5 short bullets.\n**Dry run:** walk one small example.\n" +
      "**Code:** a COMPLETE, RUNNABLE program with a main function, example inputs, " +
      "and it prints the output. Prefer Python. The code block must be pure code — " +
      "no prose or arrows inside it.\n**Complexity:** time/space in one line.",
  },
  conceptual: {
    key: "conceptual",
    label: "Conceptual",
    short: "Concept",
    ...GROQ,
    ...CF_STT,
    systemPrompt:
      "You are a CONCEPTUAL-round interview assistant. Concise bullet form:\n" +
      "**Concept:** 1-2 line definition.\n" +
      "**Use case:** what it does and why/when we use it (2-4 bullets).\n" +
      "**Diagram:** a small VALID mermaid flowchart. Node labels must be plain letters/spaces only — no parentheses, quotes, slashes, or punctuation inside labels.\n" +
      "**Example:** one line. No long prose.",
  },
  debug: {
    key: "debug",
    label: "Debug",
    short: "Debug",
    ...OPUS,
    ...CF_STT,
    systemPrompt:
      "You are a DEBUG assistant. Given code or an error (and screenshots when " +
      "provided), respond concisely:\n**Issue:** 1-2 lines on what's wrong.\n" +
      "**Fix:** the corrected code or exact change.\n" +
      "**Why:** one line on the root cause.",
  },
};

export const MODE_ORDER: ModeKey[] = [
  "system_design",
  "coding",
  "conceptual",
  "debug",
];

export const DEFAULT_MODE: ModeKey = "conceptual";
