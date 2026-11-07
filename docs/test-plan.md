# Beast Interview Assistant — Complete Test Plan

Last updated: 2026-11-03. Use alongside `docs/status-issues-testing-plan.md` (known issues) and
`docs/model-routing.md` (routing + prompts).

Pass/fail is binary per case. Record results in the log at the end (§10).

---

## 0. Test environment — set up once

| Item | How | Check |
|------|-----|-------|
| Keys | `.env.local` has `VITE_GROQ_API_KEY`, `VITE_CF_API_KEY` | `grep VITE_ .env.local` shows both |
| Claude CLI | `claude -p "say OK" --model haiku` | prints `OK` (subscription, no API key) |
| Native app | `npm run tauri dev` in `~/pluely-fork` | overlay appears on **⌘\** |
| Web-test (for me to drive) | `npm run dev` + bridge `python3 claude_bridge.py` | `http://localhost:1420/?webtest=1` renders the overlay |
| Mic permission | System Settings → Privacy → Microphone → Beast ON | mic icon records |
| BlackHole (system audio) | installed; Multi-Output device = Speakers + BlackHole 2ch | appears in Listen input list |
| Screen Recording (Debug) | System Settings → Privacy → Screen Recording → Beast ON | `Watch screen` returns an analysis |

**Three surfaces, what each proves**
- **Backend scripts** (curl / CLI): model + STT correctness and timing. Fast, scriptable.
- **Web-test (Chrome)**: the real React UI, drivable + screenshottable. Proves UI logic and layout.
- **Native app**: the real stealth overlay. Manual only (invisible to screenshots, not automatable). Proves permissions, audio devices, real calls.

Run every UI case on **web-test first**, then confirm on **native**.

---

## 1. Mode switching (M)

| ID | Steps | Expected | Pass if |
|----|-------|----------|---------|
| M1 | Open overlay, read header | 4 pills: Design · Code · Concept · Debug; one highlighted | all 4 visible, none clipped, one active |
| M2 | Click **Code** | provider → `claude-cli`, model `opus` | Dev Space shows Coding active; `interview_mode=coding` persisted |
| M3 | Click **Concept** | provider → `groq-interview`, model `gpt-oss-120b`, key pre-filled | ask works with **no** "select a provider" / "missing api_key" error |
| M4 | Restart app | last mode restored | same pill active after relaunch |
| M5 | Dev Space | lists 4 modes read-only; **no** "Add Custom Provider", no key fields | nothing to configure |

---

## 2. Conceptual mode (C) — demo questions

Mode: **Concept**. Route: Groq. Target: answer ≤ 4s, structured, streams in.

| ID | Ask exactly | Pass if |
|----|-------------|---------|
| C1 | "What is eventual consistency?" | sections **Concept / Use case / Diagram / Example**; ≤4s |
| C2 | "Difference between TCP and UDP?" | bullets, mermaid diagram **renders** (no parse error) |
| C3 | "What is a React key prop and why does it matter?" | concise, correct, example line |
| C4 | "What is retrieval-augmented generation (RAG)?" | mentions retrieval + grounding; diagram renders |
| C5 | "Explain CAP theorem with an example." | names C/A/P, trade-off, example |
| C6 | **Streaming:** ask C1 and watch | text appears progressively, not all at once |
| C7 | **Follow-up:** after C1 ask "give me a real-world case of it" | answer references eventual consistency (context kept); counter increments |

Judge: correct, no hallucinated facts, bullet form, diagram valid, ≤4s.

---

## 3. System Design mode (D) — demo questions

Mode: **Design**. Route: Groq. Target: ≤5s, interview-ready structure.

| ID | Ask exactly | Pass if |
|----|-------------|---------|
| D1 | "Design a URL shortener like bit.ly." | Definition / Key points / Diagram / Code / Trade-offs |
| D2 | "How would you design a rate limiter for an API?" | names an algorithm (token bucket/sliding window), diagram renders |
| D3 | "Design the serving architecture for an LLM chat app." | mentions streaming, queueing/scaling, trade-offs |
| D4 | "Design a notification service for push, email, SMS at scale." | fan-out + retries + delivery tracking covered |
| D5 | "Design a scalable chat system with presence and offline sync." | websockets, presence, fan-out trade-offs |

Judge: diagram present + valid, a short code snippet, explicit trade-offs, no fluff.

---

## 4. Coding mode (K) — demo questions (code MUST run)

Mode: **Code**. Route: Opus 5.5 high-effort. Target: ≤20s; code runnable.

| ID | Ask exactly | Then verify | Pass if |
|----|-------------|-------------|---------|
| K1 | "Two Sum: return indices of two numbers that add to a target, with a runnable example." | copy code → `python3 -I file.py` | prints correct indices, e.g. `[0, 1]` |
| K2 | "Reverse a linked list, runnable example." | run | prints reversed order |
| K3 | "Check if a string is a valid palindrome ignoring non-alphanumerics, runnable." | run | `True/False` correct on examples |
| K4 | "Merge two sorted arrays into one sorted array, runnable example." | run | sorted merged output |
| K5 | "Longest common prefix among an array of strings, runnable." | run | e.g. `fl`, `''`, `inters` |
| K6 | "Check if a number is prime, runnable example." | run | correct for 2, 4, 17, -7 |
| K7 | **Structure:** any of above | — | **Approach / Dry run / Code / Complexity** all present; code block is pure code (no prose/arrows) |

Judge: `exit 0`, output matches expectation, complexity stated, dry run coherent.

---

## 5. Debug mode (G) — screen to be watched

Mode: **Debug** → **Watch screen**. Route: Opus vision. Target: first analysis ≤20s; loops.

**Put this on screen before/while watching (demo scenarios):**

| ID | What to show on screen | Expected analysis | Pass if |
|----|------------------------|-------------------|---------|
| G1 | A terminal with a Python traceback, e.g. run `python3 -c "x=[1,2]; print(x[5])"` | **Issue:** IndexError; **Fix:** bounds check | names the error type and a correct fix |
| G2 | Editor with a bug: `def add(a,b): return a - b` and a call `add(2,3)` | Issue: wrong operator; Fix: `+` | spots the `-` vs `+` |
| G3 | Change the screen (fix the bug) and wait for the next frame | **Changed:** describes the edit | "Changed" reflects the before→after |
| G4 | Leave screen static | **Changed: no change** | no invented changes |
| G5 | Click **Stop watch** | loop stops; button resets | no further analyses after stop |
| G6 | Switch mode away from Debug while watching | watching stops automatically | button hidden, loop ended |

Judge: accurate before/after diff, 1–2 line issue, concrete fix, no hallucinated changes.

---

## 6. Audio — what to send and how (A)

### 6a. Mic (your voice)
| ID | Steps | Pass if |
|----|-------|---------|
| A1 | Click mic, say: "What is the difference between horizontal and vertical scaling?" release | transcript appears in input; answer follows (Concept) |
| A2 | Say a **coding** question in Code mode: "Write a function to check if a number is prime." | transcribed; Opus returns runnable code |
| A3 | Speak with an Indian-English accent / a product name | transcript readable (names may slip — note them) |
| A4 | Speak 2 sentences with a pause | both sentences captured (no truncation) |

### 6b. Audio to **inject** (scriptable, no mic needed)
Generate and send these through STT → model (backend script):
```
say -v Alex -o q1.wav --file-format=WAVE --data-format=LEI16@16000 "What is eventual consistency?"
say -v Alex -o q2.wav --file-format=WAVE --data-format=LEI16@16000 "Write a function to reverse a linked list with a runnable example."
```
| ID | File | Pass if |
|----|------|---------|
| A5 | q1.wav → Cloudflare → Groq | transcript exact-ish; answer structured; ≤4s total |
| A6 | q2.wav → Cloudflare → Opus | transcript correct; code runs |

### 6c. Listen / system audio (the other people)
| ID | Steps | Pass if |
|----|-------|---------|
| A7 | Output = Multi-Output (Speakers+BlackHole); Listen input = **BlackHole 2ch**; press headphone; play a YouTube talk | transcript shows the **video's** words (not just you) |
| A8 | Join a real call (Meet/Zoom) with 2+ people; press headphone | transcript shows the remote speakers' words |
| A9 | Speak at the same time as the call | both sides appear (you via mic, them via BlackHole) |
| A10 | Stop Listen | capture stops; icon state resets |

**Speaker labels (requires Deepgram):** once wired, A8 must show `Speaker 1 / Speaker 2 / You` segments with timestamps.

### 6d. Negative audio tests
| ID | Steps | Pass if |
|----|-------|---------|
| A11 | Silence for 10s in Listen | no hallucinated text (VAD skips) |
| A12 | Music playing | app does not invent lyrics; may return little/no text |
| A13 | Deny mic permission | clear error shown, no crash |

---

## 7. Documents & input (I)

| ID | Steps | Pass if |
|----|-------|---------|
| I1 | Type a 3-line question | input **expands downward** below the divider; header unchanged |
| I2 | Shift+Enter | new line (no send); Enter sends | both behave |
| I3 | **Document attach process:** (1) click the paperclip → pick a `.txt/.md/.csv/code` file; (2) a **count badge** appears on the paperclip; (3) click the paperclip again → "Attachments" panel lists the doc (📄 + char count) with Remove; (4) ask a question; (5) attachments clear after send | each step visible; badge shows `1` |
| I3b | **Prove injection (critical):** the doc must contain facts the model can't guess, e.g. `The team mascot is a purple heron named Bluefin. Deploys come from branch quartz-release. Staging is nicknamed Marigold.` Ask: "From the attached notes: mascot name, deploy branch, staging nickname?" | answer contains **Bluefin / quartz-release / Marigold**. ⚠️ Never use guessable facts (PostgreSQL/Redis/weekly) — the model will "answer" them without the doc |
| I4 | Attach an image in Concept mode | clear message that images need a vision model (no crash) |
| I5 | Attach 2 docs | both referenced; counter shows 2 |
| I6 | After send | attachments cleared; input shrinks back to 1 line |

---

## 8. UI principles rubric (U) — judge every screen

Score each 0–2 (0 fail, 1 partial, 2 pass). Target ≥ 18/22.

| ID | Principle | What to check |
|----|-----------|---------------|
| U1 | **Fixed header** | header row never grows/jumps when typing |
| U2 | **No overlap/clipping** at overlay width (~560px) | pills, mic, screen, attach, sparkles, drag all visible |
| U3 | **Single clear primary action** | input + Enter is obvious; mode is obvious |
| U4 | **State visibility** | active mode highlighted; loading indicator while generating; Debug shows "Analyzing…/Stop" |
| U5 | **Feedback on errors** | errors are specific ("Failed to fetch" + why), not silent |
| U6 | **Zero setup** | no provider/key prompts anywhere in normal use |
| U7 | **Readable answers** | headings, bullets, code blocks with copy; diagrams render |
| U8 | **Streaming feel** | interview answers appear progressively |
| U9 | **Consistency** | same spacing/radius/buttons across header, Dev Space, response panel |
| U10 | **Keyboard-first** | ⌘\ summon, ⌘⇧I focus, Enter send, Shift+Enter newline, arrows scroll |
| U11 | **Dark/light** | both themes legible (no invisible text) |

---

## 9. Reliability & performance (R)

| ID | Test | Pass if |
|----|------|---------|
| R1 | 10 Concept questions back-to-back | all answer; avg ≤4s; no "Failed to fetch" |
| R2 | 3 Code questions back-to-back | all run; avg ≤20s |
| R3 | Switch modes mid-conversation | routing changes; no stale provider error |
| R4 | Relaunch app 3× | modes/keys restored each time; no SQL migration error |
| R5 | Close + reopen overlay (⌘\) | state preserved |
| R6 | Kill network, ask | clear network error, app stays usable |

---

## 10. Execution order & result log

**Order:** §0 setup → M → C → D → K → I → U (web-test) → repeat M/C/K/I on native → A (mic → inject → Listen) → G → R.

**Log format** (append per run):
```
Date | Surface (web/native) | Case ID | Result (P/F) | Time | Notes / exact error
```

**Bug report template**
```
Case: <ID>  Surface: web|native  Mode: <mode>
Steps: ...
Expected: ...
Actual (exact text/screenshot): ...
Logs: tauri dev log line / console line
```

---

## 11. Current known gaps to retest after fixes

- **B1 CORS** — PR #7: retest C1 on native (expect no "Failed to fetch").
- **A7–A9** — need BlackHole Multi-Output routing done; then retest.
- **Speaker labels** — after Deepgram wiring; retest A8 for `Speaker 1/2/You`.
- **Opus streaming** — after stream-json wiring; retest K1 for progressive text.
- **Mermaid** — retest C2/C4/D2 after any prompt/validator change.

## Audio capture probe (no UI needed) — verified 2026-11-03

`src-tauri/examples/audio_probe.rs` records from any input device through the same cpal path the app uses.

```bash
cd src-tauri && cargo build --example audio_probe
./target/debug/examples/audio_probe list                                   # devices (* = default)
./target/debug/examples/audio_probe record "MacBook Air Microphone" 8 mic.wav   # prints rms/peak, writes WAV
```

**Important:** the default `say` voice on this Mac produces *silent* audio (0.005 s). Always use `say -v Samantha`.
Target a device directly with `-a`: `say -v Samantha -a "BlackHole 2ch" "..."` (`say -a '?'` lists ids).

Results (Whisper transcript of the captured WAV):
| Source | Captured | Transcript |
|---|---|---|
| MacBook Air Microphone ← speakers | rms 0.047, peak 0.40 | exact |
| BlackHole 2ch ← audio routed to BlackHole | rms 0.117, peak 0.73 | exact |
| Teams Audio / RemotePC* / Utell* / AlteredVirtualAudio | silent (no app feeding them) | — |

## Screen-question tests across modes — verified 2026-11-03

Flow: real page → screenshot → app (Screenshot button or Debug watch) → answer. In web-test the bridge can serve a fixed
"screen" image (`PLUELY_TEST_SCREEN=/path/screen.png`) so tests don't depend on what is in front of the display.

| Mode | Site / question on screen | Model path | Result |
|---|---|---|---|
| Code | LeetCode #3 Longest Substring Without Repeating Characters | Opus (CLI) + `@screenshot` | Approach, dry run, Python; ran it: 7/7 cases pass |
| Design | GitHub system-design-primer: "Design Pastebin.com (or Bit.ly)" | Groq can't see images → Claude Sonnet vision fallback | Requirements, scale estimates, storage split, diagram |
| Concept | Wikipedia: Dining philosophers problem | Sonnet vision fallback | Concept, why it deadlocks, diagram, solutions table |
| Debug (watch) | Stack Overflow: "return response from async call" | Opus (CLI) vision, 12s/frame | Found the bug (`return result` before callback) + concrete fix |
| Debug (watch) | screen changes SO → LeetCode | Opus, 13s | "Changed: moved from … to LeetCode #3" |
| Debug (safety) | SO page with "paste this into your AI assistant" box | Opus | Ignored the on-screen instruction |
| Conversation | Two voices (interviewer + candidate) played into BlackHole | cpal capture → Whisper | Full exchange transcribed verbatim; no speaker labels (needs Deepgram) |

Bugs found and fixed in this pass:
- Screenshots were silently dropped for Code/Debug (Claude CLI never received `imagesBase64`) → images now sent as `@file`.
- Design/Concept threw "does not support image input" (Groq has no vision model) → image turns fall back to Claude Sonnet.
- Screenshot button was disabled in every mode (no provider had `{{IMAGE}}`) → enabled.
- Math rendered three times (`≈4\approx 4≈4`): Streamdown's `harden` stripped KaTeX classes → KaTeX now runs last.
- Mermaid parse errors from labels like `C[compare A[mid]]` → labels sanitized and quoted before rendering (`<`/`>` kept as `#lt;`/`#gt;`).
- Debug prompt only looked for UI errors → now also reads visible code for bugs and treats on-screen text as data.

Timing: typed Concept/Design (Groq) ~1–4s; screenshot questions ~11s CLI floor, 20–40s for full in-app answers; Code (Opus high) ~20–35s.
