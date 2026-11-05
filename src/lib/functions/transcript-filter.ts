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
  if (t.endsWith("?")) return true;
  // Starts like a question or an interview task ("Given an array…", "Write a function…").
  if (/^(what|why|how|when|where|which|who|whom|can|could|would|should|will|do|does|did|is|are|was|were|have|has|explain|describe|tell me|walk me|talk me|design|implement|write|build|create|code|solve|find|given|compare|define|suppose|imagine|let's say|lets say|say you|reverse|sort|merge|optimi[sz]e|(a )?function (to|that)|(an )?algorithm (to|that))\b/i.test(t))
    return true;
  // Question phrases anywhere (long questions often lose their "?" in transcription).
  return /\b(how would you|how do you|how can you|what would you|what is|what are|why does|why is|can you|could you|would you|walk me through|tell me about|explain how|design (a|an|the)|implement (a|an|the)|write (a|an|the)|how would|what happens)\b/i.test(t);
}
