# Beast (rahulsjha fork) — Status, Issues, Testing & Plan

Last updated: 2026-11-03. Scope: the interview-assistant build on `rahulsjha/BeastAI`.

---

## 1. Features built (merged to `master`)

| PR | Feature | State |
|----|---------|-------|
| #1 | **Claude CLI provider** — answers via your logged-in `claude` CLI (subscription, no API key); `ANTHROPIC_API_KEY` stripped | ✅ merged |
| #2 | **Interview modes** — Design/Code/Concept/Debug auto-route model + voice + prompt; license/premium/hosted-cloud gating removed | ✅ merged |
| #3 | **Debug mode** — screen-watch every few seconds via Opus **vision** (`@image` through the CLI) → "Changed / Issue / Fix"; Dev Space shows auto-config | ✅ merged |
| #4 | **Streaming** — interview (Groq) answers stream token-by-token | ✅ merged |
| #5 | **Input below header** (expands downward), **document parsing** (attach text docs), **4 mode pills** | ✅ merged |
| #6 | **Audio capture via cpal** (no Xcode) — Listen captures the selected input device | ✅ merged |
| #7 | **CORS fix** — native API calls use Tauri Rust HTTP (`tauriFetch`) instead of webview `fetch` | ⏳ open (pending verify) |

### Routing (per mode)
- **Concept / Design → Groq `gpt-oss-120b`** (fast, streams).
- **Code / Debug → Claude Opus 5.5, high effort** via the `claude` CLI (subscription).
- **Voice (all modes) → Cloudflare Whisper** STT.
- Keys load from a gitignored `.env.local` (`VITE_GROQ_API_KEY`, `VITE_CF_API_KEY`); `.env.example` is committed.

### Measured performance (backend, verified)
- Concept (Groq): ~0.5–4s. Coding (Opus high): ~11–15s, code runs correctly.
- Audio→STT→answer (injected audio): Concept ~3s total; Coding ~14s, code ran.
- Builds without Xcode; `cargo check` + `vite build` pass; 0 type errors.

---

## 2. Bugs & issues hit (and status)

| # | Issue | Cause | Status |
|---|-------|-------|--------|
| B1 | **"Failed to fetch" in native app** | Webview `fetch` enforces CORS; Groq/Cloudflare send no CORS headers | Fix in PR #7 (tauriFetch); **verify on device** |
| B2 | **Listen / system audio disabled** | `cidre`/ScreenCaptureKit needs Xcode; was stubbed to build | Re-enabled via **cpal** (#6); captures an input device |
| B3 | **System audio needs a virtual device** | cpal captures *input* devices, not speaker output | Needs **BlackHole** + Multi-Output device (installed; routing pending) |
| B4 | **No speaker labels** | Cloudflare Whisper doesn't diarize | Plan: wire **Deepgram** nova-3 (diarization) |
| B5 | **Opus (Code/Debug) doesn't stream** | CLI returns full answer; no stream-json wiring | Open — plan below |
| B6 | **Mermaid diagrams sometimes invalid** | Groq writes unparseable mermaid (brackets inside labels) | **Fixed**: labels sanitized + quoted before render |
| B7 | **Input expansion broke the header** | Growing textarea inside the thin bar | Fixed (#5): input moved to its own row below a divider |
| B8 | **Mode dropdown looked unprofessional** | Switched to dropdown to fit width | Fixed (#5): back to 4 pills (fit once input moved below) |
| B9 | **`curl2Json` "Invalid URL" crash** | Placeholder provider curl had a non-URL | Fixed: valid placeholder URL |
| B10 | **"Missing required variable: api_key"** | Variable keys must be lowercase (`api_key`) | Fixed in modes config |
| B11 | **SQL migration mismatch at first launch** | Dev DB shared with installed v1.1.0 | Fixed by resetting the dev DB |
| B12 | **Groq false refusals** | Safety filter on words like "secret codeword" | Avoid such phrasing; use neutral prompts |
| B13 | **gpt-oss-20b writes prose into code blocks** | Small model | Use `gpt-oss-120b` (or Opus) for code |
| B14 | **Dev server stops when app window closes** | `tauri dev` child exits with the window | Relaunch; for web-test run `npm run dev` only |
| B15 | **Text documents silently never attached** | `handleFileSelect` only forwarded `image/*` files, so docs never reached `addFile`; an earlier "success" was the model guessing common defaults | **Fixed**: accepts parsable text docs; verified with unguessable facts (Bluefin/quartz-release/Marigold) |
| B16 | **Attachments panel assumed images** | rendered `<img>` for every file; labels said "Attached Images" | **Fixed**: documents show a 📄 card with char count; labels generalized to "Attachments" |
| B18 | **Mic button did nothing** | `vad-web` fetched the Silero model / worklet / onnxruntime WASM from a CDN the app webview can't reach, so VAD never initialized | **Fixed**: assets bundled in `public/vad/`, `useMicVAD` uses `baseAssetPath`/`onnxWASMBasePath` = `/vad/` |
| B19 | **Whisper sends "Thank you." on silence** | Whisper hallucinates filler on silence/noise | **Fixed**: short/filler transcriptions are dropped before submit |
| B20 | **Debug mode showed only a truncated one-liner** | header-only output | **Fixed**: panel shows the captured screenshot + full analysis + earlier frames |
| B21 | **Couldn't see what the mic heard** | answer panel showed only the response | **Fixed**: "Asked: …" line shows the typed/transcribed question |
| B22 | **Screenshots dropped in Code/Debug** | Claude CLI path never received images | **Fixed**: sent as `@file` attachments |
| B23 | **Screenshots failed in Design/Concept** | Groq has no vision model | **Fixed**: image turns fall back to Claude Sonnet |
| B24 | **Screenshot button disabled** | no provider curl had `{{IMAGE}}` | **Fixed**: enabled for all modes |
| B25 | **Math shown three times** | Streamdown `harden` stripped KaTeX classes | **Fixed**: KaTeX runs last |
| B26 | **Debug missed bugs in visible code** | prompt only looked for UI errors | **Fixed**: reads code, ignores on-screen instructions |
| B17 | **Listen gate pointed at Screen Recording** | leftover from the ScreenCaptureKit flow; cpal only needs Microphone | **Fixed**: gate auto-passes with cpal; manual steps + Grant button now target Microphone (+ BlackHole hint) |

---

## 3. UI / usability issues

- **Resolved:** input now expands **downward below the header**; header stays fixed; 4 mode pills; Dev Space is read-only (no manual provider setup).
- **Listen button** opens a "Setup Required / Grant access" panel — expected (mic permission on first use). Orange warning shows until permission + a working input device.
- **Open:** no visible per-speaker transcript formatting yet (depends on a diarizing STT — see B4).
- **Open:** Opus (Code/Debug) shows "Generating…" for ~15s with no streaming — feels slow (see B5).
- **Constraint:** the native overlay is **stealth** (excluded from screen capture) and **not automatable**, so it can't be screenshotted or driven by tooling — all native UI checks are manual.

---

## 4. Audio — where it stands

- **Mic (your voice):** works via the webview (`getUserMedia`) + local Silero VAD; needs macOS Microphone permission. Each pause ends a segment → Whisper → answer. Continuous background speech restarts the answer each segment (by design; mute the mic when not asking).
- **Listen / system audio:** capture engine **enabled** (cpal). It records the **selected input device**:
  - Default input = your mic → hears only you.
  - To hear **all remote participants**, route system output into **BlackHole** (virtual input) and select it.
- **Installed this session:** BlackHole 2ch (visible as an input device), `switchaudio-osx`.
- **Pipeline proven:** injected spoken questions → Cloudflare Whisper → model → answer (both modes).
- **Not yet proven live:** real call audio → BlackHole → capture. The synthetic loopback test was silent (headless `say` didn't route to BlackHole — a shell quirk, not an app bug). The true test is on a real call with a Multi-Output device.

---

## 5. How to test each area

### Backend (no UI) — fast, scriptable (done)
- **claude CLI:** `env -u ANTHROPIC_API_KEY claude -p "..." --model opus --effort high` → confirms subscription auth + answer.
- **Cloudflare STT:** POST a base64 WAV to the Workers AI Whisper endpoint → check `result.text`.
- **Groq:** POST to `api.groq.com/.../chat/completions` with `User-Agent` set → check answer / stream.
- **Full voice pipeline:** `say` → WAV → STT → model → (for code) extract code block and run it.

### Frontend logic — web-test harness (done for most)
- Run `npm run dev` (Vite only) + the local bridge; open `http://localhost:1420/?webtest=1` in Chrome.
- The shim (`public/webtest-shim.js`) fakes the Tauri runtime and routes `invoke`/`fetch` to the bridge, so the **real React UI** runs in Chrome and can be driven and screenshotted.
- Resize the window narrow (~560px) to reproduce overlay-width layout.

### Native app — manual only (stealth, not automatable)
- Launch `npm run tauri dev`; it's invisible to screenshots.
- Verify via: the `tauri dev` log, the webview devtools (if opened manually), and the user reporting on-screen behavior.

### Audio — layered
- **STT→AI:** inject WAV files (proven).
- **System capture:** install BlackHole, create a Multi-Output device, select BlackHole in Listen, join a real call, confirm the transcript shows the other side.

### What's missing (recommended to add)
- **Automated tests:** `vitest` for frontend logic (mode routing, provider selection, document parsing, fetch selection), and `cargo test` for the Rust `claude_cli`/`speaker` modules.
- **A smoke script** that runs the backend pipeline end-to-end on CI.

---

## 6. Deep plan (prioritized)

**P0 — unblock daily use**
1. **Verify PR #7 (CORS fix) on device** — ask a Concept question; confirm no "Failed to fetch". Merge once confirmed.
2. If Groq streaming misbehaves through `tauriFetch`, fall back to non-streaming for native (keep streaming on web) — measure first.

**P1 — the multi-speaker goal**
3. **Wire Deepgram** (nova-3, `diarize=true`) as the Listen STT (your own key) → speaker-labeled transcripts.
4. **BlackHole routing:** finish the Multi-Output device; select BlackHole in Listen; test on a real call.
5. **Transcript UI:** render "Speaker 1 / 2 / You" blocks with timestamps.

**P2 — polish**
6. **Opus streaming** for Code/Debug via `claude -p --output-format stream-json` → emit deltas as events so answers stream.
7. **Mermaid robustness:** post-process/validate diagrams, or retry on parse error.
8. **Mode persistence + per-mode model override** in the UI.

**P3 — reliability**
9. Add `vitest` + `cargo test` coverage for the items in §5.
10. Separate the dev-DB per build identifier so it never clashes with the installed app.
11. Document the one-time setup (keys, BlackHole, permissions) in the README.

**Known hard constraints (not bugs)**
- No Xcode → system audio uses cpal + BlackHole (not ScreenCaptureKit).
- Native overlay is stealth → no automated UI testing; rely on web-test + manual.
- Groq runs open models → great speed, use Opus for code correctness.
