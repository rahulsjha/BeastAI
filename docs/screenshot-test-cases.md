# Screenshot test cases

Every way a screenshot can get into Pluely, every mode it can be answered in, what is on the screen, and what should happen.

## 1. Three ways to run the tests

| Test setup | What gets captured | How to start it | Use it for |
|---|---|---|---|
| **A. Direct screen capture** (real screen) | Your actual screen, whatever is in front | Bridge started **without** `PLUELY_TEST_SCREEN`; page `localhost:1420/?webtest=1`; open the question (LeetCode, an error…) in a window beside the app | Real behaviour: what you would see in an interview |
| **B. Fixed test screen** | Always the same image file | Bridge started with `PLUELY_TEST_SCREEN=/path/to/image.png` | Repeatable cases: the same input every run (coding, MCQ, design, error, blank) |
| **C. Desktop app** | Real screen; Pluely itself is invisible to capture | Built app, global shortcuts | Final check: shortcuts from any app, native selection overlay |

Rules for setup A: the screen must be **unlocked and awake** (run with `caffeinate -d -u`), the test window must be **in front** (not on another Space), and nobody touches the mouse or keyboard during the run.

## 2. How a screenshot can be taken

| # | Method | Selection | Sent | Expected |
|---|---|---|---|---|
| M1 | 💻 button | Whole screen, instant | **At once**, with anything typed | No overlay; answer opens; thumbnail next to "Asked:"; tray empty |
| M2 | ⌘↵ | Whole screen, instant | At once, with anything typed | Same as M1 |
| M3 | ⌘⇧S + drag | The dragged area | **Not sent**: waits in the tray | Full-screen dimmed picker; green box; crop in tray; nothing sent |
| M4 | ⌘⇧S + double-click | Whole screen | Not sent | Whole screen in tray |
| M5 | ⌘⇧S + Esc | — | — | Picker closes, nothing attached, page leaves full screen |
| M6 | ⌘⇧S, then ✎ note, then Enter | Area + note | On Enter | Note shown in tray; answer follows the note |
| M7 | ⌘⇧S twice (2 areas), then Enter | Two crops | On Enter | Both in tray; answer uses both |
| M8 | ⌘⇧S, then ⌘↵ | Crop + whole screen | At once (⌘↵) | Both images sent together |
| M9 | Paste an image (⌘V) into the bar | The pasted image | Not sent | Image in tray |
| M10 | Drag & drop an image file onto the bar | The file | Not sent | Image in tray |
| M11 | 📎 Attach image | The file | Not sent | Image in tray |
| M12 | Solve screen (⌘⇧O) | Whole screen every ~4s | Automatically, only for a **new** question | "N found"; answer in the queue; same question not repeated |

## 3. What is on the screen

| # | Content | Expected answer |
|---|---|---|
| S1 | Coding problem (LeetCode / HackerRank / Codeforces) | Problem named, approach, dry run, runnable code, complexity |
| S2 | Multiple-choice question | The correct option + one-line why |
| S3 | System-design prompt ("Design Twitter") | Design answer: requirements → estimates → API → data model → diagram → trade-offs |
| S4 | Error / stack trace | Root cause, evidence (the exact line), fix, before vs after |
| S5 | Code with a bug (no error shown) | Bug found + fixed code |
| S6 | Concept question as text ("What is CAP theorem?") | Concept answer |
| S7 | **No question** (desktop, wallpaper, blank page, chat app) | Exactly one line: "⚠️ Not useful — … attach one that shows the question, code or error." |
| S8 | Question only partly visible (cut off) | Answers what is visible and says what is missing |
| S9 | Tiny text / high-resolution screen | Text still read correctly (screenshots are scaled to 1568px, which stays readable) |
| S10 | Dark-mode editor / light page | Read correctly either way |
| S11 | Question in Hindi (or another language) | Answer in the same language |
| S12 | Two different questions on screen | Both answered, or the main one + a note about the other |
| S13 | Pluely's own answer on screen | Not answered again (desktop: Pluely is invisible to capture) |

## 4. What is typed with it

| # | Bar | Expected |
|---|---|---|
| T1 | Empty | Default prompt: "Answer using the attached screenshots…" (Debug: "Debug this using the attached evidence.") |
| T2 | A question ("solve it in Java") | The question is followed (Java) |
| T3 | Text that contradicts the screen ("explain the diagram" on a code screen) | Says what is actually there |
| T4 | A ✎ note on the image ("this is my error") | Note used for that image |

## 5. Modes

| Mode | Who answers a screenshot | Expected style |
|---|---|---|
| Concept — Full | Claude Sonnet (Groq can't read images) | Concept · use case · diagram · example |
| Concept — ⚡ Short | Claude Sonnet | Definition only, ≤3 lines |
| Design | Claude Sonnet | Full design answer |
| Code | Claude Opus | Approach · dry run · code · complexity |
| Debug | Claude Opus | Root cause · evidence · fix · before vs after · verify |

## 6. The test matrix

The important combinations: every method once, every content type once, every mode once. 26 cases instead of 12 × 13 × 4 × 5.

| ID | Setup | Mode | Method | Screen | Bar | Pass when |
|---|---|---|---|---|---|---|
| X1 | A | Code | M1 💻 | S1 LeetCode | T2 "in Python" | Problem named + Python code; no overlay; thumbnail shown |
| X2 | A | Code | M2 ⌘↵ | S1 | T1 empty | Code answer; thumbnail |
| X3 | A | Code | M3 drag over problem | S1 | T1 → Enter | Crop waits in tray until Enter; then code |
| X4 | A | Code | M6 drag + note "code only" | S1 | — | Code only |
| X5 | A | Code | M4 double-click | S1 | — | Whole screen in tray |
| X6 | A | Code | M5 Esc | — | — | Nothing attached |
| X7 | A | any | M2 ⌘↵ | S7 nothing | T1 | One-line "Not useful" |
| X8 | A | Concept | M12 ⌘⇧O | S1 then S2 then S1 again | — | 2 found (coding → Code, MCQ → Concept); third not repeated |
| X9 | B | Concept Full | M2 | S6 concept text | T1 | Concept answer |
| X10 | B | Concept Short | M2 | S6 | T1 | ≤3 lines |
| X11 | B | Concept | M2 | S2 MCQ | T1 | Correct option |
| X12 | B | Design | M2 | S3 design | T1 | Full design answer with diagram |
| X13 | B | Debug | M2 | S4 stack trace | T1 | Root cause … before vs after |
| X14 | B | Debug | M3 + paste trace | S4 | T1 | Uses both image and trace |
| X15 | B | Code | M2 | S5 buggy code | T2 "what's wrong" | Bug + fix |
| X16 | B | Code | M2 | S8 cut-off problem | T1 | Says what is missing |
| X17 | B | Code | M2 | S9 Retina 2880×1800 | T1 | Read correctly; faster than full size |
| X18 | B | Code | M2 | S10 dark editor | T1 | Read correctly |
| X19 | B | Concept | M2 | S11 Hindi | T1 | Hindi answer |
| X20 | B | Code | M7 two crops | S1 + S5 | T1 | Both used |
| X21 | B | Code | M2 | S1 | T3 contradicting text | Says what is really there |
| X22 | B | each mode | M2 | S7 blank | T1 | "Not useful" in all 5 modes |
| X23 | A | Code | M9 paste image | S1 | T1 → Enter | In tray, then answered |
| X24 | A | Code | M10 drag & drop | S1 | T1 → Enter | In tray, then answered |
| X25 | C | Code | M2 ⌘↵ from another app (LeetCode in Safari) | S1 | T1 | Works without switching to Pluely; Pluely not in the image |
| X26 | C | any | M3 native overlay | S1 | — | Overlay over the real screen; crop correct on Retina / 2 monitors |

## 7. Status (6 Nov 2026)

| Cases | Setup | Result |
|---|---|---|
| X1–X7, M12 (shortcut suite) | A — real screen | ✅ 14/14 (`scripts/demo/shortcut-suite.mjs`) |
| X9 Concept Full · X10 Short (62 words) · X11 MCQ (correct option A) · X12 Design | B | ✅ |
| X13/X18 Debug dark editor · X14 area shot + pasted trace | B | ✅ |
| X15 buggy code (found `lo = mid`, and corrected the wrong "never returns" comment) · X16 cut-off · X20 two screenshots · X21 text contradicts screen | B | ✅ |
| X17 Retina 2880×1800: sent as 1568×980 | B | ✅ same answer, ~1s faster first words (12.1s vs 12.9s) |
| X19 Hindi screen → Hindi answer | B | ✅ |
| X22 blank screen in all 5 modes → "Not useful" | B | ✅ |
| X23 paste image · X24 drag & drop | A | to run (needs the screen unlocked) |
| X25, X26 | C — desktop | after the rebuild |

Bug found and fixed by this matrix: the **first ⌘⇧S after the page loads was cancelled by itself** (the switch into full screen was taken as "Esc"). Also tightened ⚡ Short to "≤3 sentences, ≤50 words" (screenshot answers were running to ~80 words).

Run them: `node scripts/demo/render-test-screens.mjs` (makes the test screens), then start the bridge with `PLUELY_TEST_SCREEN=<scratch>/screen.png` and run `node scripts/demo/screenshot-matrix.mjs <scratch>`.
