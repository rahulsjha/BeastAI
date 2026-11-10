// Browser test: Code mode answers with Opus 5.5 (high), text streams in piece by
// piece, and you can scroll up while it is still generating (it doesn't yank you
// back to the bottom). Usage: node scripts/demo/stream-test.mjs
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
const vp = `document.getElementById("answer-title")?.closest("[data-radix-popper-content-wrapper]")?.querySelector("[data-radix-scroll-area-viewport]")`;

await call("Page.reload"); await sleep(4500);
await ev(`if (document.getElementById("history-panel")) document.querySelector("svg.lucide-history").closest("button").click(); return 1`); await sleep(300);
await ev(`document.getElementById("answer-close")?.click(); return 1`); await sleep(500);
await ev(`const a=document.getElementById("auto-button"); if (a?.getAttribute("aria-pressed")==="true") a.click(); return 1`);
await ev(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="Code")?.click(); return 1`); await sleep(300);
await ev(`document.querySelector("#app-card textarea").focus(); return 1`);
await call("Input.insertText", { text: "Implement an LRU cache in Python with get and put, with a long dry run." });
const t0 = Date.now();
await ev(`document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,bubbles:true,cancelable:true})); return 1`);
await sleep(800);
check("shows which model is answering", /Opus 5\.5 · high/.test(await ev(`return document.body.innerText`)));

let first = null, lengths = new Set(), scrolledUp = false, heldTop = null;
while (Date.now() - t0 < 120000) {
  const o = JSON.parse(await ev(`const v=${vp}; return JSON.stringify({gen:/Generating response/.test(document.body.innerText), len:(v?.innerText||"").length, top:v?.scrollTop||0, max:v?(v.scrollHeight-v.clientHeight):0})`));
  if (o.len > 400 && first === null) first = (Date.now() - t0) / 1000;
  if (o.gen) lengths.add(o.len);
  // Mid-answer: scroll to the top and see that it stays there while text keeps coming.
  if (first !== null && !scrolledUp && o.gen && o.max > 200) {
    await ev(`const v=${vp}; v.scrollTo({top:0,behavior:"instant"}); v.dispatchEvent(new Event("scroll")); return 1`);
    scrolledUp = true; await sleep(1500);
    heldTop = await ev(`return ${vp}.scrollTop`);
  }
  if (!o.gen && first !== null) break;
  await sleep(200);
}
check("answer text streams in piece by piece", lengths.size >= 4, `${lengths.size} growing steps, first text ~${first?.toFixed(1)}s`);
check("you can scroll up while it is still generating (no yank back)", scrolledUp && heldTop !== null && heldTop < 50, `scrollTop ${heldTop}`);
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
