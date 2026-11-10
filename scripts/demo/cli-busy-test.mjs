// Browser test: asking again while Claude (Code mode) is still busy must not fail
// with "Session ID … is already in use" — the new question runs as a side
// question in a fork of the session. Usage: node scripts/demo/cli-busy-test.mjs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tab = (await (await fetch("http://localhost:9333/json/list")).json()).find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await call("Runtime.evaluate", { expression: `(async()=>{${x}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };
const body = () => ev(`return document.body.innerText`);
const ask = async (q) => { await ev(`document.querySelector("#app-card textarea").focus(); return 1`); await call("Input.insertText", { text: q }); await ev(`document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,bubbles:true,cancelable:true})); return 1`); };
const waitDone = async (ms = 150000) => { const t = Date.now(); await sleep(1500); let last = -1, same = 0;
  while (Date.now() - t < ms) { const o = JSON.parse(await ev(`return JSON.stringify({g:/Generating response/.test(document.body.innerText), n:document.body.innerText.length})`)); if (!o.g && o.n === last) { if (++same >= 10) return; } else { same = 0; last = o.n; } await sleep(250); } };

await call("Page.reload"); await sleep(4500);
await ev(`const a=document.getElementById("auto-button"); if (a?.getAttribute("aria-pressed")==="true") a.click(); return 1`);
await ev(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="Code")?.click(); return 1`); await sleep(300);

// A running conversation: Q1 in Concept (Groq — no Claude session yet), then a
// Code question (opens the Claude session) and, while it is still writing, a
// follow-up sent from the follow-up box (Enter) — two calls on one session.
await ev(`document.getElementById("answer-close")?.click(); return 1`); await sleep(400);
await ev(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="Concept")?.click(); return 1`); await sleep(200);
await ask("What is a palindrome? One line.");
await waitDone();
await ev(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="Debug")?.click(); return 1`); await sleep(200);
await ask("My palindrome check returns False for 'Racecar'. Explain the likely bug in detail with a long fix and tests.");
for (let i = 0; i < 40 && !/Generating response/.test(await body()); i++) await sleep(250);
await sleep(3000);
const stillWorking = /Generating response/.test(await body());
// ⌘↵ (capture + send at once) while Opus is still answering — doesn't wait.
await ev(`window.__webtestEmit("custom-shortcut-triggered", { action: "screenshot_enter" }); return 1`);
await sleep(4000);
await waitDone();
const b2 = await body();
check("⌘↵ screenshot sent while Claude was still writing", stillWorking);
check("no 'Session ID … is already in use' error", !/already in use/i.test(b2), (b2.match(/Claude CLI error[^\n]*/) || [""])[0]);
check("the screenshot question was answered", /Root cause|Fix/i.test(b2) && !/Claude CLI error/i.test(b2));
// Later (everything finished): follow-ups keep working.
await sleep(20000);
await ask("Add type hints to it. Short.");
await waitDone();
const b3 = await body();
check("next follow-up works normally afterwards", !/already in use|Claude CLI error/i.test(b3) && /->|: str/.test(b3), (b3.match(/Claude CLI error[^\n]*/) || [""])[0]);
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
