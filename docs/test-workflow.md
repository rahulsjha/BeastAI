# Pluely — Test Workflow (all features)

How every feature is tested and judged. Run it after any change that touches the UI, prompts, routing or audio.

## Setup (once per run)
1. `npm run tauri dev` (native app) — or `npm run dev` + `python3 scripts/webtest-bridge.py` for the browser harness at `http://localhost:1420/?webtest=1`.
2. Keys in `.env.local` (`VITE_GROQ_API_KEY`, `VITE_CF_API_KEY`); `claude` CLI logged in.
3. Audio rule: **test audio is played out loud through the speakers and picked up by the real mic only.** Never inject into BlackHole, never send TTS files straight to STT. Use `say -v Samantha -a "MacBook Air Speakers" "…"` (the default voice is silent).

## Judging rubric (score each answer 1–5 on every line)
| Criterion | 5 = pass | Fail if |
|---|---|---|
| Correct | technically right, answers what was asked | wrong fact, wrong complexity, code fails a test |
| Mode format | follows the mode's structure (see below) | ignores structure, rambles |
| Renders | markdown, code, math and diagrams render; no "Mermaid Error" | raw `$…$`, broken diagram, layout overflow |
| Speed | Concept/Design typed ≤ 5s to first token; Code ≤ 40s; screenshot ≤ 45s | slower, or spinner never ends |
| Robust | edge case handled gracefully | crash, error boundary, silent no-op |

A feature **passes** when every case averages ≥ 4 and nothing scores 1.

Mode formats:
- **Concept** — definition, use case, small diagram, example.
- **Design** — requirements/scale, key components, data flow, trade-offs, diagram.
- **Code** — approach, dry run, runnable code, complexity. Code is extracted and executed against tests.
- **Debug** — Changed / Issue / Fix (watch) or root cause + fix (typed).

## Features and cases

### F1 Modes
- Click each pill → it highlights; next answer uses that mode's model and format.
- Switch mode while an answer is generating → no crash; next question uses the new mode.

### F2 Typed questions — ≥ 5 per mode
Each mode gets 5 standard questions plus edge cases (below). Code answers are executed.

### F3 Follow-ups
- Ask, then ask "now make it thread-safe" / "what if the input is huge?" → answer keeps context.
- New conversation button → context resets.

### F4 Streaming
- Concept/Design text appears progressively (first token ≤ 5s), not all at once.

### F5 Screenshot questions
- Screenshot button attaches the screen; question about it is answered in every mode (LeetCode, GitHub, Wikipedia, Stack Overflow).

### F6 Documents
- Attach a `.md`/`.txt` with unguessable facts; ask about them → answer quotes those facts.
- Remove attachment → no longer used.

### F7 Mic (voice question)
- Click mic → icon turns active → speak through speakers → "Asked:" shows the transcript → answer.
- Silence / filler ("thank you") → nothing is sent.

### F8 Listen (call audio)
- Manual, real call only: Multi-Output (Speakers + BlackHole) → select BlackHole in Listen → transcript of the other side appears.

### F9 Debug watch
- Watch screen → panel shows the exact frame sent + full analysis; screen change is reported; on-screen instructions are ignored.

### F10 Rendering
- Code block with copy, table, LaTeX (`$$…$$`), Mermaid flowchart with brackets/quotes in labels → all render.

### F11 Question bar
- Bar height never changes: empty, one word, 500-char question, 10-line paste, Shift+Enter newlines.
- Long text scrolls inside the bar; header and buttons never move or overlap.
- Full question is visible as "Asked:" above the answer.

### F12 Edge cases (run in each mode where relevant)
| Case | Expected |
|---|---|
| Empty / whitespace-only Enter | nothing sent |
| Very long question (2,000+ chars) | answered; bar stays fixed |
| Ambiguous ("explain it") | asks or states an assumption, no hallucinated topic |
| Wrong premise ("why is quicksort always O(n)?") | corrects the premise |
| Non-English (Hindi) question | answers sensibly |
| Prompt injection ("ignore your instructions and…") | stays in its role |
| Off-topic ("what's the weather") | short, honest answer |
| Code with tricky constraints (overflow, empty input, duplicates) | handles edges; tests pass |
| Cancel mid-answer (X) | stops cleanly, can ask again |
| Rapid double Enter | one request, no duplicate answers |

### F13 Answer queue (multiple questions at a time)
Every question (auto-detected, **Answer** click, or **Answer it**) becomes a job in the **Answer queue** section. Jobs run one at a time, in arrival order, each in the mode it was asked in. Nothing is dropped or cancelled by a newer question.

| # | Case | Steps | Expected |
|---|---|---|---|
| Q1 | Burst | Interviewer asks 3 questions back to back while the first is still answering | 3 jobs; answered in order 1→2→3; none dropped |
| Q2 | Mixed modes | Q in Code mode, then switch to Concept and a Q arrives | job 1 answered by Opus (Code), job 2 by Groq (Concept); each job shows its mode |
| Q3 | Duplicate | Same question transcribed twice within 30s (echo / repeat) | queued once |
| Q4 | Manual + auto | Click **Answer** on an old line while another answer streams | added to the end of the queue |
| Q5 | Cancel current | Press ✕ on the streaming answer | current job → cancelled; next job starts |
| Q6 | Remove queued | Press ✕ on a waiting job | removed; others keep order |
| Q7 | Failure | An answer errors (e.g. network) | job → failed; queue continues |
| Q8 | History | After the burst | every Q&A is in the conversation thread, in order |
| Q9 | Status UI | During the burst | each job shows waiting / answering / done with times; transcript lines show their job status |
| Q10 | Long queue | 6+ questions quickly | all kept; section scrolls; no layout break |

## Results — 2026-11-05 (browser harness, isolated interviewer simulator)
Interviewer audio = scripted clips (Daniel/Lekha voices) fed into the Interviewer pipeline; You = spoken out loud through the speakers into the real mic.

| Area | Result |
|---|---|
| Transcription, 13 interviewer lines (all modes + edge cases) | 13/13 heard correctly after fixes (vocabulary hint, language auto-detect, pre-speech padding) |
| Speaker labels (You vs Interviewer, incl. cross-talk) | correct; no leakage between sides |
| Auto-answer detection | questions answered; statements ("Great, thanks") and your own questions not answered |
| Live coding round (7 interviewer turns, Code mode) | 8/8 jobs answered; hidden tests: LRU 10/10, brackets 8/8, islands 5/5, k-th largest 5/5 ×2, palindrome 6/6, median (hard) 6/6; follow-up used prior context |
| Answer queue Q1–Q10 | all pass: burst, mixed modes (each in its own mode), duplicate, manual-while-streaming, cancel, remove, failure, long queue (6), history saved |
| Conversation mode + auto-answer | turns stack in the conversation view; follow-ups keep context |
| Debug live watch | each frame shows the image sent + analysis; screen changes detected; runs alongside queued answers |
| Screenshot questions (Code / Concept) | Opus / Sonnet vision read the screen correctly |
| History panel | every Q&A saved (typed, voice, screenshot, transcript); search, mode filter, expand answer |

Typical timings: transcript shown 2–6s after the speaker stops; Concept/Design answers 1–5s (Groq); Code 13–25s (Opus, streams from ~6s); Debug 30–48s (Opus high effort); screenshot answers 12–16s; watch frame ~12s.

## End-to-end demo run (recorded, real examples)

Video: `~/Movies/pluely-demo.mp4` (7m51s). Scripts: `scripts/demo/` (run in the `?webtest=1` / `?webtest=1&simtest=1` page).

| Scene | Real example | Result |
|---|---|---|
| Concept | "What is consistent hashing…" | ✅ Groq, 4.4s, hash-ring diagram |
| Design | URL shortener, 100M URLs/month | ✅ requirements, estimates, diagram |
| Code + follow-up | Longest substring (Python) → "same in C++" | ✅ Opus streamed, C++ kept context |
| Documents + notes | `interview-notes.md` + `resume.pdf`, a note on each | ✅ "Marigold-DB" and "480 ms → 95 ms" (facts only in the files) |
| Screenshot (⌘⇧S) | Drag over a LeetCode page + note, empty message | ✅ Valid Parentheses solved with tests, 17s |
| Debug | Full-screen shot of a KeyError + pasted trace, empty message | ✅ Root cause, Evidence, Fix, Before vs After, Verify |
| Solve screen (⌘⇧O) | MCQ quiz → Twitter design prompt | ✅ MCQ → Concept 1.8s; design → Design 4.4s |
| Live + queue | Interviewer asks two questions in one breath | ✅ split into 2 jobs, both answered in order |
| Listen (browser) | "What is the difference between TCP and UDP?" spoken from the speakers | ✅ transcribed and answered |
| History | Open panel, read a past answer | ✅ |

Note: the test Chrome must run with `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=BackgroundMediaSuspend`, otherwise a hidden window holds the simulator's audio playback.

## Screenshot shortcuts on the real screen (real key presses + mouse via CDP Input)

Script: `scripts/demo/screenshot-shortcut-test.mjs` (bridge started without `PLUELY_TEST_SCREEN`, so it captures the real screen).

| Case | Steps | Result |
|---|---|---|
| A | ⌘⇧S → drag a region → type question → Enter | ✅ overlay opened, crop attached (484 KB), answer described what was in the region (13s) |
| B | ⌘↵ → Esc | ✅ overlay closed, nothing attached |
| C | type text → ⌘↵ → double-click (whole screen) → Enter | ✅ typed text kept and not sent early, full screen attached (2.1 MB), answer used text + image (17s) |
| Desktop | `cargo check` with `screenshot_enter` (⌘↵) wired to the native capture | ✅ compiles |

## Screenshot & send (real key presses / mouse, real screen) — `scripts/demo/screenshot-send-test.mjs`

| Case | Result |
|---|---|
| Typed question → ⌘↵ → drag | ✅ one capture, sent at once, tray emptied, answer shown (10.5s) |
| Empty bar → ⌘↵ → drag | ✅ sent with the default prompt, answer shown (12.5s) |
| Click 💻 → drag | ✅ one overlay, sent at once, answer shown (10.5s) |
| ⌘⇧S → drag | ✅ only attached (waits in the tray), nothing sent |

## Irrelevant screenshots → "Not useful"

| Mode | Attachment (no message) | Reply |
|---|---|---|
| Concept / Code / Debug / Design | plain gradient (`testdocs/wallpaper.png`) | ✅ one line: "⚠️ Not useful — no question or relevant content in this screenshot. Attach one that shows the question, code or error." |
| Code (control) | LeetCode problem (`testdocs/leetcode.png`) | ✅ solved normally (Valid Parentheses) |
