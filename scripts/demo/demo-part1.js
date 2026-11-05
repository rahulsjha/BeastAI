await import('/webtest-runner.js');
const T = window.__T, sleep = T.sleep;
window.__D = { scene: "intro", log: [], done: false };
const log = (m) => window.__D.log.push(`${(performance.now()/1000).toFixed(0)}s ${m}`);
// Layout: the real 600px bar on the left, a caption panel on the right.
const st = document.createElement("style");
st.textContent = `#root,#root .w-screen,[data-radix-popper-content-wrapper] .w-screen,[data-radix-popper-content-wrapper]>*{width:600px!important;max-width:600px!important} [data-radix-popper-content-wrapper]{max-width:600px!important} html,body{background:#0d0f14!important}
#demo-cap{position:fixed;left:630px;top:14px;width:550px;bottom:14px;color:#e6e9ef;font:15px/1.45 system-ui;z-index:2147483646;pointer-events:none}
#demo-cap .k{font:600 11px system-ui;letter-spacing:.12em;color:#7dd3fc;text-transform:uppercase}
#demo-cap h1{font:700 26px/1.2 system-ui;margin:6px 0 10px}
#demo-cap ul{margin:0;padding-left:18px} #demo-cap li{margin:5px 0;color:#c9ced8}
#demo-cap .st{margin-top:14px;padding:8px 10px;border-radius:8px;background:#1b2130;color:#a7f3d0;font:13px ui-monospace,Menlo}
#demo-cap b{color:#fff}`;
document.head.appendChild(st);
const cap = document.createElement("div"); cap.id = "demo-cap"; document.body.appendChild(cap);
let n = 0;
const scene = (key, title, bullets) => { window.__D.scene = key; n++; log("scene " + key);
  cap.innerHTML = `<div class="k">Pluely demo · ${n}</div><h1>${title}</h1><ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul><div class="st" id="demo-st"></div>`; };
const status = (t) => { const e = document.getElementById("demo-st"); if (e) e.textContent = t; };
const type = async (q) => { for (let i = 1; i <= q.length; i += 3) { T.setText(q.slice(0, i)); await sleep(25); } T.setText(q); await sleep(300); };
const ask = async (mode, q) => { if (mode) { T.mode(mode); await sleep(700); } await type(q);
  status("Sending…"); const t0 = performance.now(); const r = await T.askNoType(); status(`Answered in ${((performance.now()-t0)/1000).toFixed(1)}s`); return r; };
// Same wait logic as T.ask but without retyping.
T.askNoType = async (timeout = 150000) => { const t0 = performance.now(); T.enter(); let first = null, last = "", stable = performance.now();
  while (performance.now() - t0 < timeout) { await sleep(300); const a = T.answer();
    if (first === null && a.split("Asked:")[1]?.trim().length > 40 && !T.loading()) first = 1;
    if (a !== last) { last = a; stable = performance.now(); }
    if (first !== null && !T.loading() && performance.now() - stable > 2500) break; }
  return last; };
const scrollAnswer = async (ms = 9000) => { const p = T.panel(); if (!p) return;
  const sc = [...p.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== "visible").sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
  if (!sc) return; const steps = ms / 50, d = (sc.scrollHeight - sc.clientHeight) / steps;
  for (let i = 0; i < steps; i++) { sc.scrollTop += d; await sleep(50); } await sleep(800); sc.scrollTop = 0; };
const closeAnswer = async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await sleep(400); };
const note = async (i, text) => { const b = [...document.querySelectorAll("svg.lucide-pencil")][i]?.closest("button"); b?.click(); await sleep(400);
  const inp = document.querySelector('input[placeholder^="e.g. this is the error"]');
  for (let k = 1; k <= text.length; k += 3) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(inp, text.slice(0, k)); inp.dispatchEvent(new Event("input", { bubbles: true })); await sleep(25); }
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(inp, text); inp.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(300); [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Save")?.click(); await sleep(600); };
const shortcut = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, metaKey: true, shiftKey: true, bubbles: true }));
const overlay = () => [...document.body.children].find((e) => e.style?.zIndex === "2147483647");
const drag = async (x1, y1, x2, y2) => { const o = overlay(); const ev = (t, x, y) => o.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, bubbles: true }));
  ev("mousedown", x1, y1); for (let i = 1; i <= 25; i++) { ev("mousemove", x1 + (x2 - x1) * i / 25, y1 + (y2 - y1) * i / 25); await sleep(40); } await sleep(500); ev("mouseup", x2, y2); await sleep(800); };
const waitFor = async (fn, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(500); } return false; };
const R = window.__D.results = {};

try {
  // 1 Intro
  scene("intro", "Pluely — live interview assistant", ["Always-on-top <b>600px bar</b>, hidden from screen sharing",
    "<b>4 modes</b>: Design · Code · Concept · Debug", "Ask by <b>typing, voice, screenshots, documents</b> or let it <b>watch the screen</b>",
    "Live transcript of <b>You + Interviewer</b>, an <b>answer queue</b> and full <b>history</b>"]);
  await sleep(6000);
  // 2 Concept
  scene("concept", "Concept mode", ["Model: <b>Groq gpt-oss-120b</b> — fast (1–3s)", "Format: concept → use case → diagram → example",
    "Answers any concept you ask — not only the interviewer's questions"]);
  R.concept = await ask("Concept", "What is consistent hashing and why do distributed caches use it?");
  await scrollAnswer(8000); await closeAnswer(); await T.newChat();
  // 3 Design
  scene("design", "Design mode", ["Model: Groq gpt-oss-120b", "Requirements · scale estimates (math) · API · data model",
    "Architecture <b>diagram</b> (validated, auto-repaired) · bottlenecks · trade-offs"]);
  R.design = await ask("Design", "Design a URL shortener like bit.ly for 100M new URLs per month");
  await scrollAnswer(14000); await closeAnswer(); await T.newChat();
  // 4 Code
  scene("code", "Code mode", ["Model: <b>Claude Opus, high effort</b> via your <b>claude</b> login (no API key)",
    "Answer <b>streams</b> in: approach → dry run → runnable code → complexity", "Code blocks have a copy button"]);
  R.code = await ask("Code", "Longest substring without repeating characters — give an O(n) solution in Python");
  await scrollAnswer(10000);
  // 4b follow-up
  scene("followup", "Follow-ups keep context", ["A follow-up uses the conversation so far", "The badge next to the bar opens the thread · <b>New Chat</b> starts fresh"]);
  R.follow = await ask(null, "Now write the same in C++");
  await scrollAnswer(6000); await closeAnswer(); await T.newChat();
  // 5 Documents with notes
  scene("docs", "Documents + a note per file", ["📎 Attach <b>PDFs, .md, .txt, code, logs</b> (or drag & drop)",
    "Tray shows what will be sent and how much text was read", "✎ <b>Note per attachment</b> — tells the AI what each file is", "Works in every mode"]);
  T.mode("Concept"); await sleep(500);
  await window.__attach("/testdocs/interview-notes.md", "interview-notes.md", "text/markdown"); status("Attached interview-notes.md");
  await window.__attach("/testdocs/resume.pdf", "resume.pdf", "application/pdf"); status("Attached resume.pdf");
  await note(0, "my prep notes for this company"); await note(1, "my resume — use it for experience questions");
  await sleep(1500);
  R.docs = await ask(null, "Which database should I use for the take-home, and what latency improvement did I deliver at my last job?");
  R.docsOk = /Marigold/i.test(R.docs) && /480/.test(R.docs) && /95/.test(R.docs);
  await scrollAnswer(6000); await closeAnswer(); await T.newChat();
  // 6 Screenshot area-select
  scene("shot", "Screenshot → solve", ["💻 button or <b>⌘⇧S</b>: drag to select any area of the screen", "Double-click = whole screen · Esc = cancel",
    "Add a note to the screenshot, send with or without a message", "Images in Code/Debug go to Opus; in Concept/Design to Sonnet"]);
  T.mode("Code"); await sleep(500); status("⌘⇧S pressed"); shortcut("s");
  await waitFor(() => overlay(), 15000); await sleep(1200); status("Dragging over the problem…");
  await drag(15, 60, 590, 640);
  await note(0, "this is the problem my interviewer shared");
  R.shot = await ask(null, "");
  await scrollAnswer(10000); await closeAnswer(); await T.newChat();
  // 7 Debug
  scene("debug", "Debug mode — like a normal chat", ["Attach evidence: screenshot of the error, logs, docs", "<b>Paste a long trace</b> → becomes an attachment automatically",
    "Empty message is fine → \"Debug this using the attached evidence\"", "Answer: Root cause · Evidence · Fix · <b>Before vs After</b> · How to verify"]);
  T.mode("Debug"); await sleep(600); window.__D.scene = "debug-shot"; await sleep(2500);
  shortcut("s"); await waitFor(() => overlay(), 15000); await sleep(1200); status("Double-click = whole screen");
  overlay().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await sleep(1200);
  const trace = `Traceback (most recent call last):\n  File "orders.py", line 7, in <module>\n    print(total_by_customer(orders))\n  File "orders.py", line 4, in total_by_customer\n    totals[o["customer"]] += o["amount"]\nKeyError: 'ana'\n\n$ python --version\nPython 3.11.7\n$ cat orders.py\ndef total_by_customer(orders):\n    totals = {}\n    for o in orders:\n        totals[o["customer"]] += o["amount"]\n    return totals\n`.repeat(2);
  const dt = new DataTransfer(); dt.setData("text/plain", trace);
  T.ta().focus(); T.ta().dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  status("Pasted a long trace → attachment"); await sleep(2500);
  R.debug = await ask(null, ""); R.debugOk = /Before vs After/i.test(R.debug) && /Root cause/i.test(R.debug);
  await scrollAnswer(16000); await closeAnswer(); await T.newChat();
  // 8 Solve screen
  window.__D.scene = "solve-prep"; await sleep(2500);
  scene("solve", "Solve screen — watches the screen", ["Click <b>Solve screen</b> or <b>⌘⇧O</b>", "Reads the screen every few seconds (LeetCode, HackerRank, quizzes, design prompts…)",
    "New question → answered in the matching mode (coding→Code, MCQ→Concept, design→Design)", "Same question isn't answered twice · thumbnail shows exactly what was read"]);
  T.mode("Concept"); await sleep(500); shortcut("o"); status("Monitoring… (screen: MCQ quiz)");
  await waitFor(() => (window.__queue?.jobs || []).some((j) => j.status === "done"), 120000);
  window.__D.scene = "solve-2"; status("Screen changed → design prompt");
  await waitFor(() => (window.__queue?.jobs || []).filter((j) => j.status === "done").length >= 2, 150000);
  shortcut("o"); status("Stopped (⌘⇧O)"); await sleep(1000);
  document.querySelector('button[title^="What Solve screen captured"], img[alt="Last capture"]')?.closest("button")?.click(); await sleep(5000);
  await closeAnswer();
  R.solve = (window.__queue?.jobs || []).map((j) => `${j.mode}:${j.status}:${j.text.slice(0, 50)}`);
  // 9 Live transcript + queue
  scene("live", "Live transcript + answer queue", ["<b>You</b> = your mic · <b>Interviewer</b> = the meeting's audio", "Auto-answers questions (not small talk); several questions are split",
    "Queue: waiting → answering → answered, one at a time, in the mode asked", "Here an interviewer voice asks two questions back-to-back"]);
  const lv = await window.__setupLive({ autoAnswer: true, you: false }); log("live " + JSON.stringify(lv));
  window.__queueRun([{ play: "c2", mode: "Concept" }, { play: "d2", mode: "Design" }]);
  await waitFor(() => window.__Q?.done, 300000); R.live = window.__Q?.jobs; await sleep(3000);
  // 10 Listen
  window.__D.scene = "listen-prep";
  scene("listen", "🎧 Listen", ["Desktop app: captures the computer's audio (Zoom/Meet/Teams) — no BlackHole, no tab sharing",
    "Browser: hears the meeting through the default mic", "Here: a question is spoken out loud from the speakers"]);
  const lb = document.querySelector("svg.lucide-headphones")?.closest("button"); lb?.click(); await sleep(3000);
  window.__D.scene = "listen-say"; status("Speaker: \"What is the difference between TCP and UDP?\"");
  await waitFor(() => /TCP/i.test(T.answer()) && !T.loading(), 90000); await sleep(4000); R.listen = T.answer().slice(0, 200);
  await scrollAnswer(6000); lb?.click(); await sleep(800); await closeAnswer();
  // 11 History
  scene("history", "🕘 History", ["Every question & answer from any source, grouped by day", "Mode and time taken · search · filter by mode · copy · delete",
    "Past Live-transcript sessions too · stored on this device only"]);
  document.querySelector("svg.lucide-history")?.closest("button")?.click(); await sleep(4000);
  const item = [...document.querySelectorAll("button, li, div[role=button]")].find((e) => /consistent hashing/i.test(e.textContent) && e.textContent.length < 300);
  item?.click(); await sleep(6000);
  // 12 Outro
  scene("outro", "Summary", ["Concept/Design → Groq (fast) · Code/Debug → Claude Opus (streams)", "Screenshots (⌘⇧S), documents & PDFs, a note per file",
    "Solve screen (⌘⇧O) · Live transcript · Listen · Answer queue · History", "All tested end-to-end in this recording"]);
  await sleep(6000);
} catch (e) { log("ERROR " + (e.stack || e)); }
window.__D.done = true;
