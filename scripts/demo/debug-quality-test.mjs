import fs from "node:fs";
const S = process.argv[2]; const SC = `${S}/screens`; const OUT = `${S}/matrix.log`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = await (await fetch("http://localhost:9333/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map(); ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await call("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.result?.exceptionDetails) return "ERR " + JSON.stringify(r.result.exceptionDetails.exception?.description).slice(0, 200); return r.result?.result?.value; };
const L = []; const log = (m) => { L.push(m); fs.writeFileSync(OUT, L.join("\n")); };
const screen = (f) => fs.copyFileSync(`${SC}/${f}`, `${S}/screen.png`);
const mode = async (m, short) => ev(`__T.mode("${m}"); await __T.sleep(400); const c=[...document.querySelectorAll("button")].find(b=>/^(Full|⚡ Short)$/.test(b.textContent.trim())); if(c && ${short === undefined ? "false" : "true"} && (c.textContent.includes("Short")) !== ${!!short}) { c.click(); await __T.sleep(300);} return 1`);
const fresh = async () => ev(`await __T.newChat(); document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); [...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Clear all")?.click(); __T.setText(""); await __T.sleep(400); return 1`);
const type = (t) => ev(`__T.setText(${JSON.stringify(t)}); return 1`);
const cmdEnter = () => ev(`window.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",metaKey:true,bubbles:true})); return 1`);
const areaWhole = async () => { await ev(`window.dispatchEvent(new KeyboardEvent("keydown",{key:"S",metaKey:true,shiftKey:true,bubbles:true})); return 1`);
  for (let i = 0; i < 60 && !(await ev(`return !![...document.body.children].find(e=>e.style?.zIndex==="2147483647")`)); i++) await sleep(250);
  await sleep(300); await ev(`[...document.body.children].find(e=>e.style?.zIndex==="2147483647")?.dispatchEvent(new MouseEvent("dblclick",{bubbles:true})); return 1`);
  for (let i = 0; i < 40 && !/Screenshot/.test(await ev(`return __tray()`)); i++) await sleep(250); };
const answer = async (ms = 180000) => { const t0 = Date.now(); let last = "", st = Date.now(), first = null;
  while (Date.now() - t0 < ms) { await sleep(400); const a = (await ev(`return window.__T.answer()`)) || ""; const body = a.split("Asked:")[1] || "";
    if (first === null && body.replace(/Generating response\.\.\./, "").trim().length > 120) first = Date.now() - t0;
    if (a !== last) { last = a; st = Date.now(); } if (first !== null && !/Generating response/.test(a) && Date.now() - st > 3000) break; }
  const full = (last.split("Asked:")[1] || "").trim(); return { first: first && +(first / 1000).toFixed(1), total: +((Date.now() - t0 - 3000) / 1000).toFixed(1), full }; };
const ok = (id, pass, r, extra = "") => log(`${pass ? "✅" : "❌"} ${id} ${extra} [first ${r.first}s, total ${r.total}s] ${r.full.replace(/\s+/g, " ").slice(0, 170)}`);
await ev(`location.reload()`); await sleep(6000); await ev(`await import("/webtest-runner.js"); return 1`);

let r;
for (let k = 0; k < 2; k++) {
await fresh(); screen("s4_trace.png"); await mode("Debug"); await cmdEnter(); r = await answer();
ok(`D1.${k} Debug · KeyError screenshot (Opus)`, /KeyError/.test(r.full) && /Before vs After/i.test(r.full), r);
}
await fresh(); screen("s5_buggy.png"); await mode("Debug"); await type("Why does this never return?"); await cmdEnter(); r = await answer();
ok("D2 Debug · buggy binary search (Opus)", /lo = mid \+ 1|mid \+ 1/.test(r.full), r);
await fresh(); await areaWhole();
await ev(`const dt=new DataTransfer(); dt.setData("text/plain", ${JSON.stringify("Traceback (most recent call last):\n  File \"orders.py\", line 4, in total_by_customer\n    totals[o[\"customer\"]] += o[\"amount\"]\nKeyError: 'ana'\n".repeat(12))}); __T.ta().focus(); __T.ta().dispatchEvent(new ClipboardEvent("paste",{clipboardData:dt,bubbles:true,cancelable:true})); return 1`); await sleep(1500);
await ev(`__T.enter(); return 1`); r = await answer();
ok("D3 Debug · screenshot + pasted trace (Opus)", /Before vs After/i.test(r.full), r);
await fresh(); screen("s7_blank.png"); await cmdEnter(); r = await answer();
ok("D4 Debug · blank screen", /Not useful/i.test(r.full), r);
await fresh(); await mode("Code"); await type("Write a Python function to reverse a linked list."); await ev(`__T.enter(); return 1`); r = await answer();
ok("C1 Code typed question (Opus)", /def /.test(r.full), r);
await mode("Concept", false);
log("DONE " + L.filter((x) => x.startsWith("✅")).length + "/" + L.length);
process.exit(0);
