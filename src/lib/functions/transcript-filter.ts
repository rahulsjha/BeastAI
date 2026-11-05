// Whisper invents filler phrases on silence/noise ("Thank you.", "you", …).
// Returns true when a transcript is noise and should not be shown or sent.
export function isNoiseTranscript(text: string): boolean {
  const clean = (text || "").trim();
  if (clean.replace(/[^\p{L}]/gu, "").length < 3) return true;
  return /^(thank(s| you)( (so much|very much))?( for watching)?|you|bye|okay|ok|uh+|um+|hmm+|\.+)[.!?]?$/i.test(
    clean
  );
}

/** Rough check for "this line is a question the interviewer wants answered". */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  return (
    t.endsWith("?") ||
    /^(what|why|how|when|where|which|who|can|could|would|should|do|does|did|is|are|explain|describe|tell me|walk me|design|implement|write|compare|define)\b/i.test(t)
  );
}
