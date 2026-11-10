// Auto mode with several speakers: different voices, accents and speeds play a
// short "interview" through the laptop speaker into the mic (browser version,
// speakers → mic only). Checks every question is detected and answered and that
// statements / small talk are not. Usage: node scripts/demo/auto-multivoice-test.mjs
import { spawnSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tab = (await (await fetch("http://localhost:9333/json/list")).json()).find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await call("Runtime.evaluate", { expression: `(async()=>{${x}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;

// [voice, words per minute, line, is it a question?]
let SCRIPT = [
  ["Daniel", 160, "Hi everyone, thanks for joining the interview today.", false],
  ["Daniel", 165, "What is the difference between a process and a thread?", true],
  ["Fred", 170, "Sure, let me think about that for a second.", false],
  ["Karen", 150, "How does a hash map handle collisions?", true],
  ["Moira", 185, "Next one. Explain the CAP theorem in simple words.", true],
  ["Samantha", 140, "Can you also tell me when you would use a message queue and why it helps with scaling", true],
  ["Karen", 195, "Okay, that sounds good to me.", false],
  ["Daniel", 175, "Write a function to reverse a linked list.", true],
  ["Moira", 155, "What is a deadlock? And how would you prevent it?", true],
  ["Samantha", 170, "Thank you.", false],
];
let KEY = [/process.*thread/i, /hash ?map|collision/i, /cap theorem/i, /message queue/i, /revers.*link/i, /deadlock/i];
let GAP = 1800;
// "fast": five speakers, short gaps, two questions in one breath, a refinement.
if (process.argv[2] === "fast") {
  SCRIPT.length = 0;
  SCRIPT.push(
    ["Moira", 175, "Alright, let's get started.", false],
    ["Daniel", 185, "What is dependency injection? And why is it useful for testing?", true],
    ["Karen", 170, "Explain how TCP guarantees ordered delivery.", true],
    ["Fred", 180, "Hmm, okay.", false],
    ["Samantha", 190, "Given an array of integers, find two numbers that add up to a target.", true],
    ["Samantha", 190, "Can you do better than quadratic time?", true],
    ["Reed (English (UK))", 165, "How would you design a rate limiter for an API?", true],
    ["Moira", 200, "Perfect, that's all from my side.", false],
  );
  KEY = [/dependency injection/i, /tcp|ordered/i, /two numbers|target/i, /quadratic|better/i, /rate limiter/i];
  GAP = 700;
}

await call("Page.reload"); await sleep(4500);
await ev(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="Concept")?.click(); return 1`);
const on = await ev(`const a=document.getElementById("auto-button"); if (a?.getAttribute("aria-pressed")!=="true") a.click(); return 1`);
await sleep(3000);
console.log("Auto on:", await ev(`return window.__auto?.on`));

for (const [voice, rate, line] of SCRIPT) {
  spawnSync("say", ["-v", voice, "-r", String(rate), line]);
  await sleep(GAP); // pause between speakers
}
console.log("script finished; waiting for answers…");
// Wait until nothing is transcribing / waiting / answering for a while.
let quiet = 0;
for (let i = 0; i < 240 && quiet < 12; i++) {
  const busy = await ev(`const a=window.__auto; return a.entries.some(e=>e.status==="transcribing") || a.jobs.some(j=>j.status==="waiting"||j.status==="answering")`);
  quiet = busy ? 0 : quiet + 1;
  await sleep(500);
}
const a = await ev(`return JSON.stringify(window.__auto)`);
const { entries, jobs } = JSON.parse(a);
console.log("\nHeard:");
for (const e of entries) console.log(`  ${e.isQuestion ? "Q " : "  "} ${e.text}`);
console.log("\nAnswer queue:");
for (const j of jobs) console.log(`  [${j.status}] ${j.text}`);

const asked = jobs.map((j) => j.text).join(" | ");
const covered = KEY.filter((k) => k.test(asked));
const answered = jobs.filter((j) => j.status === "done").length;
const statements = SCRIPT.filter((s) => !s[3]).map((s) => s[2].toLowerCase().replace(/[^a-z ]/g, "").slice(0, 18));
const falseAnswers = jobs.filter((j) => statements.some((st) => j.text.toLowerCase().replace(/[^a-z ]/g, "").includes(st)));
console.log(`\nQuestions covered: ${covered.length}/${KEY.length}  · jobs answered: ${answered}/${jobs.length}  · statements answered by mistake: ${falseAnswers.length}`);
process.exit(covered.length === KEY.length && falseAnswers.length === 0 ? 0 : 1);
