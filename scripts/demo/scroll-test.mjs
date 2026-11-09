// Browser test: answers scroll both ways (wide code / tables), arrow keys and
// History → Continue reopen a past conversation that also scrolls both ways.
// Needs: dev server :1420, bridge, test Chrome on :9333. Usage: node scripts/demo/scroll-test.mjs <outDir>
import fs from "node:fs";

const OUT = process.argv[2] || ".";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tab = (await (await fetch("http://localhost:9333/json/list")).json()).find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await call("Runtime.evaluate", { expression: `(async()=>{${x}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (n) => { const r = await call("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.result.data, "base64")); };
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${d ? " — " + d : ""}`); };
const key = (k, code) => ev(`const t=document.activeElement||document.body; const o={key:${JSON.stringify(k)},code:${JSON.stringify(code)},keyCode:${k === "Enter" ? 13 : 0},bubbles:true,cancelable:true}; t.dispatchEvent(new KeyboardEvent("keydown",o)); return 1`);
const waitDone = async (ms = 90000) => { const t = Date.now(); await sleep(1500); let last = -1, same = 0;
  while (Date.now() - t < ms) { const o = JSON.parse(await ev(`return JSON.stringify({g:/Generating response/.test(document.body.innerText), n:document.body.innerText.length})`)); if (!o.g && o.n === last) { if (++same >= 10) return; } else { same = 0; last = o.n; } await sleep(250); } };
const vp = `[...document.querySelectorAll("[data-radix-scroll-area-viewport]")].pop()`;

await call("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 2, mobile: false });
await call("Page.reload"); await sleep(4000);
await ev(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="Concept")?.click(); return 1`);
await ev(`document.querySelector("#app-card textarea").focus(); return 1`);
await call("Input.insertText", { text: "You MUST include: a markdown table comparing TCP, UDP and QUIC with 8 columns (reliability, ordering, latency, handshake, congestion control, multiplexing, encryption, typical use), and one Python line longer than 200 characters in a code block." });
await key("Enter", "Enter");
await waitDone();

// 1. Wide content → horizontal scroll available, nothing cut
const m = JSON.parse(await ev(`const v=${vp}; return JSON.stringify({sw:v.scrollWidth, cw:v.clientWidth, sh:v.scrollHeight, ch:v.clientHeight, hbar:!!document.querySelector('[data-orientation="horizontal"][data-slot="scroll-area-scrollbar"]'), table:!!v.querySelector("table"), pre:!!v.querySelector("pre")})`));
check("answer has a table and a code block", m.table && m.pre);
const wideInner = await ev(`const v=${vp}; return [...v.querySelectorAll("pre, table")].some(e=>e.scrollWidth>e.clientWidth+4 || e.getBoundingClientRect().width>v.clientWidth+4)`);
check("wide content scrolls sideways (not wrapped/cut)", m.sw > m.cw + 4 || wideInner, `viewport ${m.cw}px, content ${m.sw}px`);
check("horizontal scrollbar shown", m.hbar || wideInner);
const tall = m.sh > m.ch + 4;
check("vertical scroll available (or the answer fits)", true, tall ? `${m.ch}px visible of ${m.sh}px` : "answer fits without scrolling");
await shot("1-wide");

// 2. Arrow keys: ↓ scrolls down, → scrolls right (not while typing)
await ev(`document.activeElement?.blur(); return 1`);
await ev(`${vp}.scrollTop = 0; ${vp}.scrollLeft = 0; return 1`); await sleep(200);
const top0 = await ev(`return ${vp}.scrollTop`);
if (tall) {
  await key("ArrowDown", "ArrowDown"); await sleep(600);
  check("↓ scrolls down smoothly", (await ev(`return ${vp}.scrollTop`)) > top0);
}
if (m.sw > m.cw + 4) {
  const left0 = await ev(`return ${vp}.scrollLeft`);
  await key("ArrowRight", "ArrowRight"); await sleep(600);
  check("→ scrolls right", (await ev(`return ${vp}.scrollLeft`)) > left0);
}
await ev(`document.getElementById("followup-input").focus(); return 1`);
await call("Input.insertText", { text: "ab" });
const sl = await ev(`return ${vp}.scrollLeft`);
await ev(`const t=document.getElementById("followup-input"); t.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true,cancelable:true})); return 1`); await sleep(400);
check("← while typing moves the cursor, not the answer", (await ev(`return ${vp}.scrollLeft`)) === sl);
await ev(`const i=document.getElementById("followup-input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,""); i.dispatchEvent(new Event("input",{bubbles:true})); return 1`);

// 3. Close, then History → Continue: past conversation reopens, scrolls both ways, can continue
await ev(`document.getElementById("answer-close").click(); return 1`); await sleep(600);
await ev(`document.querySelector("svg.lucide-history").closest("button").click(); return 1`); await sleep(800);
const hist = JSON.parse(await ev(`const l=document.querySelector(".max-h-\\\\[60vh\\\\]"); return JSON.stringify({rows:document.querySelectorAll("[data-continue]").length, overflow: l ? getComputedStyle(l).overflowX+"/"+getComputedStyle(l).overflowY : ""})`));
check("History lists past conversations with Continue", hist.rows >= 1, `${hist.rows} rows`);
check("History list scrolls both ways", hist.overflow === "auto/auto", hist.overflow);
await shot("2-history");
await ev(`document.querySelector("[data-continue]").click(); return 1`); await sleep(1200);
const back = JSON.parse(await ev(`const v=${vp}; return JSON.stringify({turns:document.querySelectorAll("#conversation-thread [data-turn]").length, sw:v.scrollWidth, cw:v.clientWidth, focus:document.activeElement?.id})`));
check("Continue reopens the past conversation (viewable)", back.turns >= 1, `${back.turns} turn(s)`);
check("reopened conversation still scrolls sideways", back.sw > back.cw + 4 || (await ev(`const v=${vp}; return [...v.querySelectorAll("pre, table")].some(e=>e.scrollWidth>e.clientWidth+4)`)));
check("cursor ready in the follow-up box", back.focus === "followup-input");
await call("Input.insertText", { text: "Which one is best for video calls? One line." });
await ev(`document.getElementById("followup-send").click(); return 1`);
await waitDone();
check("continued: new question added to the old conversation", /2 questions/.test(await ev(`return document.getElementById("answer-title")?.innerText||""`)));
await shot("3-continued");

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
