import fs from "node:fs";
const S = process.argv[2]; const SC = `${S}/screens`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = await (await fetch("http://localhost:9333/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map(); ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await call("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true, userGesture: true }); return r.result?.exceptionDetails ? "ERR " + r.result.exceptionDetails.exception?.description?.slice(0, 200) : r.result?.result?.value; };
const screen = (f) => fs.copyFileSync(`${SC}/${f}`, `${S}/screen.png`);
const L = []; const log = (m) => { L.push(m); console.log(m); };
const click = (label, scope = "document") => ev(`const b=[...${scope}.querySelectorAll("button")].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)})); if(!b) return "no button "+${JSON.stringify(label)}; b.click(); return "ok"`);
const footer = `(document.querySelector('input[aria-label="Follow-up question"]')?.parentElement)`;
const answer = async (prevLen = 0, ms = 180000) => { const t0 = Date.now(); let last = "", st = Date.now(), first = null;
  while (Date.now() - t0 < ms) { await sleep(400); const a = (await ev(`return window.__T.answer()`)) || ""; const body = a.split("Asked:").slice(-1)[0] || "";
    if (first === null && !/Generating response/.test(a) && body.trim().length > 120) first = Date.now() - t0;
    if (a !== last) { last = a; st = Date.now(); } if (first !== null && !/Generating response/.test(a) && Date.now() - st > 3000) break; }
  return { first: first && +(first / 1000).toFixed(1), total: +((Date.now() - t0 - 3000) / 1000).toFixed(1), text: (last.split("Asked:").slice(-1)[0] || "").replace(/\s+/g, " ").trim() }; };
const hist = () => ev(`const b=document.querySelector("textarea")?.parentElement?.querySelector("button"); return b?.textContent.trim()`);
const ok = (name, pass, r, extra = "") => log(`${pass ? "✅" : "❌"} ${name} ${extra} [first ${r.first}s, total ${r.total}s] ${r.text.slice(0, 190)}`);

await ev(`location.reload()`); await sleep(6000); await ev(`await import("/webtest-runner.js"); __T.mode("Code"); return 1`); await sleep(500);
// F1: question over two screens → + Screen, + Screen, Send 2
screen("s1_leetcode.png");
await ev(`window.dispatchEvent(new KeyboardEvent("keydown",{key:"S",metaKey:true,shiftKey:true,bubbles:true})); return 1`);
for (let i = 0; i < 40 && !(await ev(`return !![...document.body.children].find(e=>e.style?.zIndex==="2147483647")`)); i++) await sleep(250);
await sleep(300); await ev(`[...document.body.children].find(e=>e.style?.zIndex==="2147483647")?.dispatchEvent(new MouseEvent("dblclick",{bubbles:true})); return 1`); log("⌘⇧S double-click #1");
for (let i = 0; i < 20 && !/Screenshot/.test(await ev(`return __tray()`)); i++) await sleep(300);
screen("s5_buggy.png"); log("+Screen #2: " + (await click("+ Screen")));
for (let i = 0; i < 20 && ((await ev(`return __tray()`)).match(/Screenshot/g) || []).length < 2; i++) await sleep(300);
const tray = await ev(`return __tray()`); log("tray: " + tray);
log("Send: " + (await click("Send 2"))); let r = await answer();
ok("F1 two screens in one question (+ Screen ×2 → Send 2)", /parenthes|bracket/i.test(r.text) && /binary|mid/i.test(r.text), r, `| tray had ${(tray.match(/Screenshot/g) || []).length}`);
const h1 = await hist();
// F2: text follow-up from the answer box
await ev(`const i=document.querySelector('input[aria-label="Follow-up question"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"Now give only the time and space complexity of both, in one line each."); i.dispatchEvent(new Event("input",{bubbles:true})); return 1`);
log("Send follow-up: " + (await click("Send", footer))); r = await answer();
ok("F2 text follow-up (same conversation)", /O\(n\)|O\(log n\)|O\(1\)/i.test(r.text), r, `| thread badge ${h1} → ${await hist()}`);
// F3: follow-up with a new screenshot from the answer box
screen("s2_mcq.png"); log("+Screen in answer: " + (await click("+ Screen", footer)));
for (let i = 0; i < 20 && !/Screenshot/.test(await ev(`return __tray()`)); i++) await sleep(300);
await ev(`const i=document.querySelector('input[aria-label="Follow-up question"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"And this one?"); i.dispatchEvent(new Event("input",{bubbles:true})); return 1`);
log("Send (1): " + (await click("Send", footer))); r = await answer();
ok("F3 follow-up with a new screenshot", /opcode|operation code|\bA\b/i.test(r.text), r, `| thread badge → ${await hist()}`);
// F4: Debug (Opus) + follow-up in the same conversation
await ev(`await __T.newChat(); __T.mode("Debug"); return 1`); await sleep(600);
screen("s4_trace.png"); await ev(`window.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",metaKey:true,bubbles:true})); return 1`); r = await answer();
ok("F4a Debug screenshot (Opus)", /KeyError/.test(r.text) && /Before vs After/i.test(r.text), r);
await ev(`const i=document.querySelector('input[aria-label="Follow-up question"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"Give the full fixed file using defaultdict."); i.dispatchEvent(new Event("input",{bubbles:true})); return 1`);
await click("Send", footer); r = await answer();
ok("F4b Debug follow-up (Opus keeps context)", /defaultdict/.test(r.text) && /total_by_customer/.test(r.text), r);
log("DONE " + L.filter((x) => x.startsWith("✅")).length + "/" + L.filter((x) => /^[✅❌]/.test(x)).length);
process.exit(0);
