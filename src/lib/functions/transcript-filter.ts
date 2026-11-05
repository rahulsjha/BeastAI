// Whisper invents filler phrases on silence/noise ("Thank you.", "you", …).
// Returns true when a transcript is noise and should not be shown or sent.
const FILLER_SENTENCE =
  /^(tchau|merci|gracias|obrigad[oa]|vamos l[aá]|vamos|danke|ciao|adios|adeus|au revoir|thank(s| you)( (so much|very much))?( for watching)?|you|bye|okay|ok|uh+|um+|hmm+|yeah|so)[.!?…,]*$/i;

export function isNoiseTranscript(text: string): boolean {
  const clean = (text || "").trim();
  // Lines made only of filler sentences ("Obrigado. Obrigado. Vamos lá.").
  const sentences = clean.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
  if (sentences.length > 1 && sentences.every((x) => FILLER_SENTENCE.test(x))) return true;
  // One or two words repeated ("Easy, easy, easy.", "Shit, shit.").
  const words = clean.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  if (words.length >= 2 && new Set(words).size <= Math.max(1, Math.floor(words.length / 3))) return true;
  // Placeholder our STT layer returns when nothing was recognised.
  if (/no transcription found/i.test(clean)) return true;
  // Whisper's well-known silence/noise hallucinations, incl. other languages
  // (language auto-detect makes these appear on room noise).
  if (/^(tchau|merci|gracias|obrigad[oa]|danke|ciao|adios|adeus|au revoir|sous-titres.*|subtítulos.*|продолжение следует.*|спасибо.*|ご視聴ありがとうございました.*|謝謝.*|谢谢.*|감사합니다.*|thank you for watching.*|please subscribe.*|like and subscribe.*)[.!…]*$/i.test(clean))
    return true;
  if (clean.replace(/[^\p{L}]/gu, "").length < 3) return true;
  return /^(thank(s| you)( (so much|very much))?( for watching)?|you|bye|okay|ok|uh+|um+|hmm+|\.+)[.!?]?$/i.test(
    clean
  );
}

/** Rough check for "this line is a question the interviewer wants answered". */
const START_QUESTION =
  /^(what|why|how|when|where|which|who|whom|can|could|would|should|will|do|does|did|is|are|was|were|have|has|explain|describe|tell me|walk me|talk me|design|implement|write|build|create|code|solve|find|given|compare|define|suppose|imagine|let's say|lets say|say you|reverse|sort|merge|optimi[sz]e|count|return|check|determine|compute|calculate|print|detect|validate|convert|(a )?function (to|that)|(an )?algorithm (to|that))\b/i;

export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  // Any sentence that starts like a question/task ("Next one. Given a string…").
  const sentences = t.split(/(?<=[.!?।])\s+/u).map((x) => x.trim());
  if (sentences.length > 1 && sentences.some((x) => START_QUESTION.test(x))) return true;
  // Starts like a question or an interview task ("Given an array…", "Write a function…").
  if (/^(what|why|how|when|where|which|who|whom|can|could|would|should|will|do|does|did|is|are|was|were|have|has|explain|describe|tell me|walk me|talk me|design|implement|write|build|create|code|solve|find|given|compare|define|suppose|imagine|let's say|lets say|say you|reverse|sort|merge|optimi[sz]e|(a )?function (to|that)|(an )?algorithm (to|that))\b/i.test(t))
    return true;
  // Question phrases anywhere (long questions often lose their "?" in transcription).
  return /\b(how would you|how do you|how can you|what would you|what is|what are|why does|why is|can you|could you|would you|walk me through|tell me about|explain how|design (a|an|the)|implement (a|an|the)|write (a|an|the)|how would|what happens)\b/i.test(t);
}

/**
 * Splits one transcript line into separate questions. Back-to-back questions
 * often arrive as a single line ("Explain X. Write Y. What is Z?").
 * Parts starting with "and / also / or / then / so" stay with the previous
 * question ("What is caching? And when should you avoid it?" is one question).
 */
export function splitQuestions(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[?.!।])\s+(?=\S)/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const groups: string[] = [];
  for (const s of sentences) {
    const prev = groups[groups.length - 1];
    // "Let's say … . How would you design it?" — the question needs its setup.
    const afterSetup =
      !!prev &&
      !/\?$/.test(prev) &&
      /^(let'?s say|say you|suppose|imagine|assume|consider|given|we have|you have|there is|there are)\b/i.test(prev) &&
      /\b(it|this|that|them|these|those|such)\b/i.test(s);
    // "…re-renders after I added useEffect. What could cause that?" — a question
    // pointing back at a preceding statement keeps that statement as context.
    const backRef =
      !!prev && !/\?$/.test(prev) && !looksLikeQuestion(prev) && /\b(it|this|that|them|these|those|such)\b/i.test(s);
    // "Find the k-th largest… Can you do better than sorting?" — a refinement of
    // the task just asked stays with it.
    const refinement =
      !!prev &&
      /^(can|could) you (do|make|solve|improve|optimi[sz]e|use|avoid|handle|reduce|beat)\b|better than|faster than|without (using|extra)|in o\(|in constant|in linear|in logarithmic|in place\b/i.test(s);
    const continues = afterSetup || backRef || refinement || /^(and|also|or|then|so|plus|but)\b/i.test(s);
    if (groups.length && !continues && !looksLikeQuestion(s) && /\?$/.test(prev)) continue; // stray tail after a question
    if (groups.length && (continues || !looksLikeQuestion(s))) groups[groups.length - 1] += " " + s;
    else groups.push(s);
  }
  const questions = groups.filter((g) => looksLikeQuestion(g));
  return questions.length ? questions : [text.trim()];
}

/**
 * Cleans Whisper output: collapses sentences repeated back to back and drops
 * sentences that loop ("It's a good repair. It's a good repair. …").
 */
export function cleanTranscript(text: string): string {
  const parts = (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?।…])\s+/u)
    .filter(Boolean);
  const key = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const counts = new Map<string, number>();
  parts.forEach((p) => counts.set(key(p), (counts.get(key(p)) ?? 0) + 1));
  const out: string[] = [];
  for (const p of parts) {
    const k = key(p);
    if (!k) continue;
    if (out.length && key(out[out.length - 1]) === k) continue; // back-to-back repeat
    if ((counts.get(k) ?? 0) >= 3 && out.some((o) => key(o) === k)) continue; // loop
    out.push(p);
  }
  return out.join(" ");
}
