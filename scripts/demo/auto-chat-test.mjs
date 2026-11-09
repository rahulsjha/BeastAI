// Browser test for the "one Auto switch + chat thread + screenshot options" redesign.
// Needs: dev server :1420, bridge with PLUELY_TEST_SCREEN, test Chrome on :9333
// started with --use-fake-ui-for-media-stream (mic allowed).
// Usage: node scripts/demo/auto-chat-test.mjs <outDir>
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
// Key events dispatched inside the page (works even when the test window is not focused).
const key = (k, code, mods = 0) => ev(`const t=document.activeElement||document.body; const o={key:${JSON.stringify(k)},code:${JSON.stringify(code)},keyCode:${k === "Enter" ? 13 : 0},metaKey:${!!(mods & 4)},shiftKey:${!!(mods & 8)},bubbles:true,cancelable:true}; t.dispatchEvent(new KeyboardEvent("keydown",o)); t.dispatchEvent(new KeyboardEvent("keyup",o)); return 1`);
const typeInBar = async (text) => { await ev(`document.querySelector("#app-card textarea").focus(); return 1`); await call("Input.insertText", { text }); await sleep(200); };
const waitFor = async (js, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(js)) return true; await sleep(250); } return false; };
const waitDone = async (ms = 90000) => {
  await sleep(800);
  if (!(await waitFor(`return !document.body.innerText.includes("Generating response")`, ms))) return false;
  // Streaming: done once the answer text stops changing for 2s.
  let last = -1, same = 0; const t = Date.now();
  while (Date.now() - t < ms) {
    const n = await ev(`return ([...document.querySelectorAll("[data-radix-scroll-area-viewport]")].pop()?.innerText||"").length`);
    if (n === last) { if (++same >= 8) return true; } else { same = 0; last = n; }
    await sleep(250);
  }
  return false;
};
const mode = (name) => ev(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()===${JSON.stringify(name)})?.click(); return 1`);
const latestAnswer = () => ev(`const sa=[...document.querySelectorAll("[data-radix-scroll-area-viewport]")].pop(); const t=sa?.innerText||""; const i=t.lastIndexOf("Asked:"); return i>=0?t.slice(i):t`);

await call("Emulation.setDeviceMetricsOverride", { width: 760, height: 1000, deviceScaleFactor: 2, mobile: false });
await call("Page.reload"); await sleep(3500);

// 1. One Auto switch, on at start; no separate Listen / Mic buttons
check("Auto switch is on at start", await waitFor(`return document.getElementById("auto-button")?.getAttribute("aria-pressed")==="true"`, 8000));
check("Auto status line shown", !!(await ev(`return document.getElementById("auto-status")?.innerText`)));
check("no separate 🎧 Listen / 🎤 Mic buttons", !(await ev(`return !!document.querySelector("#app-card svg.lucide-headphones") || !!document.querySelector("#app-card svg.lucide-mic")`)));
await shot("1-auto-on");

// 2. ⌘⇧M pauses and resumes Auto
await ev(`document.activeElement?.blur(); return 1`);
await key("M", "KeyM", 4 | 8);
check("⌘⇧M pauses Auto", await waitFor(`return document.getElementById("auto-button")?.getAttribute("aria-pressed")==="false"`, 5000));
await key("M", "KeyM", 4 | 8);
check("⌘⇧M resumes Auto", await waitFor(`return document.getElementById("auto-button")?.getAttribute("aria-pressed")==="true"`, 8000));

// 3. 💻 click → options card (nothing sent yet)
await mode("Code");
await ev(`document.getElementById("screenshot-button").click(); return 1`);
check("💻 shows 'screenshot ready' options card", await waitFor(`return /1 screenshot ready/.test(document.getElementById("attachment-tray")?.innerText||"")`));
const actions = await ev(`return document.getElementById("tray-actions")?.innerText||""`);
check("options: Send now · + Another screenshot · + Area · ✎ Add text", ["Send now", "Another screenshot", "+ Area", "Add text"].every((w) => actions.includes(w)), actions.replace(/\n/g, " · "));
check("nothing sent yet", !(await ev(`return !!document.getElementById("answer-title")`)));
await ev(`[...document.querySelectorAll("#tray-actions button")].find(b=>/Another screenshot/.test(b.innerText)).click(); return 1`);
check("+ Another screenshot → 2 ready", await waitFor(`return /2 screenshots ready/.test(document.getElementById("attachment-tray")?.innerText||"")`));
await ev(`[...document.querySelectorAll("#tray-actions button")].find(b=>/Add text/.test(b.innerText)).click(); return 1`);
check("✎ Add text puts the cursor in the question bar", !!(await ev(`return document.activeElement?.tagName==="TEXTAREA"`)));
await shot("2-options");
await call("Input.insertText", { text: "What problem is this? One line." }); await sleep(200);
await ev(`[...document.querySelectorAll("#tray-actions button")].find(b=>/Send now/.test(b.innerText)).click(); return 1`);
check("Send now → answered with both screenshots", (await waitDone()) && (await ev(`return document.querySelectorAll("img[alt='Sent screenshot'], a img").length`)) >= 2);

// 4. Consistent layout: every mode's answer starts with "Answer:" and uses its headings
const layouts = [
  ["Concept", "What is a deadlock?", ["Concept", "Use case", "Example"]],
  ["Design", "Design a rate limiter.", ["Requirements", "Architecture", "Trade-offs"]],
  ["Code", "Reverse a linked list.", ["Approach", "Code", "Complexity"]],
];
for (const [m, q, heads] of layouts) {
  await ev(`document.getElementById("answer-close")?.click(); return 1`); await sleep(400);
  await mode(m); await sleep(200);
  await typeInBar(q); await key("Enter", "Enter");
  const t0 = Date.now();
  await waitDone();
  const a = (await latestAnswer()) || "";
  const body = a.slice(a.indexOf("\n") + 1).replace(/[\u2010-\u2015]/g, "-");
  check(`${m}: starts with "Answer:" + ${heads.join(" / ")}`, /^\s*Answer:/m.test(body.split("\n").slice(0, 4).join("\n")) && heads.every((h) => body.includes(h)), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await shot("3-layout");

// 5. Chat thread: a follow-up keeps earlier Q&A visible (expanded) above
await typeInBar("And in Java?"); await key("Enter", "Enter");
await waitDone();
const turns = await ev(`return document.querySelectorAll("#conversation-thread [data-turn]").length`);
const expandedOk = await ev(`const t=document.querySelector("#conversation-thread [data-turn]"); return !!t && !t.querySelector("[class*='max-h-24']")`);
check("follow-up joins the thread, earlier answer shown in full", turns >= 1 && expandedOk, `${turns} earlier turn(s)`);
await shot("4-thread");

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
