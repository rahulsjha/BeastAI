// Real input test: key presses + mouse drag via CDP Input domain.
const tabs = await (await fetch("http://localhost:9333/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => (await call("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const META = 4, SHIFT = 8;
const key = async (k, code, vk, mods = 0) => { await call("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); };
const mouse = async (type, x, y, extra = {}) => call("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
const typeText = async (t) => call("Input.insertText", { text: t });
const overlayUp = () => ev(`return !![...document.body.children].find(e=>e.style?.zIndex==="2147483647")`);
const tray = () => ev(`return window.__tray ? __tray() : "(no runner)"`);
const answer = async (ms = 90000) => { const t0 = Date.now(); let last = "", st = Date.now();
  while (Date.now() - t0 < ms) { await sleep(500); const a = await ev(`return window.__T.answer()`); if (a !== last) { last = a; st = Date.now(); }
    if (a && !/Generating response/.test(a) && a.split("Asked:")[1]?.trim().length > 40 && Date.now() - st > 2500) break; }
  return { secs: ((Date.now() - t0) / 1000).toFixed(1), text: last.split("Asked:")[1]?.trim().slice(0, 400) }; };
const R = {};
await call("Page.bringToFront");
await ev(`location.reload()`); await sleep(6000);
await ev(`await import("/webtest-runner.js"); __T.mode("Concept"); await __T.sleep(400); const c=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="⚡ Short"); c?.click(); await __T.sleep(300); return 1`);
// --- Test A: ⌘⇧S + drag a region, typed question, Enter
await ev(`__T.ta().focus(); return 1`);
await key("S", "KeyS", 83, META | SHIFT); await sleep(2500);
R.A_overlay = await overlayUp();
await mouse("mousePressed", 40, 80); for (let i = 1; i <= 15; i++) { await mouse("mouseMoved", 40 + i * 38, 80 + i * 36); await sleep(30); } await mouse("mouseReleased", 610, 620); await sleep(1200);
R.A_overlayClosed = !(await overlayUp()); R.A_tray = await tray();
await ev(`__T.ta().focus(); return 1`); await typeText("In 2 lines: what app and what text is visible in this screenshot?"); await sleep(300);
await key("Enter", "Enter", 13); R.A_answer = await answer();
await ev(`await __T.newChat(); document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); return 1`); await sleep(800);
// --- Test B: Esc cancels
await key("Enter", "Enter", 13, META); await sleep(2500); R.B_overlay = await overlayUp();
await key("Escape", "Escape", 27); await sleep(800); R.B_cancelled = !(await overlayUp()); R.B_tray = await tray();
// --- Test C: ⌘↵ with typed text kept, double-click full screen, note, empty send
await ev(`__T.ta().focus(); return 1`); await typeText("Describe the right half of this screen in 2 lines.");
await key("Enter", "Enter", 13, META); await sleep(2500); R.C_overlay = await overlayUp();
R.C_textKept = await ev(`return __T.ta().value`); R.C_notSent = await ev(`return !__T.panel()`);
await mouse("mousePressed", 600, 300, { clickCount: 1 }); await mouse("mouseReleased", 600, 300, { clickCount: 1 });
await mouse("mousePressed", 600, 300, { clickCount: 2 }); await mouse("mouseReleased", 600, 300, { clickCount: 2 }); await sleep(1500);
R.C_tray = await tray();
await ev(`__T.ta().focus(); return 1`); await key("Enter", "Enter", 13); R.C_answer = await answer();
console.log(JSON.stringify(R, null, 1)); process.exit(0);
