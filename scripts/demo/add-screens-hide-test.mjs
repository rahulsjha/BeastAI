// Browser test: keep adding screenshots to one conversation (⌘⇧↵ and + Screen),
// send them together, then the 👁 hide/quit menu.
// Needs: dev server :1420, bridge with PLUELY_TEST_SCREEN, test Chrome on :9333.
// Usage: node scripts/demo/add-screens-hide-test.mjs <outDir>
import fs from "node:fs";

const OUT = process.argv[2] || ".";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = await (await fetch("http://localhost:9333/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await call("Runtime.evaluate", { expression: `(async()=>{${x}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => { const r = await call("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, "base64")); };
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`); };
const key = (k, code, vk, mods) => ev(`const t=document.activeElement||document.body; const o={key:${JSON.stringify(k)},code:${JSON.stringify(code)},keyCode:${vk},which:${vk},metaKey:${!!(mods & 4)},shiftKey:${!!(mods & 8)},ctrlKey:${!!(mods & 2)},bubbles:true,cancelable:true}; t.dispatchEvent(new KeyboardEvent("keydown",o)); t.dispatchEvent(new KeyboardEvent("keyup",o)); return 1`);
const chipsNow = () => ev(`return document.querySelectorAll("#followup-pending img").length`);
const waitChips = async (n) => { const t = Date.now(); while (Date.now() - t < 10000) { if ((await chipsNow()) >= n) return; await sleep(250); } };
const waitDone = async (ms = 60000) => { const t = Date.now(); await sleep(800); while (Date.now() - t < ms) { if (await ev(`return !document.body.innerText.includes("Generating response")`)) return true; await sleep(400); } return false; };

await call("Emulation.setDeviceMetricsOverride", { width: 760, height: 900, deviceScaleFactor: 2, mobile: false });
await call("Page.reload"); await sleep(4000);

// 1. Ask something to open a conversation
await ev(`const b=[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="Concept"); b?.click(); return 1`);
await ev(`document.querySelector("textarea").focus(); return 1`);
await call("Input.insertText", { text: "What is a hash map? One line." }); await sleep(300);
await key("Enter", "Enter", 13, 0);
await sleep(1500);
check("answer opens", (await waitDone()) && !!(await ev(`return document.getElementById("answer-title")?.innerText`)), "");

// 2. ⌘⇧↵ twice + "+ Screen" once: three screens queued, nothing sent
const asked = () => ev(`return document.querySelectorAll("#conversation-thread [data-turn]").length`);
const before = await asked();
await ev(`document.activeElement?.blur(); return 1`);
const t0 = Date.now();
await key("Enter", "Enter", 13, 4 | 8); await waitChips(1);
const t1 = Date.now();
await key("Enter", "Enter", 13, 4 | 8); await waitChips(2);
await ev(`[...document.querySelectorAll("#followup-hint ~ div button")].find(b=>b.innerText.trim()==="+ Screen")?.click(); return 1`); await waitChips(3);
console.log(`   each capture ≈ ${((t1 - t0) / 1000).toFixed(1)}s`);
const chips = await ev(`return document.querySelectorAll("#followup-pending img").length`);
check("3 screenshots queued in the follow-up (2× ⌘⇧↵ + 1× + Screen)", chips === 3, `${chips} chips`);
check("nothing sent yet", (await asked()) === before);
check("hint shown", !!(await ev(`return document.getElementById("followup-hint")?.innerText.includes("⌘⇧↵")`)));
await shot("1-queued");

// 3. Send them together with a question
await ev(`document.getElementById("followup-input").focus(); return 1`);
await call("Input.insertText", { text: "What problem is on these screens? One line." }); await sleep(300);
await ev(`document.getElementById("followup-send").click(); return 1`);
const done = await waitDone();
const title = await ev(`return document.getElementById("answer-title")?.innerText`);
check("follow-up answered in the same conversation", done && /Conversation/.test(title || ""), title);
const thumbs = await ev(`const q=[...document.querySelectorAll("#conversation-thread [data-turn]")].pop(); return document.querySelectorAll("img[alt='Sent screenshot'], img[alt='Earlier screenshot']").length`);
check("sent screenshots shown in the thread", thumbs >= 3, `${thumbs} thumbnails`);
check("tray empty after send", (await ev(`return document.querySelectorAll("#followup-pending img").length`)) === 0);
await shot("2-sent");

// 4. Hide / quit menu
await ev(`document.getElementById("hide-button").click(); return 1`); await sleep(400);
const menu = await ev(`return document.getElementById("hide-menu").innerText`);
check("hide menu shows Hide now, 1/5/15 min, Quit", /Hide now/.test(menu) && /1 min/.test(menu) && /5 min/.test(menu) && /15 min/.test(menu) && /Quit Beast/.test(menu));
await shot("3-hide-menu");
await ev(`document.querySelector('[data-hide="quit"]').click(); return 1`); await sleep(300);
check("Quit asks to confirm", /Quit Beast\?/.test(await ev(`return document.getElementById("hide-menu").innerText`)));
await shot("4-quit-confirm");

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
