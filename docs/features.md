# Pluely — Features guide

Pluely is a small always-on-top bar (600px wide) that answers interview questions in real time. It is invisible to screen sharing.

## The header (left → right)

| Button | What it does |
|---|---|
| 🎧 **Listen** | Hears the meeting and answers its questions. Desktop app: the computer's audio directly (no BlackHole, no tab sharing). Browser: through the default mic. |
| **Design · Code · Concept · Debug** | Interview mode. Picks the model, answer format and voice settings in one click (see *Modes*). |
| 🎤 **Mic** | Ask by voice. Speak, pause, and the question is transcribed and answered. Noise ("thank you", "yes yes") is ignored. |
| 💻 **Screenshot** (⌘↵) | Drag to select an area; it's **sent right away** (with anything you typed) and the answer opens. ⌘⇧S only attaches it, so you can add a note or more files first. |
| 📎 **Attach** | Attach images or text documents (`.md`, `.txt`, code). Their content is used in the answer. |
| 💬 **Live transcript** | Speaker-labelled transcript of You and the Interviewer, with auto-answer and the answer queue. |
| 🕘 **History** | Every past question and answer, searchable. |
| ✨ **Dev Space** | Opens the settings/dashboard window. |
| ⠿ | Drag handle to move the bar. |

In Design / Code / Concept, **Solve screen** sits beside the question bar.

## Modes

| Mode | Model | Answer format | Typical time |
|---|---|---|---|
| **Concept** — General | Groq `gpt-oss-120b` (fast) | Concept · use case · diagram · example | 1–3s |
| **Concept** — ⚡ Short | Groq, low reasoning | Definition only, ≤3 lines | ~0.6s first words, <1s total |
| **Design** | Groq `gpt-oss-120b` | Requirements · scale estimates (with math) · API · data model · architecture · diagram · bottlenecks · trade-offs | 3–6s |
| **Code** | Claude **Opus**, high effort (via your `claude` login) | Approach · dry run · runnable code · complexity | 13–25s, text streams from ~6s |
| **Debug** | Claude **Opus**, high effort | Root cause · fix; or screen watch (below) | 30–48s |

- **Screenshots answer in ~2–3s, in every mode:** Groq **Qwen 3.8 vision** reads the screen (~1s: question, options, code, errors), then the fast Groq `gpt-oss-120b` answers in the mode's style. Screenshots are scaled to 1568px first. If reading fails, Claude answers instead (slower).
- Answers render markdown, code with copy, tables, math and diagrams (diagrams are checked and auto-repaired up to 2 times).
- Replies come in the language you asked in (Hindi question → Hindi answer).

- **General / ⚡ Short** (chip next to the modes, Concept only): Short answers with just a definition in at most 3 lines — fastest. Click the chip to switch.

## Shortcuts

| Keys | What it does | Where |
|---|---|---|
| **⌘↵** (Ctrl+Enter) | **Screenshot & send** — grabs the whole screen at once, sends it with anything typed, answer opens (thumbnail next to "Asked:") | everywhere (desktop: from any app) |
| 💻 button | Same as ⌘↵ | — |
| **⌘⇧S** | **Screenshot & attach** — drag an area (double-click = whole screen, Esc = cancel); waits in the tray for a ✎ note / more files; Enter sends | everywhere |
| **⌘⇧O** | Solve screen on / off | everywhere |
| **⌘⇧A** | Mic on / off (ask by voice) | everywhere |
| **⌘⇧M** | Listen on / off | everywhere |
| **⌘⇧I** | Put the cursor in the question bar | everywhere |
| **Enter** / **Shift+Enter** | Send / new line (in the question bar) | — |
| **⌘K** | Conversation mode on / off (in the answer) | — |
| **Esc** | Close the answer / cancel a screenshot | — |
| ⌘\\ | Show / hide Pluely | desktop app only |
| ⌘⇧D | Open Dev Space (settings) | desktop app only |
| ⌘ + arrows | Move the bar | desktop app only |

All keys can be changed in Dev Space → Shortcuts.

## Solve screen (any website)

Click **Solve screen** (next to the question bar, in Design / Code / Concept). It keeps reading your screen every few seconds:
- When a **new question** appears (LeetCode, HackerRank, Codeforces, quizzes, design prompts …) it extracts the full text — examples, constraints, options — and its type.
- It answers in the matching mode: coding → **Code** (Opus), design → **Design**, concept/MCQ → **Concept**, debugging → **Debug**.
- The same question still on screen is **not** answered twice; pages without a question are ignored.
- The thumbnail next to the button shows **exactly what was captured** and what was read from it.
- Every question goes through the **Answer queue** (shown above the question bar).

## Attachments (screenshots & documents)

- 💻 **Screenshot** attaches your screen; 📎 **Attach** adds images, **PDFs**, and text/code files (`.md`, `.txt`, `.py`, …).
- Everything that will be sent appears in the **"Sending with next question"** tray above the bar: screenshots as thumbnails (click to view full size), documents with how many characters were read. Remove any with ✕, or **Clear all**.
- Several screenshots and documents can go together in one question. The tray empties as soon as the question is sent.
- If a screenshot has no question or nothing interview-relevant, the reply is one line: **"⚠️ Not useful … attach one that shows the question, code or error."**
- **✎ Note per file** (every mode): add a message about one attachment — e.g. "this is the question my interviewer pasted", "ignore this one", "use my resume for the behavioral answer". The note is sent together with that file.

## Several screenshots & follow-ups

- **One question over several screens** (long problem, scroll + capture): ⌘⇧S (drag, or double-click = whole screen) adds the first; then the tray shows **+ Screen** (whole screen), **+ Area** (drag) and **Send N** — all are sent together and each screen is read.
- **Follow-up box** at the bottom of every answer: type a follow-up and/or add **+ Screen / + Area**, then **Send**. It continues the same conversation (the thread badge counts up); earlier turns are remembered even when they were answered by a different model.
- Debug screenshots are answered by **Claude Opus** (top quality; first words ~2–3s for a simple screen, ~5–9s for complex ones). Blank/irrelevant screens get "Not useful" in ~1s.

## Asking questions

- **Type** in the question bar: `Enter` sends, `Shift+Enter` adds a line. The bar keeps one fixed height; long text scrolls inside it.
- The answer opens below with **Asked: …** showing exactly what was asked.
- **Follow-ups** ("now make it thread-safe") use the conversation so far.
- **Conversation mode** (`⌘K` in the answer panel) shows the whole thread, newest first.
- The badge at the right of the bar (e.g. `6`) opens the current thread; **New Chat** starts fresh.

## Live transcript (💬)

- **You** — your microphone. **Interviewer** — the computer's audio (everyone in Zoom/Meet/Teams), captured automatically in the desktop app — no tab sharing.
- Every line shows the time, a **You** (blue) or **Interviewer** (amber) label, and the text.
- **Auto: [Interviewer] [You]** — which questions are answered automatically (both on by default). Statements and small talk are not answered; only questions and tasks are ("What is…", "Design…", "Given an array…").
- Several questions in one breath are split into separate jobs; refinements ("…can you do better than sorting?") stay with their question.
- Any line has an **Answer** button to answer it on demand.

## Answer queue

- Every question (auto, Answer button, mic) becomes a job: **waiting → answering → answered / cancelled / failed**, with wait and answer times.
- Jobs run **one at a time, in order**, each in the **mode it was asked in**. A new question never cancels the answer that is streaming.
- Duplicates within 30s are queued once. Waiting jobs can be removed (✕). Click a finished job to read its answer.

## History (🕘)

- **Questions & answers**: every answered question from any source, grouped by day, with mode and time taken. Search, filter by mode, click to read the full answer, copy, delete.
- **Transcript sessions**: past Live-transcript sessions with their lines and answers.
- Stored on this device only.

## Debug mode

Debug works like a normal conversation — attach evidence, add a message (or leave it empty) and send:
- 💻 **Screenshot** (⌘↵ or ⌘⇧S): drag to select the area of the screen you want (double-click = whole screen, Esc = cancel).
- 📎 **Attach** / **drag & drop** onto the bar: images, PDFs, documents, logs (`.log .txt .json .out .err`).
- **Paste a long trace or logs** into the question bar: it becomes an attachment automatically.
- Press **Enter** — with no message it sends "Debug this using the attached evidence."

The answer always has: **Root cause → Evidence** (the exact trace line / what the screenshot shows) **→ Fix → Before vs After** (current broken state vs after the fix: code, behaviour/output, error) **→ How to verify**.

## Privacy & setup

- Keys load from `.env.local` (Groq, Cloudflare). Claude answers use your logged-in `claude` CLI — no API key.
- macOS permissions: **Microphone** (voice), **Screen & System Audio Recording** (screenshots, Debug watch).
