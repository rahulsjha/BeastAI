import { execSync } from "node:child_process";
import fs from "node:fs";
const OUT = process.argv[2]; const B = "http://localhost:9333";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ver = await (await fetch(`${B}/json/version`)).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r) => bws.addEventListener("open", r));
let bid = 0; const bp = new Map(); bws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } });
const bcall = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const PID = execSync(`ps -eo pid,args | grep -- "--remote-debugging-port=9333" | grep -v -- "--type=" | grep -v grep | awk '{print $1}' | head -1`).toString().trim();
const frontNow = () => { try { execSync(`osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is ${PID}) to true'`); } catch {} };
const front = () => { frontNow(); execSync("sleep 1.5"); frontNow(); };
const shot = (name) => { execSync(`screencapture -x "${OUT}/${name}.png"`); log("📸 " + name); };
const LOG = []; const log = (m) => { LOG.push(m); fs.writeFileSync(`${OUT}/log.txt`, LOG.join("\n")); };
// windows: app left, LeetCode right
const t2 = await bcall("Target.createTarget", { url: "http://localhost:1420/testdocs/leetcode.png", newWindow: true }); await sleep(1500);
const w2 = await bcall("Browser.getWindowForTarget", { targetId: t2.result.targetId });
await bcall("Browser.setWindowBounds", { windowId: w2.result.windowId, bounds: { left: 720, top: 30, width: 720, height: 840, windowState: "normal" } });
const tabs = await (await fetch(`${B}/json/list`)).json();
const tab = tabs.find((t) => t.type === "page" && t.url.includes("webtest=1"));
const w1 = await bcall("Browser.getWindowForTarget", { targetId: tab.id });
await bcall("Browser.setWindowBounds", { windowId: w1.result.windowId, bounds: { left: 0, top: 30, width: 720, height: 840, windowState: "normal" } });
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map(); ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await call("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const mouse = (type, x, y, n = 1) => call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: n });
const key = async (k, code, vk, mods = 0) => { await call("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); };
const CMD = 4, SHIFT = 8;
const overlay = () => ev(`return [...document.body.children].filter(e=>e.style?.zIndex==="2147483647").length`);
const tray = () => ev(`return __tray()`);
const answer = async (ms = 150000) => { const t0 = Date.now(); let last = "", st = Date.now();
  while (Date.now() - t0 < ms) { await sleep(400); const a = await ev(`return window.__T.answer()`); if (a !== last) { last = a; st = Date.now(); }
    if (a && !/Generating response/.test(a) && a.split("Asked:")[1]?.trim().length > 60 && Date.now() - st > 3000) break; }
  return { secs: +((Date.now() - t0) / 1000).toFixed(1), text: (last.split("Asked:")[1] || "").replace(/\s+/g, " ").trim().slice(0, 220) }; };
const R = {}; const ok = (name, pass, detail) => { R[name] = { pass, detail }; log(`${pass ? "✅" : "❌"} ${name} — ${JSON.stringify(detail).slice(0, 300)}`); };
const reset = async () => { await ev(`await __T.newChat(); document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); return 1`); await sleep(600); };

front(); await ev(`location.reload()`); await sleep(6000);
await ev(`await import("/webtest-runner.js"); __T.mode("Code"); return 1`); await sleep(500);
shot("00-setup-app-left-leetcode-right");

// C1: 💻 click + typed text → whole screen sent instantly, thumbnail, answer
front(); await ev(`__T.ta().focus(); return 1`); await call("Input.insertText", { text: "Solve the coding problem visible on screen, in Python." });
const b = await ev(`const q=document.querySelector("svg.lucide-laptop-minimal").closest("button").getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2]`);
await mouse("mousePressed", b[0], b[1]); await mouse("mouseReleased", b[0], b[1]); await sleep(2000);
const c1o = await overlay(), c1t = await ev(`return !!document.querySelector('img[alt="Sent screenshot"]')`);
shot("01-button-click-sent-with-thumbnail"); const c1 = await answer(); shot("02-button-click-answer");
ok("C1 💻 click = capture + send typed text + show answer", c1o === 0 && c1t && /def |class |stack/i.test(c1.text), { overlay: c1o, thumbnail: c1t, ...c1 });
await reset();

// C2: ⌘↵ with empty bar
front(); await key("Enter", "Enter", 13, CMD); await sleep(2000);
const c2t = await ev(`return !!document.querySelector('img[alt="Sent screenshot"]')`); const c2 = await answer(); shot("03-cmd-enter-empty-bar-answer");
ok("C2 ⌘↵ empty bar = capture + send + answer", c2t && c2.text.length > 60, { thumbnail: c2t, ...c2 });
await reset();

// C3: Enter in the bar sends text; Shift+Enter = new line; ⌘↵ in the bar doesn't send the text alone
front(); await ev(`__T.ta().focus(); return 1`); await call("Input.insertText", { text: "line one" });
await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r", modifiers: SHIFT }); await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: SHIFT });
await call("Input.insertText", { text: "line two" });
const c3v = await ev(`return __T.ta().value`); const c3notSent = await ev(`return !__T.panel()`);
ok("C3 Shift+Enter = new line (no send)", c3v.includes("\n") && c3notSent, { value: c3v });
await ev(`__T.setText(""); return 1`); await call("Input.insertText", { text: "In one line: what is a stack?" }); await key("Enter", "Enter", 13);
const c3a = await answer(); shot("04-enter-sends-typed-question");
ok("C3b Enter = send typed question", c3a.text.toLowerCase().includes("stack"), c3a);

// C4: ⌘K toggles conversation mode in the answer panel
front(); await key("k", "KeyK", 75, CMD); await sleep(800);
const c4 = await ev(`return /Conversation Mode/.test(document.body.innerText)`); shot("05-cmd-k-conversation-mode");
await key("k", "KeyK", 75, CMD); await sleep(600);
const c4off = await ev(`return !/Conversation Mode/.test(document.body.innerText)`);
ok("C4 ⌘K = conversation mode on/off", c4 && c4off, { on: c4, offAgain: c4off });
await reset();

// C5: ⌘⇧S → drag over the LeetCode window → attached only (not sent) → ✎ note → Enter
front(); await key("S", "KeyS", 83, CMD | SHIFT); await sleep(3000);
const c5o = await overlay();
const box = await ev(`const o=[...document.body.children].find(e=>e.style?.zIndex==="2147483647"); const v=o.querySelector("img"); const r=v.getBoundingClientRect(); const sc=Math.min(r.width/v.naturalWidth,r.height/v.naturalHeight); const w=v.naturalWidth*sc,h=v.naturalHeight*sc; const ox=r.left+(r.width-w)/2, oy=r.top+(r.height-h)/2; return [ox+w*0.52, oy+h*0.12, ox+w*0.98, oy+h*0.92]`);
await mouse("mousePressed", box[0], box[1]); for (let i = 1; i <= 12; i++) { await mouse("mouseMoved", box[0] + (box[2] - box[0]) * i / 12, box[1] + (box[3] - box[1]) * i / 12); await sleep(30); }
shot("06-cmd-shift-s-dragging-area"); await mouse("mouseReleased", box[2], box[3]); await sleep(1500);
const c5tray = await tray(); const c5notSent = await ev(`return !__T.panel()`); shot("07-cmd-shift-s-attached-in-tray");
ok("C5 ⌘⇧S = area select, attach only", c5o === 1 && /Screenshot/.test(c5tray) && c5notSent, { overlays: c5o, tray: c5tray });
await ev(`document.querySelector("svg.lucide-pencil").closest("button").click(); await __T.sleep(300); const i=document.querySelector('input[placeholder^="e.g."]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"this is the problem; reply with code only"); i.dispatchEvent(new Event("input",{bubbles:true})); await __T.sleep(200); [...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Save").click(); return 1`);
await sleep(600); shot("08-note-added"); await ev(`__T.ta().focus(); return 1`); await key("Enter", "Enter", 13);
const c5a = await answer(); shot("09-area-screenshot-answer");
ok("C5b area screenshot + note → answered", /def |class |return/.test(c5a.text), c5a);
await reset();

// C6: ⌘⇧S then Esc = cancel; ⌘⇧S double-click = whole screen
front(); await key("S", "KeyS", 83, CMD | SHIFT); await sleep(3000); await key("Escape", "Escape", 27); await sleep(1200);
const c6 = { overlayGone: (await overlay()) === 0, tray: await tray() };
ok("C6 ⌘⇧S then Esc = cancelled, nothing attached", c6.overlayGone && c6.tray === "(no tray)", c6);
front(); await key("S", "KeyS", 83, CMD | SHIFT); await sleep(3000);
await mouse("mousePressed", 400, 400, 1); await mouse("mouseReleased", 400, 400, 1); await mouse("mousePressed", 400, 400, 2); await mouse("mouseReleased", 400, 400, 2); await sleep(1500);
const c6b = await tray(); shot("10-double-click-whole-screen-attached");
ok("C6b ⌘⇧S double-click = whole screen attached", /Screenshot/.test(c6b), { tray: c6b });
await ev(`[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Clear all")?.click(); document.querySelector("svg.lucide-x")?.closest("button")?.click(); return 1`); await sleep(500);

// C7: ⌘⇧O = Solve screen on (one press = one toggle) … finds the LeetCode problem … ⌘⇧O = off
front(); await key("O", "KeyO", 79, CMD | SHIFT); await sleep(1500);
const c7on = await ev(`return [...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Stop")`); shot("11-cmd-shift-o-solve-screen-on");
const t7 = Date.now(); let found = false;
while (Date.now() - t7 < 90000) { await sleep(1500); front(); if (await ev(`return /1 found/.test(document.body.innerText)`)) { found = true; break; } }
shot("12-solve-screen-found-question"); const c7a = await answer(); shot("13-solve-screen-answer");
await key("O", "KeyO", 79, CMD | SHIFT); await sleep(1200);
const c7off = await ev(`return [...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Solve screen")`);
ok("C7 ⌘⇧O = Solve screen on → finds question → answers → ⌘⇧O off", c7on && found && c7off, { on: c7on, found, off: c7off, ...c7a });
await reset();

// C8: irrelevant screen → Not useful (LeetCode window closed)
await bcall("Target.closeTarget", { targetId: t2.result.targetId }); await sleep(800);
await ev(`[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Clear finished")?.click(); return 1`); await reset();
front(); await key("Enter", "Enter", 13, CMD); await sleep(1500); const c8 = await answer(); shot("14-not-useful-screen");
ok("C8 ⌘↵ on a screen with no question = Not useful", /Not useful/i.test(c8.text), c8);

// C9: ⌘⇧I focuses the question bar
front(); await ev(`document.activeElement?.blur(); return 1`); await key("I", "KeyI", 73, CMD | SHIFT); await sleep(500);
ok("C9 ⌘⇧I = cursor in the question bar", await ev(`return document.activeElement?.tagName === "TEXTAREA"`), {});
// C10: ⌘⇧A mic on/off
const micState = () => ev(`const b=document.querySelector("svg.lucide-mic, svg.lucide-mic-off")?.closest("button"); return (b?.className||"") + "|" + document.body.innerText.slice(0,200).split(String.fromCharCode(10)).join(" ")`);
const m0 = (await micState()) || ""; await key("A", "KeyA", 65, CMD | SHIFT); await sleep(2500); const m1 = (await micState()) || ""; shot("15-cmd-shift-a-mic-on");
await key("A", "KeyA", 65, CMD | SHIFT); await sleep(1500); const m2 = (await micState()) || "";
ok("C10 ⌘⇧A = mic on, again = off", m1 !== m0 && m2 !== m1, { before: m0.slice(0, 90), on: m1.slice(0, 160), after: m2.slice(0, 90) });
// C11: ⌘⇧M Listen on/off
await key("M", "KeyM", 77, CMD | SHIFT); await sleep(3500); const l1 = await ev(`return /Listening/.test(document.body.innerText)`); shot("16-cmd-shift-m-listen-on");
await key("M", "KeyM", 77, CMD | SHIFT); await sleep(2000); const l2 = await ev(`return !/Listening/.test(document.body.innerText)`);
ok("C11 ⌘⇧M = Listen on, again = off", l1 && l2, { on: l1, off: l2 });

fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(R, null, 1));
log("DONE " + Object.values(R).filter((x) => x.pass).length + "/" + Object.keys(R).length + " passed");
process.exit(0);
