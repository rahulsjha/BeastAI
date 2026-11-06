import fs from "node:fs";
const pages = {
  s5_buggy: `<body style="background:#1e1e1e;color:#d4d4d4;font:18px Menlo;padding:30px"><div style="color:#9cdcfe">binary_search.py</div><pre>def binary_search(arr, target):
    lo, hi = 0, len(arr)
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid
        else:
            hi = mid
    return -1

print(binary_search([1, 3, 5, 7, 9], 9))   # never returns</pre></body>`,
  s6_concept: `<body style="background:#fff;font:28px Georgia;padding:60px"><h2>Interview question 4</h2><p>What is the CAP theorem? Explain each of the three properties.</p></body>`,
  s11_hindi: `<body style="background:#fafafa;font:30px system-ui;padding:60px"><h2>प्रश्न 2</h2><p>डेटाबेस इंडेक्स क्या होता है और यह क्वेरी को तेज़ कैसे बनाता है?</p></body>`,
};
const B = "http://localhost:9333"; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [name, html] of Object.entries(pages)) {
  const t = await (await fetch(`${B}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const call = (m, p) => new Promise((r) => { const i = ++id; ws.addEventListener("message", (e) => { const d = JSON.parse(e.data); if (d.id === i) r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await call("Emulation.setDeviceMetricsOverride", { width: 1100, height: 650, deviceScaleFactor: 2, mobile: false });
  await call("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) }); await sleep(1200);
  const r = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${name}.png`, Buffer.from(r.result.data, "base64"));
  await fetch(`${B}/json/close/${t.id}`); ws.close(); console.log("made", name);
}
process.exit(0);
