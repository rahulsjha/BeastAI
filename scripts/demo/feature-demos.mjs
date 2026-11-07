// Records one captioned demo video per Beast feature from the real UI
// (browser version, ?webtest=1), using fixed test screens so nothing private
// (keys, your own screen) ends up in a video.
//
// Needs: dev server on :1420, test Chrome with --remote-debugging-port=9333,
// the bridge started with PLUELY_TEST_SCREEN=<SCREEN_FILE>, ffmpeg.
// Test screens: render scripts/demo/test-screens.html#<id> with headless Chrome (1440x900 @2x).
// Usage: node scripts/demo/feature-demos.mjs <screensDir> <screenFile> <outDir> [demo ...]
import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";

const [, , SCREENS, SCREEN_FILE, OUT, ...ONLY] = process.argv;
const W = 1200, H = 760;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

// ---------- CDP ----------
const tabs = await (await fetch("http://localhost:9333/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await call("Runtime.evaluate", { expression: `(async()=>{${x}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
await call("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });

// ---------- recorder ----------
let rec = null;
const startRec = (name) => {
  const dir = path.join(OUT, ".frames", name);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  rec = { name, dir, meta: [], on: true };
  (async () => { while (rec?.on) { const t = Date.now() / 1000; const r = await call("Page.captureScreenshot", { format: "jpeg", quality: 90 });
    if (r.result?.data && rec?.on) { const n = String(rec.meta.length).padStart(6, "0"); fs.writeFileSync(`${rec.dir}/${n}.jpg`, Buffer.from(r.result.data, "base64")); rec.meta.push({ n, t }); }
    await sleep(110); } })();
};
const stopRec = async () => {
  rec.on = false; await sleep(400);
  const { dir, meta, name } = rec; rec = null;
  const lines = []; meta.forEach((f, i) => { const next = meta[i + 1]?.t ?? f.t + 1.5; lines.push(`file '${f.n}.jpg'`, `duration ${Math.min(3, Math.max(0.04, next - f.t)).toFixed(3)}`); });
  lines.push(`file '${meta.at(-1).n}.jpg'`); fs.writeFileSync(`${dir}/list.txt`, lines.join("\n"));
  const mp4 = path.join(OUT, `${name}.mp4`), gif = path.join(OUT, `${name}.gif`), poster = path.join(OUT, `${name}.png`);
  execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -vf "fps=12,scale=1920:-2:flags=lanczos,format=yuv420p" -c:v libx264 -crf 24 -preset slow -movflags +faststart "${mp4}"`, { cwd: dir });
  execSync(`ffmpeg -y -loglevel error -i "${mp4}" -vf "fps=5,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" "${gif}"`);
  // Poster: a frame 60% in (the answer is usually on screen by then).
  const mid = meta[Math.floor(meta.length * 0.6)].n;
  execSync(`sips -Z 1600 -s format jpeg -s formatOptions 82 "${dir}/${mid}.jpg" --out "${poster.replace(/\.png$/, ".jpg")}" >/dev/null`);
  const secs = (meta.at(-1).t - meta[0].t).toFixed(0);
  console.log(`🎬 ${name}: ${secs}s, mp4 ${(fs.statSync(mp4).size / 1e6).toFixed(1)}MB, gif ${(fs.statSync(gif).size / 1e6).toFixed(1)}MB`);
  return { secs };
};

// ---------- stage: layout, caption panel, cursor, keycaps ----------
const STAGE_CSS = `#root,#root .w-screen,[data-radix-popper-content-wrapper] .w-screen,[data-radix-popper-content-wrapper]>*{width:600px!important;max-width:600px!important}
[data-radix-popper-content-wrapper]{max-width:600px!important}
html,body{background:radial-gradient(1200px 700px at 20% 10%,#1d2333,#0b0d12)!important}
#cap{position:fixed;left:624px;top:16px;width:560px;bottom:16px;color:#e8ebf1;font:15px/1.5 -apple-system,system-ui;z-index:2147483646;pointer-events:none;display:flex;flex-direction:column;gap:10px}
#cap .k{font:600 11px system-ui;letter-spacing:.14em;color:#7dd3fc;text-transform:uppercase}
#cap h1{font:700 27px/1.15 -apple-system,system-ui;margin:2px 0 0}
#cap .why{color:#aeb6c4;font-size:14px}
#cap ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
#cap li{display:flex;gap:10px;align-items:flex-start;padding:7px 10px;border-radius:10px;background:#ffffff08;color:#9aa3b2;font-size:14px;transition:all .25s}
#cap li .n{flex:0 0 22px;height:22px;border-radius:50%;background:#ffffff14;display:grid;place-items:center;font:600 12px system-ui;color:#cbd2dd}
#cap li.now{background:#38bdf826;color:#fff;box-shadow:inset 0 0 0 1px #38bdf866}
#cap li.now .n{background:#38bdf8;color:#04131c}
#cap li.done{color:#c7f9d4} #cap li.done .n{background:#22c55e;color:#04140a}
#cap .scr{margin-top:auto;display:flex;gap:10px;align-items:flex-end}
#cap .scr img{width:330px;border-radius:8px;border:1px solid #ffffff26;box-shadow:0 8px 30px #0008}
#cap .scr .l{font:600 11px system-ui;letter-spacing:.1em;color:#94a3b8;text-transform:uppercase}
#cap .st{padding:7px 10px;border-radius:8px;background:#0f172a;color:#a7f3d0;font:13px ui-monospace,Menlo;min-height:20px}
#kc{position:fixed;left:300px;top:300px;transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none;display:flex;gap:6px;opacity:0;transition:opacity .2s}
#kc span{background:#0b1220ee;color:#fff;border:1px solid #ffffff40;border-bottom-width:3px;border-radius:9px;padding:8px 14px;font:600 22px -apple-system,system-ui;box-shadow:0 10px 30px #000a}
#cur{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fde04788;border:2px solid #fde047;z-index:2147483647;pointer-events:none;transition:left .45s ease,top .45s ease;left:300px;top:200px}
#cur.click{animation:clk .35s} @keyframes clk{0%{transform:scale(1)}50%{transform:scale(1.9);opacity:.6}100%{transform:scale(1)}}`;

const stage = async (n, total, title, why, steps) => {
  await ev(`
    let s=document.getElementById("stage-css"); if(!s){s=document.createElement("style");s.id="stage-css";document.head.appendChild(s);} s.textContent=${JSON.stringify(STAGE_CSS)};
    for (const i of ["cap","kc","cur"]) { if(!document.getElementById(i)){const d=document.createElement("div");d.id=i;document.body.appendChild(d);} }
    document.getElementById("cap").innerHTML = \`<div class="k">Beast · feature ${n} of ${total}</div><h1>${title}</h1><div class="why">${why}</div>
      <ol>${steps.map((s, i) => `<li data-i="${i}"><span class="n">${i + 1}</span><span>${s}</span></li>`).join("")}</ol>
      <div class="st" id="cap-st">&nbsp;</div><div class="scr" id="cap-scr"></div>\`;
    return 1`);
};
const step = (i) => ev(`document.querySelectorAll("#cap li").forEach((l)=>{const k=+l.dataset.i; l.className = k<${i}?"done":k===${i}?"now":"";}); return 1`);
const allDone = () => ev(`document.querySelectorAll("#cap li").forEach((l)=>l.className="done"); return 1`);
const status = (t) => ev(`const e=document.getElementById("cap-st"); if(e) e.textContent=${JSON.stringify(t)}; return 1`);
const showScreen = async (name, label = "On the screen (what Beast captures)") => {
  fs.copyFileSync(path.join(SCREENS, `${name}.png`), SCREEN_FILE);
  const tmp = path.join(OUT, `.prev-${name}.jpg`);
  execSync(`sips -Z 1100 -s format jpeg -s formatOptions 88 "${path.join(SCREENS, name + ".png")}" --out "${tmp}" >/dev/null 2>&1`);
  const b64 = fs.readFileSync(tmp).toString("base64"); fs.rmSync(tmp, { force: true });
  await ev(`document.getElementById("cap-scr").innerHTML='<div><div class="l">${label}</div><img src="data:image/jpeg;base64,${b64}"></div>'; return 1`);
};
const keycap = async (keys, ms = 1100) => {
  await ev(`const k=document.getElementById("kc"); k.innerHTML=${JSON.stringify(keys)}.map(x=>"<span>"+x+"</span>").join(""); k.style.opacity=1; return 1`);
  await sleep(ms); await ev(`document.getElementById("kc").style.opacity=0; return 1`);
};

// ---------- input helpers ----------
const center = (sel) => ev(`const e=${sel}; if(!e) return null; const r=e.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]`);
const click = async (sel, { pause = 450 } = {}) => {
  const c = await center(sel); if (!c) { console.log("  ! missing", sel.slice(0, 90)); return false; }
  await ev(`const c=document.getElementById("cur"); c.style.left="${c[0]}px"; c.style.top="${c[1]}px"; return 1`); await sleep(pause + 200);
  await ev(`const c=document.getElementById("cur"); c.classList.remove("click"); void c.offsetWidth; c.classList.add("click"); return 1`);
  lastAction = Date.now();
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: c[0], y: c[1], button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: c[0], y: c[1], button: "left", clickCount: 1 });
  await sleep(300); return true;
};
const btn = (text) => `[...document.querySelectorAll("button")].find(b=>b.innerText.trim()===${JSON.stringify(text)})`;
const icon = (cls) => `document.querySelector("svg.lucide-${cls}")?.closest("button")`;
const typeText = async (text, cps = 28) => { for (let i = 0; i < text.length; i += 2) { await call("Input.insertText", { text: text.slice(i, i + 2) }); await sleep(2000 / cps); } await sleep(350); };
const typeBar = async (text) => { await ev(`document.querySelector("textarea").focus(); return 1`); await typeText(text); };
const key = async (k, code, vk, mods = 0, text) => {
  lastAction = Date.now();
  await call("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(text ? { text } : {}) });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
};
const CMD = 4, SHIFT = 8;
let lastAction = Date.now(); // when the last click/key happened (= when a question was sent)
const enter = () => key("Enter", "Enter", 13, 0, "\r");
const mode = (name) => click(btn(name));
const answerText = () => ev(`return document.getElementById("answer-title")?.closest("[data-slot=popover-content], [role=dialog]")?.innerText || document.body.innerText`);
const waitAnswer = async (ms = 150000) => {
  const t0 = Date.now(), sentAt = lastAction; await sleep(1200); let last = "", stable = Date.now(), doneAt = Date.now();
  while (Date.now() - t0 < ms) {
    const a = await ev(`return (/Generating response/.test(document.body.innerText) ? "…" : "") + (document.querySelector("[data-radix-scroll-area-viewport]")?.innerText||"")`);
    if (a !== last) { last = a; stable = Date.now(); doneAt = Date.now(); }
    if (!a.startsWith("…") && a.length > 40 && Date.now() - stable > 2200) break;
    await sleep(400);
  }
  return ((doneAt - sentAt) / 1000).toFixed(1); // send → last change of the answer
};
const scrollAnswer = async (ms = 5000) => {
  const steps = Math.ceil(ms / 120);
  for (let i = 0; i < steps; i++) { await ev(`document.querySelectorAll("[data-radix-scroll-area-viewport]").forEach(v=>v.scrollBy(0,14)); return 1`); await sleep(120); }
};
const scrollTop = () => ev(`document.querySelectorAll("[data-radix-scroll-area-viewport]").forEach(v=>v.scrollTo(0,0)); return 1`);
const closeAnswer = async () => { if (await center(`document.getElementById("answer-close")`)) await click(`document.getElementById("answer-close")`); await sleep(500); };
const fresh = async () => {
  await ev(`location.reload()`); await sleep(5500);
  await ev(`await import("/webtest-runner.js"); window.__DEMO_NO_FS = true; return 1`);
  await call("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });
};
const setFiles = async (sel, files) => {
  const d = await call("DOM.getDocument", { depth: -1 }); const q = await call("DOM.querySelector", { nodeId: d.result.root.nodeId, selector: sel });
  await call("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files });
};
// This test browser defaults to a silent virtual mic: use the built-in one (speakers → mic).
const useBuiltInMic = () => ev(`
  const devs = await navigator.mediaDevices.enumerateDevices();
  const mac = devs.find((d) => d.kind === "audioinput" && /MacBook.*Microphone|Built-in/i.test(d.label));
  if (mac && !navigator.mediaDevices.__wrapped) {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c) => orig(c && c.audio ? { ...c, audio: { ...(typeof c.audio === "object" ? c.audio : {}), deviceId: { exact: mac.deviceId } } } : c);
    navigator.mediaDevices.__wrapped = true;
  }
  return mac?.label || "none"`);
const say = (text) => new Promise((r) => { const p = spawn("say", ["-v", "Samantha", "-r", "150", text]); p.on("exit", r); });
const overlay = `[...document.body.children].find(e=>e.style?.zIndex==="2147483647" && e.id!=="kc" && e.id!=="cur")`;
const drag = async (x1, y1, x2, y2) => {
  await ev(`const c=document.getElementById("cur"); c.style.left="${x1}px"; c.style.top="${y1}px"; return 1`); await sleep(500);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
  for (let i = 1; i <= 24; i++) { const x = x1 + ((x2 - x1) * i) / 24, y = y1 + ((y2 - y1) * i) / 24;
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    await ev(`const c=document.getElementById("cur"); c.style.transition="none"; c.style.left="${x}px"; c.style.top="${y}px"; return 1`); await sleep(45); }
  await sleep(500); await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
  await ev(`document.getElementById("cur").style.transition=""; return 1`); await sleep(700);
};

// ---------- the demos ----------
const DEMOS = [];
const demo = (slug, title, why, steps, run) => DEMOS.push({ slug, title, why, steps, run });

demo("01-modes", "Modes: Design · Code · Concept · Debug",
  "Pick how Beast should answer. Concept has Full and ⚡ Short (a 3-line definition, fastest).",
  ["Choose <b>Concept</b> (Full): type a question, press Enter", "Full answer: concept · use case · diagram · example", "Switch to <b>⚡ Short</b> and ask the same", "Short: just the definition, ≤3 lines"],
  async () => {
    await step(0); await mode("Concept"); await ev(`const b=${btn("⚡ Short")}; if(b) b.click(); return 1`); await sleep(300);
    await typeBar("What is a deadlock?"); await keycap(["↵ Enter"], 700); await enter();
    await step(1); const t1 = await waitAnswer(); await status(`Full answer in ${t1}s`); await scrollAnswer(6000); await scrollTop();
    await closeAnswer(); await step(2); await click(btn("Full")); await sleep(600);
    await typeBar("What is a deadlock?"); await enter();
    await step(3); const t2 = await waitAnswer(); await status(`⚡ Short answer in ${t2}s`); await sleep(3500);
    await click(btn("⚡ Short")); await closeAnswer();
  });

demo("02-screenshot-send", "Screenshot & send: 💻 or ⌘↵",
  "One click (or ⌘↵) grabs the whole screen and sends it with anything you typed. The answer opens at once.",
  ["The question is on the screen (LeetCode)", "<b>Code</b> mode · type “in Python” · click <b>💻</b>", "Sent screenshot shows next to “Asked:”", "Answer: approach · dry run · code · complexity", "Empty bar + <b>⌘↵</b> works the same"],
  async () => {
    await showScreen("leetcode"); await step(0); await sleep(1500);
    await step(1); await mode("Code"); await typeBar("Solve it in Python"); await click(icon("laptop-minimal"));
    await step(2); await sleep(2500); await step(3); const t = await waitAnswer(); await status(`Full answer in ${t}s`); await scrollAnswer(9000);
    await closeAnswer(); await showScreen("s6_concept"); await mode("Concept"); await ev(`document.querySelector("textarea").focus(); return 1`);
    await step(4); await keycap(["⌘", "↵"]); await key("Enter", "Enter", 13, CMD); const t2 = await waitAnswer(); await status(`⌘↵ answered in ${t2}s`); await scrollAnswer(4000); await closeAnswer();
  });

demo("03-area-screenshot", "Area screenshot: ⌘⇧S",
  "Drag over just the part you want. It waits in the tray so you can add a note or more screenshots, then Enter sends.",
  ["Press <b>⌘⇧S</b>: the screen dims", "Drag a box around the problem", "The crop waits in the tray (nothing sent yet)", "✎ Add a note for this screenshot", "Press <b>Enter</b>: answer follows the note"],
  async () => {
    await showScreen("leetcode"); await mode("Code"); await ev(`document.activeElement?.blur(); return 1`);
    await step(0); await keycap(["⌘", "⇧", "S"]); await key("S", "KeyS", 83, CMD | SHIFT); await sleep(3500);
    await step(1); await drag(14, 82, 596, 700); await sleep(1500);
    await step(2); await sleep(2200);
    await step(3); await click(`document.querySelector('[title="Add a message about this file"]') || document.querySelector("svg.lucide-pencil")?.closest("button")`); await sleep(400);
    await typeText("Only give the approach and the code, no dry run"); await enter(); await sleep(900);
    await step(4); await ev(`document.querySelector("textarea").focus(); return 1`); await keycap(["↵ Enter"], 700); await enter();
    const t = await waitAnswer(); await status(`Full answer in ${t}s`); await scrollAnswer(7000); await closeAnswer();
  });

demo("04-followups", "Follow-ups: more text, screenshots and files in the same conversation",
  "Every answer has a follow-up box. Add a screenshot, an area or a file, type a question, and it continues the same thread.",
  ["Ask with 💻 (Code · LeetCode on screen)", "The screen changes: buggy code", "Follow-up box: <b>+ Screen</b> and type the question", "Send: Q1 stays above with its screenshot", "📎 attach a log file + ask again", "<b>+ New</b> starts a fresh conversation"],
  async () => {
    await showScreen("leetcode"); await mode("Code"); await step(0); await typeBar("Just the approach in 3 lines"); await click(icon("laptop-minimal"));
    await waitAnswer(); await sleep(1000);
    await step(1); await showScreen("s5_buggy"); await sleep(1800);
    await step(2); await click(btn("+ Screen")); await sleep(3000); await click(`document.getElementById("followup-input")`); await typeText("Different question now: is there a bug in this code?");
    await step(3); await click(`document.getElementById("followup-send")`); const t = await waitAnswer(); await status(`Follow-up answered in ${t}s`); await scrollTop(); await sleep(2500); await scrollAnswer(6000);
    await step(4); await setFiles('input[type=file][multiple][accept^="image/*,.pdf"]', [path.join(SCREENS, "..", "app-error.log")]); await sleep(1200);
    await click(`document.getElementById("followup-input")`); await typeText("And what does this log say? One line.");
    await click(`document.getElementById("followup-send")`); await waitAnswer(); await scrollTop(); await sleep(1500); await scrollAnswer(5000);
    await step(5); await click(btn("New")); await sleep(1500); await allDone(); await sleep(1500);
  });

demo("05-history-continue", "History: find any answer and continue it",
  "Every question and answer is saved on this computer. Search, filter by mode, copy, or press Continue to keep going.",
  ["Open <b>🕘 History</b>", "Search and expand an answer", "Press <b>Continue</b>: the whole thread reopens", "Ask a follow-up in that conversation"],
  async () => {
    await step(0); await click(icon("history")); await sleep(1500);
    await step(1); await click(`document.querySelector('input[placeholder^="Search"]')`); await typeText("bug"); await sleep(1000);
    await click(`[...document.querySelectorAll("li .truncate")][0]`); await sleep(2500);
    await step(2); await click(`document.querySelector("[data-continue]")`); await sleep(2500); await scrollAnswer(3000);
    await step(3); await typeText("Give the fixed line only."); await click(`document.getElementById("followup-send")`);
    const t = await waitAnswer(); await status(`Full answer in ${t}s`); await sleep(2500); await closeAnswer();
  });

demo("06-not-useful", "Nothing to answer? “Not useful”",
  "If the screenshot has no question, code or error, Beast says so in one line instead of guessing.",
  ["The screen is just a desktop wallpaper", "Press <b>⌘↵</b>", "One line: ⚠️ Not useful — attach one that shows the question"],
  async () => {
    await showScreen("wallpaper"); await mode("Code"); await step(0); await sleep(2000);
    await step(1); await ev(`document.querySelector("textarea").focus(); return 1`); await keycap(["⌘", "↵"]); await key("Enter", "Enter", 13, CMD);
    await step(2); const t = await waitAnswer(); await status(`Full answer in ${t}s`); await sleep(3500); await closeAnswer();
  });

demo("07-debug", "Debug mode (Claude Code CLI)",
  "Debug answers come from Claude Opus through your logged-in Claude Code CLI, for the best quality.",
  ["Choose <b>Debug</b>", "A stack trace is on the screen", "Press <b>⌘↵</b>", "Root cause · evidence · fix · before vs after · verify"],
  async () => {
    await showScreen("trace"); await step(0); await mode("Debug"); await sleep(800);
    await step(1); await sleep(1800);
    await step(2); await ev(`document.querySelector("textarea").focus(); return 1`); await keycap(["⌘", "↵"]); await key("Enter", "Enter", 13, CMD);
    await step(3); const t = await waitAnswer(240000); await status(`Full answer in ${t}s (Claude Opus)`); await scrollAnswer(10000); await closeAnswer(); await mode("Code");
  });

demo("08-design-mcq-language", "Design rounds, multiple choice, any language",
  "The same screenshot flow handles system design prompts, MCQs (correct option + why) and questions in Hindi or other languages.",
  ["<b>Design</b>: “Design a URL shortener” → full design answer", "<b>Concept</b>: an MCQ → the right option + one line why", "A question in Hindi → answer in Hindi"],
  async () => {
    await showScreen("design"); await step(0); await mode("Design"); await ev(`document.querySelector("textarea").focus(); return 1`); await keycap(["⌘", "↵"]); await key("Enter", "Enter", 13, CMD);
    let t = await waitAnswer(); await status(`Design answered in ${t}s`); await scrollAnswer(9000); await closeAnswer();
    await showScreen("mcq"); await step(1); await mode("Concept"); await ev(`document.querySelector("textarea").focus(); return 1`); await keycap(["⌘", "↵"]); await key("Enter", "Enter", 13, CMD);
    t = await waitAnswer(); await status(`MCQ answered in ${t}s`); await sleep(3500); await closeAnswer();
    await showScreen("s11_hindi"); await step(2); await ev(`document.querySelector("textarea").focus(); return 1`); await keycap(["⌘", "↵"]); await key("Enter", "Enter", 13, CMD);
    t = await waitAnswer(); await status(`Hindi answered in ${t}s`); await scrollAnswer(4000); await closeAnswer();
  });

demo("09-solve-screen", "Solve screen: ⌘⇧O watches and answers new questions",
  "Turn it on and Beast checks the screen every few seconds. Each new question is answered once, in the right mode.",
  ["Press <b>⌘⇧O</b> (or the Solve screen button)", "An MCQ appears → found and answered", "The screen changes to a coding problem → found too", "The same question is never answered twice", "Press <b>⌘⇧O</b> again to stop"],
  async () => {
    await showScreen("mcq"); await mode("Concept"); await ev(`document.activeElement?.blur(); return 1`);
    await step(0); await keycap(["⌘", "⇧", "O"]); await key("O", "KeyO", 79, CMD | SHIFT); await sleep(1500);
    await step(1); const t0 = Date.now();
    while (Date.now() - t0 < 90000) { if (await ev(`return /1 found|found 1|answered/i.test(document.body.innerText) || !!document.getElementById("answer-title")`)) break; await sleep(1000); }
    await waitAnswer(); await sleep(2500);
    await step(2); await showScreen("leetcode"); const t1 = Date.now();
    while (Date.now() - t1 < 120000) { if (await ev(`return /2 found/i.test(document.body.innerText)`)) break; await sleep(1000); }
    await waitAnswer(); await sleep(2500);
    await step(3); await sleep(6000);
    await step(4); await ev(`document.activeElement?.blur(); return 1`); await keycap(["⌘", "⇧", "O"]); await key("O", "KeyO", 79, CMD | SHIFT); await sleep(2000); await closeAnswer();
  });

demo("10-documents", "Documents: résumé, notes, PDFs, logs",
  "Attach files with 📎 (or drag and drop). Beast reads them and answers using them.",
  ["Click <b>📎</b> and pick a résumé PDF and notes", "They wait in the tray, each can get a note", "Ask: “Tell me about yourself”", "The answer uses your own résumé"],
  async () => {
    await mode("Concept"); await step(0); await click(icon("paperclip")); await sleep(600);
    await setFiles('input[type=file][accept^="image/*,application/pdf"]', [path.resolve("public/testdocs/resume.pdf"), path.resolve("public/testdocs/interview-notes.md")]);
    await ev(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); return 1`); await sleep(1500);
    await step(1); await sleep(2500);
    await step(2); await typeBar("Tell me about yourself in 5 lines, using my resume"); await enter();
    await step(3); const t = await waitAnswer(); await status(`Full answer in ${t}s`); await scrollAnswer(6000); await closeAnswer();
  });

demo("11-listen", "Listen + live transcript",
  "Listen hears the meeting and your mic, and answers questions as soon as they are asked. Here the questions are played from the laptop speaker into its own mic (the desktop app reads meeting audio directly).",
  ["Click <b>🎧 Listen</b> (or ⌘⇧M): “Listening…”", "The interviewer asks a question (spoken from the speakers)", "Beast hears it and the answer opens by itself", "Stop with ⌘⇧M · open <b>💬 Live transcript</b>, turn on the mic", "Each line: time · who spoke · text · auto-answer"],
  async () => {
    console.log("  mic:", await useBuiltInMic());
    // Speakers → the laptop's own mic is quiet: raise mic input + speaker volume while recording, restore after.
    const vol = execSync(`osascript -e 'get volume settings'`).toString();
    const inVol = +(vol.match(/input volume:(\d+)/)?.[1] ?? 44), outVol = +(vol.match(/output volume:(\d+)/)?.[1] ?? 75);
    execSync(`osascript -e 'set volume input volume 100' -e 'set volume output volume 90'`);
    try {
      await mode("Concept"); await step(0); await click(icon("headphones")); await sleep(4000);
      // Speakers → the laptop's own mic is much quieter than a real voice: repeat until it is heard.
      const heard = () => ev(`return /TCP|UDP/i.test(document.querySelector("[data-radix-scroll-area-viewport]")?.innerText||"") || /Generating response/.test(document.body.innerText)`);
      let ok = false;
      for (let a = 1; a <= 6 && !ok; a++) {
        await step(1); await status(`🔊 (laptop speaker${a > 1 ? `, try ${a}` : ""}) “What is the difference between TCP and UDP?”`);
        await say("What is the difference between TCP and UDP?");
        await step(2); const t0 = Date.now();
        while (Date.now() - t0 < 12000) { if (await heard()) { ok = true; break; } await sleep(500); }
      }
      if (ok) { lastAction = Date.now(); const t = await waitAnswer(); await status(`Heard it — answer finished ${t}s after it started`); await scrollAnswer(5000); }
      await step(3); await ev(`document.activeElement?.blur(); return 1`); await keycap(["⌘", "⇧", "M"]); await key("M", "KeyM", 77, CMD | SHIFT); await sleep(1500);
      await closeAnswer(); await click(icon("captions")); await sleep(1500);
      await click(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="You" && b.querySelector("svg.lucide-mic"))`); await sleep(3000);
      await step(4);
      for (let a = 1; a <= 3; a++) {
        await status(`🔊 (laptop speaker) “Can you explain what a load balancer does?”`); await say("Can you explain what a load balancer does?");
        const t1 = Date.now(); let got = false;
        while (Date.now() - t1 < 12000) { if (await ev(`return /load balanc/i.test(document.body.innerText)`)) { got = true; break; } await sleep(600); }
        if (got) break;
      }
      await sleep(7000);
      await click(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="You" && b.querySelector("svg.lucide-mic"))`); await sleep(1000);
    } finally { execSync(`osascript -e 'set volume input volume ${inVol}' -e 'set volume output volume ${outVol}'`); }
  });

demo("12-shortcuts-stop", "Shortcuts panel: test every shortcut, hide or quit",
  "The ⌨️ button lists every shortcut with what it does. Press one to see a green ✓, or use Try.",
  ["Open <b>⌨️ Shortcuts & controls</b>", "Press shortcuts: each row gets a ✓ and the time", "<b>Try</b> runs one, same as the keys", "<b>Stop Beast</b>: Hide (⌘\\) or Quit (asks first)", "Terminal commands, click to copy"],
  async () => {
    await step(0); await click(icon("keyboard")); await sleep(1800);
    await step(1); for (const [k, code, vk, label] of [["I", "KeyI", 73, "I"], ["\\", "Backslash", 220, "\\"], ["D", "KeyD", 68, "D"]]) {
      await ev(`document.activeElement?.blur(); return 1`); const shift = k !== "\\"; await keycap(shift ? ["⌘", "⇧", label] : ["⌘", label], 800); await key(k, code, vk, shift ? CMD | SHIFT : CMD); await sleep(700); }
    await ev(`document.activeElement?.blur(); return 1`); await keycap(["⌘", "→"], 800); await key("ArrowRight", "ArrowRight", 39, CMD); await sleep(900);
    await step(2); await click(`document.querySelector('[data-shortcut="focus_input"] button')`); await sleep(1200);
    await step(3); await ev(`document.querySelector('#shortcuts-panel .overflow-y-auto').scrollTo({top:9999,behavior:"smooth"}); return 1`); await sleep(1500);
    await click(`[...document.querySelectorAll('#shortcuts-panel button')].find(b=>/Quit Beast/.test(b.innerText))`); await sleep(1800);
    await click(btn("Cancel")); await sleep(600);
    await step(4); await click(`[...document.querySelectorAll('#shortcuts-panel code')][0].closest("button")`); await sleep(2500);
    await allDone(); await sleep(1500); await click(icon("keyboard"));
  });

// ---------- run ----------
const list = ONLY.length ? DEMOS.filter((d) => ONLY.some((o) => d.slug.startsWith(o))) : DEMOS;
const results = {};
for (const d of list) {
  const n = DEMOS.indexOf(d) + 1;
  console.log(`▶ ${d.slug}`);
  await fresh(); await stage(n, DEMOS.length, d.title, d.why, d.steps); await sleep(400);
  startRec(d.slug); await sleep(1800);
  try { await d.run(); await allDone(); await sleep(1600); } catch (e) { console.log("  ✖", e.message); }
  results[d.slug] = { ...(await stopRec()), title: d.title, why: d.why, steps: d.steps };
}
const metaFile = path.join(OUT, "demos.json");
const prev = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
fs.writeFileSync(metaFile, JSON.stringify({ ...prev, ...results }, null, 2));
fs.rmSync(path.join(OUT, ".frames"), { recursive: true, force: true });
await call("Emulation.clearDeviceMetricsOverride");
process.exit(0);
