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
let n = 9;
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
