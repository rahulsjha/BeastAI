// Browser test: resizable answer panel, voice follow-up button, History by
// conversation (Continue / 📸 / 🎤 / delete with confirm, older-than-7-days, clear all).
// Needs: dev server :1420, bridge, test Chrome on :9333 (mic allowed).
// Usage: node scripts/demo/conversation-tools-test.mjs <outDir>
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
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(js)) return true; await sleep(250); } return false; };
const waitDone = async (ms = 90000) => { const t = Date.now(); await sleep(1500); let last = -1, same = 0;
  while (Date.now() - t < ms) { const o = JSON.parse(await ev(`return JSON.stringify({g:/Generating response/.test(document.body.innerText), n:document.body.innerText.length})`)); if (!o.g && o.n === last) { if (++same >= 10) return; } else { same = 0; last = o.n; } await sleep(250); } };
const ask = async (q) => { await ev(`document.querySelector("#app-card textarea").focus(); return 1`); await call("Input.insertText", { text: q }); await ev(`document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,bubbles:true,cancelable:true})); return 1`); await waitDone(); };
const openAnswer = `document.getElementById("answer-title")?.closest('[data-state="open"]')`;

await call("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 2, mobile: false });
// Seed: one conversation from 10 days ago (for "older than 7 days"), then a fresh start.
await ev(`localStorage.removeItem("beast_conversations_v1"); localStorage.removeItem("beast_panel_height");
  const old = Date.now() - 10*86400000;
  localStorage.setItem("pluely_qa_history", JSON.stringify([{id:"old-1", conversationId:"conv-old", question:"Old question from last week", answer:"Old answer.", mode:"conceptual", at: old}]));
  location.reload(); return 1`).catch(() => {});
await sleep(5000);
await ev(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="Concept")?.click(); return 1`);
// Pause Auto so room noise can't add questions to the test conversations.
await sleep(1500);
await ev(`const a=document.getElementById("auto-button"); if (a?.getAttribute("aria-pressed")==="true") a.click(); return 1`); await sleep(800);
const openHistory = () => ev(`if (!document.getElementById("history-panel")) document.querySelector("svg.lucide-history").closest("button").click(); return 1`);

// 1. A conversation with two questions
await ask("What is a mutex? One line.");
await ask("And a semaphore? One line.");
check("conversation has 2 questions", /2 questions/.test(await ev(`return document.getElementById("answer-title")?.innerText||""`)));

// 2. Resizable + movable panel
const h0 = Number(await ev(`return document.getElementById("panel-resize").getAttribute("aria-valuenow")`));
await ev(`const h=document.getElementById("panel-resize"); const r=h.getBoundingClientRect();
  h.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,screenY:500,clientY:r.top}));
  window.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,screenY:700}));
  await new Promise(r=>setTimeout(r,120));
  window.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,screenY:700})); return 1`);
await sleep(300);
const h1 = Number(await ev(`return document.getElementById("panel-resize").getAttribute("aria-valuenow")`));
check("dragging the bottom edge makes the panel taller (remembered)", h1 > h0 && Number(await ev(`return localStorage.getItem("beast_panel_height")`)) === h1, `${h0}px → ${h1}px`);
await ev(`document.getElementById("panel-size").click(); return 1`); await sleep(200);
const h2 = Number(await ev(`return document.getElementById("panel-resize").getAttribute("aria-valuenow")`));
check("⤢ toggles full height / normal", h2 !== h1, `${h1}px → ${h2}px`);
await ev(`document.getElementById("panel-size").click(); return 1`);
check("title bar is a drag area (move Beast)", !!(await ev(`return !!document.getElementById("answer-title").closest('[data-tauri-drag-region="true"]')`)));
await shot("1-panel");

// 3. Voice follow-up button (pauses Auto while listening)
await ev(`document.getElementById("auto-button").click(); return 1`); await sleep(2500); // Auto on for the pause/resume check
const autoBefore = await ev(`return document.getElementById("auto-button")?.getAttribute("aria-pressed")`);
await ev(`document.getElementById("followup-voice").click(); return 1`);
check("🎤 in the follow-up box starts a voice follow-up", await waitFor(`return !!document.querySelector("#followup-voice svg.animate-pulse, #followup-voice .animate-pulse, #followup-voice [class*='bg-red'], #followup-voice [class*='bg-green']") || document.querySelector("#followup-voice")?.tagName==="DIV"`, 5000));
check("Auto pauses while you dictate", autoBefore !== "true" || (await waitFor(`return document.getElementById("auto-button")?.getAttribute("aria-pressed")==="false"`, 5000)));
await shot("2-voice");
await ev(`document.querySelector("#followup-voice button")?.click(); return 1`); await sleep(800);
check("Auto resumes after the voice follow-up", autoBefore !== "true" || (await waitFor(`return document.getElementById("auto-button")?.getAttribute("aria-pressed")==="true"`, 8000)));
await ev(`const a=document.getElementById("auto-button"); if (a?.getAttribute("aria-pressed")==="true") a.click(); return 1`); await sleep(800);

// 4. History by conversation
await ev(`document.getElementById("answer-close").click(); return 1`); await sleep(600);
await openHistory(); await sleep(700);
const convs = await ev(`return document.querySelectorAll("#history-panel [data-conversation]").length`);
check("History shows conversations (not single answers)", convs === 2, `${convs} conversations`);
check("each row has Continue · 📸 · 🎤 · 🗑", !!(await ev(`const r=document.querySelector("#history-panel [data-conversation]"); return !!(r.querySelector("[data-continue]") && r.querySelector("[data-continue-screen]") && r.querySelector("[data-continue-voice]") && r.querySelector("[data-delete]"))`)));
check("2-question conversation shows '2 Q'", /2 Q/.test(await ev(`return document.querySelector("#history-panel [data-conversation]").innerText`)));
await ev(`document.querySelector("#history-panel [data-conversation] > div").click(); return 1`); await sleep(400);
check("opening a row shows every Q&A of that conversation", /Q1[\s\S]*Q2/.test(await ev(`return document.querySelector("#history-panel [data-conversation]").innerText`)));
await shot("3-history");

// 5. 📸 from History: reopens the conversation with a screenshot waiting
await ev(`document.querySelector("#history-panel [data-conversation] [data-continue-screen]").click(); return 1`);
check("📸 reopens it with a screenshot waiting to send", await waitFor(`return !!${openAnswer} && document.querySelectorAll("#followup-pending img").length===1`, 10000));
check("reopened conversation keeps its earlier questions", (await ev(`return document.querySelectorAll("#conversation-thread [data-turn]").length`)) === 2);
await ev(`document.getElementById("followup-input").focus(); return 1`);
await call("Input.insertText", { text: "What is on this screen? One line." });
await ev(`document.getElementById("followup-send").click(); return 1`); await waitDone();
check("question + screenshot added to the old conversation", /3 questions/.test(await ev(`return document.getElementById("answer-title")?.innerText||""`)));

// 6. 🎤 from History: reopens and starts listening
await ev(`document.getElementById("answer-close").click(); return 1`); await sleep(600);
await openHistory(); await sleep(700);
await ev(`document.querySelector("#history-panel [data-conversation] [data-continue-voice]").click(); return 1`);
check("🎤 reopens it and starts a voice follow-up", await waitFor(`return !!${openAnswer} && document.querySelector("#followup-voice")?.tagName==="DIV"`, 8000));
await ev(`document.querySelector("#followup-voice button")?.click(); return 1`); await sleep(600);

// 7. Delete: one conversation (asks first), older than 7 days, clear all
await ev(`document.getElementById("answer-close").click(); return 1`); await sleep(600);
await openHistory(); await sleep(700);
await ev(`document.querySelector("#history-panel [data-conversation] [data-delete]").click(); return 1`); await sleep(200);
check("🗑 asks before deleting", /Delete this conversation/.test(await ev(`return document.getElementById("history-panel").innerText`)) && (await ev(`return document.querySelectorAll("#history-panel [data-conversation]").length`)) === 2);
await shot("4-delete-confirm");
await ev(`[...document.querySelectorAll("#history-panel [data-confirm='yes']")].pop().click(); return 1`); await sleep(300);
check("Yes → that conversation is gone", (await ev(`return document.querySelectorAll("#history-panel [data-conversation]").length`)) === 1);
await ev(`document.getElementById("delete-old").click(); return 1`); await sleep(200);
await ev(`[...document.querySelectorAll("#history-panel [data-confirm='yes']")].pop().click(); return 1`); await sleep(300);
check("'Older than 7 days' removes last week's conversation", (await ev(`return document.querySelectorAll("#history-panel [data-conversation]").length`)) === 0 && !(await ev(`return document.getElementById("history-panel").innerText.includes("Old question from last week")`)));
await ev(`if (document.getElementById("history-panel")) document.querySelector("svg.lucide-history").closest("button").click(); return 1`); await sleep(300);
await ask("What is DNS? One line.");
await ev(`document.getElementById("answer-close").click(); return 1`); await sleep(500);
await openHistory(); await sleep(600);
await ev(`document.getElementById("delete-all").click(); return 1`); await sleep(200);
check("Clear all asks first", /Delete all 1 conversation/.test(await ev(`return document.getElementById("history-panel").innerText`)));
await ev(`[...document.querySelectorAll("#history-panel [data-confirm='yes']")].pop().click(); return 1`); await sleep(300);
check("Clear all → empty", /Your conversations will appear here/.test(await ev(`return document.getElementById("history-panel").innerText`)));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
