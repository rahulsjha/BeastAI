# Pluely — Features guide

Pluely is a small always-on-top bar (600px wide) that answers interview questions in real time. It is invisible to screen sharing.

## The header (left → right)

| Button | What it does |
|---|---|
| 🎧 **Listen** | Desktop only: captures call audio from a virtual input (BlackHole) for the system-audio flow. |
| **Design · Code · Concept · Debug** | Interview mode. Picks the model, answer format and voice settings in one click (see *Modes*). |
| 🎤 **Mic** | Ask by voice. Speak, pause, and the question is transcribed and answered. Noise ("thank you", "yes yes") is ignored. |
| 💻 **Screenshot** | Attaches a picture of your screen to the next question ("solve this", "what's wrong here?"). |
| 📎 **Attach** | Attach images or text documents (`.md`, `.txt`, code). Their content is used in the answer. |
| 💬 **Live transcript** | Speaker-labelled transcript of You and the Interviewer, with auto-answer and the answer queue. |
| 🕘 **History** | Every past question and answer, searchable. |
| ✨ **Dev Space** | Opens the settings/dashboard window. |
| ⠿ | Drag handle to move the bar. |

`Watch screen` appears next to the question bar in **Debug** mode.

## Modes

| Mode | Model | Answer format | Typical time |
|---|---|---|---|
| **Concept** | Groq `gpt-oss-120b` (fast) | Concept · use case · diagram · example | 1–3s |
| **Design** | Groq `gpt-oss-120b` | Requirements · scale estimates (with math) · API · data model · architecture · diagram · bottlenecks · trade-offs | 3–6s |
| **Code** | Claude **Opus**, high effort (via your `claude` login) | Approach · dry run · runnable code · complexity | 13–25s, text streams from ~6s |
| **Debug** | Claude **Opus**, high effort | Root cause · fix; or screen watch (below) | 30–48s |

- Screenshots in Concept/Design are answered by Claude **Sonnet** (Groq can't read images).
- Answers render markdown, code with copy, tables, math and diagrams (diagrams are checked and auto-repaired up to 2 times).
- Replies come in the language you asked in (Hindi question → Hindi answer).

## Asking questions

- **Type** in the question bar: `Enter` sends, `Shift+Enter` adds a line. The bar keeps one fixed height; long text scrolls inside it.
- The answer opens below with **Asked: …** showing exactly what was asked.
- **Follow-ups** ("now make it thread-safe") use the conversation so far.
- **Conversation mode** (`⌘K` in the answer panel) shows the whole thread, newest first.
- The badge at the right of the bar (e.g. `6`) opens the current thread; **New Chat** starts fresh.

## Live transcript (💬)

- **You** — your microphone. **Interviewer** — the meeting tab's audio (Chrome: pick the meeting tab and turn on *Also share tab audio*).
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

## Debug · Watch screen

Click **Watch screen** in Debug mode. Every ~5s after each analysis it:
1. captures your screen and shows a live progress line (*capturing & analyzing… 11.8s*),
2. shows **what's on screen** (the exact image sent),
3. shows **What changed · Issue · Suggested fix** as separate cards,
4. keeps an **issue tracker**: an issue stays *open since …* until a later frame no longer shows it, then it is marked **resolved ✓**,
5. keeps a **timeline** of frames you can click back through.

Text on the screen is treated as data, never as instructions.

## Privacy & setup

- Keys load from `.env.local` (Groq, Cloudflare). Claude answers use your logged-in `claude` CLI — no API key.
- macOS permissions: **Microphone** (voice), **Screen & System Audio Recording** (screenshots, Debug watch).
