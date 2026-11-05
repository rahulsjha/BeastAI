// Screencast recorder for the test Chrome tab (CDP Page.startScreencast).
// usage: node rec.mjs <urlPart> <outDir>   — stops when <outDir>/STOP exists.
import fs from "node:fs";
const [, , part, out] = process.argv;
fs.mkdirSync(`${out}/frames`, { recursive: true });
const tabs = await (await fetch("http://localhost:9333/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.url.includes(part));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const send = (method, params) => ws.send(JSON.stringify({ id: ++id, method, params }));
const meta = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Page.screencastFrame") {
    const n = String(meta.length).padStart(6, "0");
    fs.writeFileSync(`${out}/frames/${n}.jpg`, Buffer.from(m.params.data, "base64"));
    meta.push({ n, t: m.params.metadata.timestamp });
    send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
  }
});
// Poll screenshots (screencast sends nothing when the window isn't painting on screen).
const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const call = (method, params) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
(async () => { while (true) { const t = Date.now() / 1000; const r = await call("Page.captureScreenshot", { format: "jpeg", quality: 80 });
  if (r.result?.data) { const n = String(meta.length).padStart(6, "0"); fs.writeFileSync(`${out}/frames/${n}.jpg`, Buffer.from(r.result.data, "base64")); meta.push({ n, t }); }
  await new Promise((res) => setTimeout(res, 120)); } })();
// Keep frames flowing even when nothing changes (Chrome only sends on paint).
const tick = setInterval(() => send("Runtime.evaluate", { expression: "document.body.dataset.t=Date.now()" }), 250);
while (!fs.existsSync(`${out}/STOP`)) await new Promise((r) => setTimeout(r, 300));
clearInterval(tick); 
// ffmpeg concat list with real per-frame durations
const lines = [];
meta.forEach((f, i) => {
  const next = meta[i + 1]?.t ?? f.t + 0.5;
  lines.push(`file 'frames/${f.n}.jpg'`, `duration ${Math.max(0.04, next - f.t).toFixed(3)}`);
});
lines.push(`file 'frames/${meta[meta.length - 1].n}.jpg'`);
fs.writeFileSync(`${out}/list.txt`, lines.join("\n"));
console.log("frames", meta.length, "seconds", (meta.at(-1).t - meta[0].t).toFixed(1));
process.exit(0);
