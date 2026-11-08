// Tests continuing a conversation: 💻 again, follow-up text + screenshots + files,
// close, History → Continue, New. Usage: node scripts/demo/continue-conversation-test.mjs <outDir> <fileToAttach>
import fs from "node:fs";
const OUT = process.argv[2], FILE = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tab = (await (await fetch("http://localhost:9333/json/list")).json()).find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map(); ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await call("Runtime.evaluate", { expression: `(async()=>{${x}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (n) => { const r = await call("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.result.data, "base64")); };
const LOG = []; const ok = (n, p, d) => { LOG.push(`${p ? "✅" : "❌"} ${n} — ${JSON.stringify(d ?? "").slice(0, 220)}`); console.log(LOG.at(-1)); fs.writeFileSync(`${OUT}/log.txt`, LOG.join("\n")); };
const title = () => ev(`return document.getElementById("answer-title")?.innerText || ""`);
const turns = () => ev(`return document.querySelectorAll("#conversation-thread [data-turn]").length`);
const thumbs = () => ev(`return document.querySelectorAll('#conversation-thread img[alt="Earlier screenshot"]').length`);
const waitDone = async (ms = 120000) => { const t0 = Date.now(); await sleep(1500);
  // done = not "Generating", and the answer text unchanged for 2.5s (streaming + saving finished)
  let last = -1, same = 0;
  while (Date.now() - t0 < ms) {
    const st = await ev(`return JSON.stringify({g:/Generating response/.test(document.body.innerText), n:(document.body.innerText||"").length})`);
    const o = JSON.parse(st);
    if (!o.g && o.n === last) { if (++same >= 10) break; } else { same = 0; last = o.n; }
    await sleep(250);
  }
  return +((Date.now() - t0) / 1000).toFixed(1); };
const click = (sel) => ev(`const b=${sel}; b?.click(); return !!b`);
const btnText = (t) => `[...document.querySelectorAll("button")].find(b=>b.innerText.trim()===${JSON.stringify(t)})`;

await ev(`localStorage.removeItem("beast_conversations_v1"); localStorage.removeItem("pluely_qa_history"); location.reload()`); await sleep(6000);
await ev(`await import("/webtest-runner.js"); __T.mode("Concept"); return 1`); await sleep(400);

// 1. First question: 💻 with typed text
await ev(`__T.setText("In one short paragraph: what app is on this screen?"); return 1`);
// 💻 captures, then offers Send now / + Another screenshot / + Area / ✎ Add text
await click(`document.getElementById("screenshot-button")`); await sleep(3500);
await click(`[...document.querySelectorAll("#tray-actions button")].find(b=>/Send now/.test(b.innerText))`);
let s1 = await waitDone(); ok("Q1 💻 → Send now: screenshot + text answered", (await ev(`return __T.answer().length`)) > 80, { secs: s1, title: await title() });

// 2. 💻 again while the answer is open → continues (thread shows Q1 with thumbnail)
await ev(`__T.setText("Now name one icon you can see, in one line."); return 1`);
// ⌘↵ (capture + send at once) while the answer is open
await ev(`window.__webtestEmit("custom-shortcut-triggered", { action: "screenshot_enter" }); return 1`);
for (let i = 0; i < 40 && !(await ev(`return /Generating response/.test(document.body.innerText)`)); i++) await sleep(250);
s1 = await waitDone();
ok("Q2 ⌘↵ while the answer is open continues the same conversation (Q1 shown above with its screenshot)", (await turns()) === 1 && (await thumbs()) === 1 && /2 questions/.test(await title()), { turns: await turns(), thumbs: await thumbs(), title: await title(), secs: s1 });
await shot("01-thread-after-second-screenshot");

// 3. Follow-up box: + Screen and 📎 file, chips shown, then send typed text
await click(btnText("+ Screen")); await sleep(3500);
const doc = await call("DOM.getDocument", {}); const q = await call("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: 'input[type=file][multiple][accept^="image/*,.pdf"]' });
await call("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files: [FILE] }); await sleep(1500);
const chips = await ev(`return document.querySelectorAll("#followup-pending > span.relative").length`);
ok("Follow-up: + Screen and 📎 file both wait as chips under the answer", chips === 2, { chips });
await shot("02-followup-pending-screen-and-file");
await ev(`const i=document.getElementById("followup-input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"Using the screen and the attached log: what error is in the log, in one line?"); i.dispatchEvent(new Event("input",{bubbles:true})); return 1`);
await sleep(200);
await click(`document.getElementById("followup-send")`);
s1 = await waitDone();
const a3 = await ev(`return __T.answer()`);
ok("Q3 follow-up (typed text + screen + file) sent in the same conversation", /3 questions/.test(await title()) && (await turns()) === 2 && /KeyError|user_id/i.test(a3) && /Asked:\s*Using the screen and the attached log/.test(a3), { title: await title(), turns: await turns(), secs: s1 });
await shot("03-three-questions-thread");

// 4. Close (✕) ends it; History → Continue reopens with all 3
await click(`document.getElementById("answer-close")`); await sleep(800);
// (a hidden test tab never finishes the close animation, so check the panel's state, not the DOM)
const closed = !(await ev(`return !!document.getElementById("answer-title")?.closest('[data-state="open"]')`));
await click(`document.querySelector("svg.lucide-history").closest("button")`); await sleep(800);
const conts = await ev(`return document.querySelectorAll("[data-continue]").length`);
await shot("04-history-continue-buttons");
await click(`document.querySelector("[data-continue]")`); await sleep(1200);
ok("✕ closes; History → Continue reopens the thread with all 3 questions", closed && conts === 3 && (await turns()) === 3 && (await ev(`return document.activeElement?.id`)) === "followup-input", { closed, conts, turns: await turns(), focus: await ev(`return document.activeElement?.id`) });
await shot("05-continued-from-history");

// 5. Ask a 4th in the reopened conversation
await ev(`const i=document.getElementById("followup-input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"Summarise this whole conversation in one line."); i.dispatchEvent(new Event("input",{bubbles:true})); return 1`);
await click(`document.getElementById("followup-send")`);
s1 = await waitDone();
ok("Q4 asked in the reopened conversation", /4 questions/.test(await title()) && (await turns()) === 3, { title: await title(), secs: s1 });
await shot("06-fourth-question");

// 6. New → fresh conversation
await click(btnText("New")); await sleep(600);
await ev(`__T.setText("In one line: what is a queue?"); __T.enter(); return 1`); s1 = await waitDone();
ok("New starts a fresh conversation (no earlier questions shown)", (await turns()) === 0 && /AI Response/.test(await title()), { title: await title(), turns: await turns() });
await shot("07-new-conversation");
LOG.push(`DONE ${LOG.filter((l) => l.startsWith("✅")).length}/${LOG.length} passed`); fs.writeFileSync(`${OUT}/log.txt`, LOG.join("\n")); console.log(LOG.at(-1)); process.exit(0);
