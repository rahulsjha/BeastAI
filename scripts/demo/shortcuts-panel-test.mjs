// Tests the ⌨️ Shortcuts & controls panel in the browser version (?webtest=1).
// Usage: node scripts/demo/shortcuts-panel-test.mjs <outDir>
import { execSync } from "node:child_process";
import fs from "node:fs";
const OUT = process.argv[2]; const B = "http://localhost:9333";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = await (await fetch(`${B}/json/list`)).json();
const tab = tabs.find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map(); ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await call("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const key = async (k, code, vk, mods = 0) => { await call("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); };
const CMD = 4, SHIFT = 8;
const shot = async (name) => { const r = await call("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, "base64")); };
const LOG = []; const ok = (n, p, d) => { LOG.push(`${p ? "✅" : "❌"} ${n} — ${JSON.stringify(d ?? "").slice(0, 200)}`); fs.writeFileSync(`${OUT}/log.txt`, LOG.join("\n")); };
const ticked = (sid) => ev(`return !!document.querySelector('[data-shortcut="${sid}"] .text-green-400')`);
const blur = () => ev(`document.activeElement?.blur(); return 1`);

await ev(`location.reload()`); await sleep(6000);
await ev(`document.querySelector("svg.lucide-keyboard").closest("button").click(); return 1`); await sleep(800);
const rows = await ev(`return [...document.querySelectorAll('#shortcuts-panel [data-shortcut]')].map(r=>r.dataset.shortcut+": "+r.querySelector('kbd').innerText)`);
ok("Panel opens from ⌨️ with every shortcut and its keys", rows?.length === 9, rows);
await shot("01-panel-open");

// Real key presses → ✓
await blur(); await key("I", "KeyI", 73, CMD | SHIFT); await sleep(500);
ok("⌘⇧I ticks 'Type a question' and focuses the bar", await ticked("focus_input") && await ev(`return document.activeElement?.tagName==="TEXTAREA"||document.activeElement?.tagName==="INPUT"`));
await blur(); await key("\\", "Backslash", 220, CMD); await sleep(300); ok("⌘\\ ticks 'Hide / show'", await ticked("toggle_window"));
await blur(); await key("D", "KeyD", 68, CMD | SHIFT); await sleep(300); ok("⌘⇧D ticks 'Dashboard'", await ticked("toggle_dashboard"));
await blur(); await key("ArrowRight", "ArrowRight", 39, CMD); await sleep(300); ok("⌘→ ticks 'Move the overlay'", await ticked("move_window"));
await blur(); await key("M", "KeyM", 77, CMD | SHIFT); await sleep(2500); const lOn = await ev(`return /Listen|listening/i.test(document.body.innerText)`);
await key("M", "KeyM", 77, CMD | SHIFT); await sleep(1500); ok("⌘⇧M ticks 'Listen' (on, then off)", await ticked("system_audio"), { on: lOn });
await blur(); await key("A", "KeyA", 65, CMD | SHIFT); await sleep(1500); await key("A", "KeyA", 65, CMD | SHIFT); await sleep(800); ok("⌘⇧A ticks 'Voice question'", await ticked("audio_recording"));
await blur(); await key("O", "KeyO", 79, CMD | SHIFT); await sleep(1500); await key("O", "KeyO", 79, CMD | SHIFT); await sleep(800); ok("⌘⇧O ticks 'Solve screen'", await ticked("solve_screen"));
await blur(); await key("S", "KeyS", 83, CMD | SHIFT); await sleep(3500); const pick = await ev(`return [...document.body.children].filter(e=>e.style?.zIndex==="2147483647").length`); await key("Escape", "Escape", 27); await sleep(1200); const gone = await ev(`return [...document.body.children].filter(e=>e.style?.zIndex==="2147483647").length===0`);
ok("⌘⇧S ticks 'Area screenshot', picker opens, Esc closes it", await ticked("screenshot") && pick === 1 && gone, { pick, gone });
await shot("02-keys-ticked");

// Try button (Screenshot & send, needs the bridge) — check the tick and that a screenshot was sent
await ev(`document.querySelector('[data-shortcut="screenshot_enter"] button').click(); return 1`); await sleep(4000);
ok("Try on 'Screenshot & send' ticks it and sends a screenshot", await ticked("screenshot_enter") && await ev(`return !!document.querySelector('img[alt="Sent screenshot"]')`));
const count = await ev(`return document.querySelector('#shortcuts-panel h3').nextElementSibling.innerText`);
ok("Counter shows 9/9", /9\/9/.test(count), count);

// Stop section
const cmds = await ev(`return [...document.querySelectorAll('#shortcuts-panel code')].map(c=>c.innerText)`);
ok("Stop commands listed", cmds?.length === 5 && cmds[0].includes('quit app "Beast"'), cmds);
await ev(`[...document.querySelectorAll('#shortcuts-panel button')].find(b=>/Quit Beast/.test(b.innerText)).click(); return 1`); await sleep(400);
const confirm = await ev(`return [...document.querySelectorAll('#shortcuts-panel button')].map(b=>b.innerText).filter(t=>/Yes, quit|Cancel/.test(t))`);
ok("Quit asks to confirm first (Yes / Cancel)", confirm?.length === 2, confirm);
await shot("03-quit-confirm");
await ev(`[...document.querySelectorAll('#shortcuts-panel button')].find(b=>b.innerText==="Cancel").click(); return 1`);
await ev(`document.querySelector('#shortcuts-panel').scrollIntoView(); document.querySelector('#shortcuts-panel .overflow-y-auto').scrollTop=9999; return 1`); await sleep(300);
await shot("04-stop-section");
LOG.push(`DONE ${LOG.filter((l) => l.startsWith("✅")).length}/${LOG.length} passed`); fs.writeFileSync(`${OUT}/log.txt`, LOG.join("\n"));
console.log(LOG.join("\n")); process.exit(0);
