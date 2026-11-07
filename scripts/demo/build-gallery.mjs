// Builds docs/demos/index.html (a demo gallery you can open in any browser) from
// the videos and demos.json written by feature-demos.mjs.
// Usage: node scripts/demo/build-gallery.mjs <recordedOutDir>
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const DST = path.resolve("docs/demos");
fs.mkdirSync(DST, { recursive: true });
const meta = JSON.parse(fs.readFileSync(path.join(SRC, "demos.json"), "utf8"));
const slugs = Object.keys(meta).sort();
for (const s of slugs) for (const ext of ["mp4", "gif", "jpg"]) {
  const f = path.join(SRC, `${s}.${ext}`);
  if (fs.existsSync(f)) fs.copyFileSync(f, path.join(DST, `${s}.${ext}`));
}
fs.writeFileSync(path.join(DST, "demos.json"), JSON.stringify(meta, null, 2));

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const strip = (t) => esc(String(t).replace(/<\/?b>/g, "\u0001")).replace(/\u0001([^\u0001]*)\u0001/g, "<b>$1</b>");

const cards = slugs.map((s, i) => {
  const m = meta[s];
  return `<section class="card" id="${s}">
  <div class="head"><span class="num">${i + 1}</span><div><h2>${esc(m.title)}</h2><p class="why">${esc(m.why)}</p></div></div>
  <video src="${s}.mp4" poster="${s}.jpg" controls preload="metadata" playsinline muted></video>
  <div class="foot"><ol>${m.steps.map((x) => `<li>${strip(x)}</li>`).join("")}</ol>
  <div class="meta">${m.secs}s · <a href="${s}.mp4" download>MP4</a> · <a href="${s}.gif">GIF</a></div></div>
</section>`;
}).join("\n");

const toc = slugs.map((s, i) => `<a href="#${s}"><span>${i + 1}</span>${esc(meta[s].title.split(":")[0])}</a>`).join("");

fs.writeFileSync(path.join(DST, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Beast feature demos</title>
<style>
:root{--bg:#0b0d12;--card:#141823;--line:#ffffff14;--text:#e8ebf1;--mute:#9aa3b2;--accent:#38bdf8;--ok:#22c55e}
@media (prefers-color-scheme:light){:root{--bg:#f5f7fb;--card:#fff;--line:#0000001a;--text:#121620;--mute:#5b6474;--accent:#0284c7}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
header{max-width:1180px;margin:0 auto;padding:40px 16px 8px}
header .k{font:600 12px system-ui;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
header h1{font-size:clamp(28px,4vw,42px);line-height:1.1;margin:8px 0 10px}
header p{color:var(--mute);max-width:760px;margin:0}
nav{max-width:1180px;margin:18px auto 0;padding:0 16px;display:flex;flex-wrap:wrap;gap:8px}
nav a{display:flex;gap:8px;align-items:center;padding:6px 12px 6px 6px;border:1px solid var(--line);border-radius:999px;color:var(--text);text-decoration:none;font-size:14px;background:var(--card)}
nav a span{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#04131c;font:600 12px system-ui}
main{max-width:1180px;margin:0 auto;padding:24px 16px 60px;display:grid;gap:28px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;scroll-margin-top:16px}
.head{display:flex;gap:14px;padding:20px 22px 14px;align-items:flex-start}
.num{flex:0 0 36px;height:36px;border-radius:50%;background:var(--accent);color:#04131c;display:grid;place-items:center;font:700 16px system-ui}
h2{margin:0;font-size:22px;line-height:1.25}.why{margin:4px 0 0;color:var(--mute)}
video{display:block;width:100%;aspect-ratio:1200/760;background:#000}
.foot{display:flex;gap:20px;justify-content:space-between;align-items:flex-end;padding:16px 22px 20px;flex-wrap:wrap}
ol{margin:0;padding-left:22px;display:grid;gap:4px;color:var(--text)}ol li::marker{color:var(--accent);font-weight:700}
.meta{color:var(--mute);font-size:14px;white-space:nowrap}.meta a{color:var(--accent)}
footer{color:var(--mute);text-align:center;padding:0 16px 40px;font-size:14px}
</style></head><body>
<header><div class="k">Beast · interview assistant</div><h1>Every feature, recorded from the real app</h1>
<p>Each video shows the actual Beast overlay on the left and what is happening, step by step, on the right. The "screen" Beast reads is a fixed test image (shown bottom-right), so the answers are real and nothing private is on screen.</p></header>
<nav>${toc}</nav>
<main>
${cards}
</main>
<footer>Recorded with <code>scripts/demo/feature-demos.mjs</code>. Answer times shown are measured from the moment a question is sent.</footer>
</body></html>
`);
console.log("gallery:", path.join(DST, "index.html"), slugs.length, "demos");
