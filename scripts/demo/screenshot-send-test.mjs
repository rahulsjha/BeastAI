const tabs = await (await fetch("http://localhost:9333/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => (await call("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const key = async (k, code, vk, mods = 0) => { await call("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); };
const mouse = (type, x, y) => call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
const drag = async () => { await mouse("mousePressed", 60, 60); for (let i = 1; i <= 10; i++) { await mouse("mouseMoved", 60 + i * 70, 60 + i * 30); await sleep(30); } await mouse("mouseReleased", 760, 360); };
const answer = async (ms = 90000) => { const t0 = Date.now(); let last = "", st = Date.now();
  while (Date.now() - t0 < ms) { await sleep(400); const a = await ev(`return window.__T.answer()`); if (a !== last) { last = a; st = Date.now(); }
    if (a && !/Generating response/.test(a) && a.split("Asked:")[1]?.trim().length > 40 && Date.now() - st > 2500) break; }
  return { secs: ((Date.now() - t0) / 1000).toFixed(1), text: (last.split("Asked:")[1] || "").trim().slice(0, 260) }; };
const R = {};
await call("Page.bringToFront"); await ev(`location.reload()`); await sleep(6000);
await ev(`await import("/webtest-runner.js"); __T.mode("Design"); await __T.sleep(300); __T.mode("Concept"); await __T.sleep(300); const c=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="⚡ Short"); c?.click(); return 1`);
// 1) ⌘↵ with typed text → capture → auto send → answer shown
await ev(`__T.ta().focus(); return 1`); await call("Input.insertText", { text: "What buttons are visible in this screenshot? 2 lines." });
await key("Enter", "Enter", 13, 4); await sleep(3000); await drag(); const t0 = Date.now();
R.one_overlays = await ev(`return [...document.body.children].filter(e=>e.style?.zIndex==="2147483647").length`);
await sleep(1500); R.one_trayAfter = await ev(`return __tray()`); R.one_panelOpen = await ev(`return !!__T.panel()`);
R.one_answer = await answer(); R.one_inputCleared = await ev(`return __T.ta().value === ""`);
await ev(`await __T.newChat(); return 1`); await sleep(800);
// 2) ⌘↵ with empty bar → default prompt
await key("Enter", "Enter", 13, 4); await sleep(3000); await drag(); await sleep(800);
R.two_answer = await answer();
await ev(`await __T.newChat(); return 1`); await sleep(800);
// 2b) click the 💻 button with the real mouse → capture → send → answer
const r = await ev(`const b=document.querySelector("svg.lucide-laptop-minimal")?.closest("button"); const q=b.getBoundingClientRect(); return [q.x+q.width/2, q.y+q.height/2]`);
await mouse("mousePressed", r[0], r[1]); await mouse("mouseReleased", r[0], r[1]); await sleep(3000);
R.btn_overlay = await ev(`return [...document.body.children].filter(e=>e.style?.zIndex==="2147483647").length`);
await drag(); await sleep(1500); R.btn_tray = await ev(`return __tray()`); R.btn_answer = await answer();
await ev(`await __T.newChat(); return 1`); await sleep(800);
// 3) ⌘⇧S only attaches (no send)
await key("S", "KeyS", 83, 4 | 8); await sleep(3000); await drag(); await sleep(2500);
R.three_tray = await ev(`return __tray()`); R.three_notSent = await ev(`return !__T.panel()`);
console.log(JSON.stringify(R, null, 1)); process.exit(0);
