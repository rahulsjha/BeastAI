// Auto stress test: 55 questions + 15 statements from 47 different voices
// (English accents, non-English voices reading English, novelty voices), at
// 130–220 wpm, played through the speakers into the mic (browser version).
// Reports, per question: heard? detected as a question? answered? — and why not.
// Usage: node scripts/demo/auto-stress-test.mjs [gapMs]
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const GAP = Number(process.argv[2] || 1200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tab = (await (await fetch("http://localhost:9333/json/list")).json()).find((t) => t.type === "page" && t.url.includes("webtest=1"));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await call("Runtime.evaluate", { expression: `(async()=>{${x}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;

const NATURAL = ["Samantha", "Daniel", "Karen", "Moira", "Rishi", "Fred", "Kathy", "Ralph", "Junior", "Eddy (English (US))", "Eddy (English (UK))",
  "Flo (English (US))", "Flo (English (UK))", "Grandma (English (US))", "Grandma (English (UK))", "Grandpa (English (US))", "Grandpa (English (UK))",
  "Reed (English (US))", "Reed (English (UK))", "Rocko (English (US))", "Rocko (English (UK))", "Sandy (English (US))", "Sandy (English (UK))",
  "Shelley (English (US))", "Shelley (English (UK))", "Tessa", "Albert"];
const ACCENT = ["Lekha", "Kyoko", "Anna", "Alice", "Jacques", "Mónica", "Luciana", "Milena", "Majed", "Eddy (Chinese (China mainland))",
  "Flo (Korean (South Korea))", "Reed (French (France))", "Grandpa (German (Germany))", "Sandy (Italian (Italy))"];
const NOVELTY = ["Bad News", "Good News", "Jester", "Superstar", "Wobble", "Bubbles"];
const installed = new Set(spawnSync("say", ["-v", "?"]).stdout.toString().split("\n").map((l) => l.replace(/\s{2,}.*$/, "").trim()));
const pick = (list) => list.filter((v) => installed.has(v));
const voices = { natural: pick(NATURAL), accent: pick(ACCENT), novelty: pick(NOVELTY) };

// [text, keyword regex, is question?]
const Q = [
  ["What is the difference between a process and a thread?", /process|thread/i],
  ["How does a hash map handle collisions?", /collision|hash ?map/i],
  ["Explain the CAP theorem in simple words.", /cap theorem|cap/i],
  ["When would you use a message queue", /message queue|queue/i],
  ["Write a function to reverse a linked list.", /revers/i],
  ["What is a deadlock and how would you prevent it?", /deadlock|dead lock/i],
  ["Explain the difference between TCP and UDP.", /tcp|udp/i],
  ["How would you design a URL shortener?", /url|shortener/i],
  ["What is dependency injection?", /dependency|injection/i],
  ["Given an array of integers, find two numbers that add up to a target.", /two numbers|target/i],
  ["What is the time complexity of binary search?", /binary search/i],
  ["How does garbage collection work in Java?", /garbage/i],
  ["Next one, explain database indexing.", /index/i],
  ["What are the SOLID principles?", /solid/i],
  ["How would you design a rate limiter?", /rate limit/i],
  ["What is eventual consistency?", /eventual/i],
  ["Explain how HTTPS works.", /https|tls|ssl/i],
  ["What is the difference between SQL and NoSQL databases?", /sql/i],
  ["How do you detect a cycle in a linked list?", /cycle/i],
  ["What is a closure in JavaScript?", /closure/i],
  ["Explain the virtual DOM in React.", /virtual dom|react/i],
  ["What is a race condition?", /race/i],
  ["How does a load balancer work?", /load balanc/i],
  ["What is memoization?", /memo/i],
  ["Explain the difference between a stack and a queue.", /stack/i],
  ["How would you design a chat application like WhatsApp?", /chat|whatsapp/i],
  ["What is sharding in databases?", /shard/i],
  ["Can you explain how a B tree works", /b ?-?tree|b-tree/i],
  ["What happens when you type a URL into the browser?", /type a url|browser/i],
  ["How do you find the median of two sorted arrays?", /median/i],
  ["What is the purpose of a mutex?", /mutex/i],
  ["Explain microservices versus a monolith.", /microservice|monolith/i],
  ["What is Big O notation?", /big ?o/i],
  ["How would you implement an LRU cache?", /lru|least recently/i],
  ["What is a REST API and what makes it RESTful?", /rest/i],
  ["Okay so, how does Kubernetes schedule pods?", /kubernetes|pod/i],
  ["What is the difference between processes and coroutines?", /coroutine/i],
  ["Tell me about a time you resolved a conflict in your team.", /conflict/i],
  ["How do you merge k sorted lists?", /merge|k sorted/i],
  ["What is a bloom filter?", /bloom/i],
  ["Explain consistent hashing.", /consistent hash/i],
  ["Why is immutability useful?", /immutab/i],
  ["How would you scale a read heavy database?", /read heavy|read-heavy|scale/i],
  ["What is the difference between authentication and authorization?", /authenti|authori/i],
  ["Describe the observer pattern.", /observer/i],
  ["What is a deadlock free design for the dining philosophers problem?", /dining|philosoph/i],
  ["How does Redis persist data?", /redis/i],
  ["What is backpressure in streaming systems?", /backpressure|back pressure/i],
  ["Moving on, design a notification service.", /notification/i],
  ["How do you prevent SQL injection?", /injection/i],
  ["What is the difference between threads and async await?", /async|await/i],
  ["Explain how a hash set works internally.", /hash set|hashset/i],
  ["What is a trie and when would you use it?", /trie|try/i],
  ["How do you handle idempotency in payment APIs?", /idempot/i],
  ["Why would you choose Kafka over RabbitMQ?", /kafka|rabbit/i],
].map(([t, k]) => [t, k, true]);
const S = [
  "Hi everyone, thanks for joining today.", "Sure, let me think about that.", "Okay, sounds good.", "Great, that makes sense.",
  "Let me share my screen.", "I think we are on the same page.", "That was a good answer.", "Alright, let's move on.",
  "Give me one second.", "Perfect.", "I agree with that approach.", "Nice, I like that.", "Hmm, interesting.",
  "Let me write that down.", "Thanks, that's all from our side.",
].map((t) => [t, null, false]);

// Interleave: a statement after roughly every 4 questions; assign voices + speeds.
const lines = [];
let si = 0;
Q.forEach((q, i) => { lines.push(q); if (i % 4 === 3 && si < S.length) lines.push(S[si++]); });
while (si < S.length) lines.push(S[si++]);
// "hard": only the voices that failed before — robotic/novelty, whispering
// Albert, and accented voices — at 185–225 wpm.
const HARD = process.argv[3] === "hard";
const all = HARD
  ? [...voices.novelty, ...voices.accent, "Albert"].filter((v) => installed.has(v))
  : [...voices.natural, ...voices.accent, ...voices.novelty];
const kindOf = (v) => (voices.accent.includes(v) ? "accent" : voices.novelty.includes(v) || v === "Albert" ? "novelty" : "natural");
const plan = lines.map(([text, key, isQ], i) => ({ text, key, isQ, voice: all[i % all.length], rate: HARD ? 185 + ((i * 13) % 41) : 130 + ((i * 37) % 91) }));
console.log(`voices: ${all.length} (natural ${voices.natural.length}, accent ${voices.accent.length}, novelty ${voices.novelty.length}) · lines: ${plan.length} (${Q.length} questions) · gap ${GAP}ms`);

await call("Page.reload"); await sleep(4500);
await ev(`[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="Concept")?.click(); return 1`);
await ev(`const a=document.getElementById("auto-button"); if (a?.getAttribute("aria-pressed")!=="true") a.click(); return 1`);
await sleep(3000);

const t0 = Date.now();
for (const [n, p] of plan.entries()) {
  spawnSync("say", ["-v", p.voice, "-r", String(p.rate), p.text]);
  if (n % 10 === 9) console.log(`  …played ${n + 1}/${plan.length}`);
  await sleep(GAP);
}
console.log(`played in ${((Date.now() - t0) / 1000).toFixed(0)}s; waiting for the queue…`);
let quiet = 0;
for (let i = 0; i < 1200 && quiet < 16; i++) {
  const busy = await ev(`const a=window.__auto; return a.entries.some(e=>e.status==="transcribing") || a.jobs.some(j=>j.status==="waiting"||j.status==="answering")`);
  quiet = busy ? 0 : quiet + 1;
  await sleep(500);
}
const { entries, jobs } = JSON.parse(await ev(`return JSON.stringify(window.__auto)`));

// Score each question: match by keyword, or by word overlap (catches misspellings like "CAAT theorem").
const STOP = ["what","the","how","you","and","does","would","with","explain","difference","between","when","why","can","your","into","work","works"];
const words = (t) => new Set((t.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.includes(w)));
const overlap = (a, b) => { const A = words(a), B = words(b); if (!A.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / A.size; };
const used = new Set();
const rows = plan.filter((p) => p.isQ).map((p, qi) => {
  // In order: the best unused transcript line for this question.
  const cand = entries.filter((x) => !used.has(x)).map((x) => ({ x, s: p.key.test(x.text) ? 1 : overlap(p.text, x.text) })).sort((a, b) => b.s - a.s)[0];
  const heardE = cand && cand.s >= 0.34 ? cand.x : null;
  if (heardE) used.add(heardE);
  const job = heardE && heardE.isQuestion ? jobs.find((j) => heardE.text.toLowerCase().includes(j.text.toLowerCase().slice(0, 18)) || j.text.toLowerCase().includes(heardE.text.toLowerCase().slice(0, 18))) : null;
  let why = "";
  if (!heardE) why = "not heard (missed by voice detection / dropped as noise / misheard)";
  else if (!heardE.isQuestion) why = `heard but not detected as a question: “${heardE.text}”`;
  else if (!job) why = "detected but not queued (merged or deduplicated)";
  else if (job.status !== "done") why = `queued but ${job.status}`;
  const exact = !!heardE && overlap(p.text, heardE.text) >= 0.75;
  return { ...p, kind: kindOf(p.voice), heard: !!heardE, exact, detected: !!heardE?.isQuestion, answered: job?.status === "done", got: heardE?.text, why };
});
const stmts = plan.filter((p) => !p.isQ);
const falsePos = jobs.filter((j) => stmts.some((s) => j.text.toLowerCase().replace(/[^a-z ]/g, "").includes(s.text.toLowerCase().replace(/[^a-z ]/g, "").slice(0, 16))));
const by = (k) => { const r = rows.filter((x) => x.kind === k); return `${r.filter((x) => x.answered).length}/${r.length}`; };
console.log(`\nRESULT: answered ${rows.filter((r) => r.answered).length}/${rows.length} questions · heard ${rows.filter((r) => r.heard).length} · detected ${rows.filter((r) => r.detected).length} · statements answered by mistake ${falsePos.length}/${stmts.length}`);
console.log(`by voice type: natural ${by("natural")} · accent ${by("accent")} · novelty ${by("novelty")}`);
console.log(`heard correctly (≥75% of key words right): ${rows.filter((r) => r.exact).length}/${rows.length}`);
console.log(`\nAnswered but misheard:`);
for (const r of rows.filter((x) => x.answered && !x.exact)) console.log(`  [${r.kind}] ${r.voice} — “${r.text}” → “${r.got}”`);
console.log(`\nMissed:`);
for (const r of rows.filter((x) => !x.answered)) console.log(`  [${r.kind}] ${r.voice} @${r.rate}wpm — “${r.text}” → ${r.why}`);
if (falsePos.length) { console.log(`\nStatements answered by mistake:`); falsePos.forEach((j) => console.log("  " + j.text)); }
console.log(`\nAll transcript lines (${entries.length}):`);
entries.forEach((e) => console.log(`  ${e.isQuestion ? "Q" : " "} ${e.text}`));
fs.writeFileSync("/tmp/auto-stress.json", JSON.stringify({ rows, falsePos, entries, jobs }, null, 1));
process.exit(0);
