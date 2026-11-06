// Web-test harness helper: drives the real UI (mode pills, question bar) and
// measures answers. Load in the browser console with
//   await import('/webtest-runner.js')
// then:  __batch([['Concept','What is TCP?'], ...])  and poll  __B
(() => {
  const T = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    ta: () => document.querySelector("textarea"),
    btn: (label) => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === label),
    mode(name) { this.btn(name)?.click(); },
    setText(t) {
      const el = this.ta();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, t);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    enter() { this.ta().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })); },
    panel() {
      const h = [...document.querySelectorAll("h3")].find((x) => /AI Response|Conversation Mode/.test(x.textContent));
      return h ? h.parentElement.parentElement.parentElement : null;
    },
    loading() { return /Generating response/.test(document.body.innerText); },
    answer() { const p = this.panel(); return p ? p.innerText : ""; },
    async ask(mode, q, { timeout = 120000 } = {}) {
      if (mode) { this.mode(mode); await this.sleep(400); }
      this.setText(q); await this.sleep(100);
      const t0 = performance.now(); this.enter();
      let first = null, last = "", stable = performance.now();
      while (performance.now() - t0 < timeout) {
        await this.sleep(300);
        const a = this.answer();
        const body = a.split("Asked:").slice(1).join("Asked:");
        if (first === null && body && !/Generating response/.test(a) && body.trim().length > q.length + 20) first = performance.now() - t0;
        if (a !== last) { last = a; stable = performance.now(); }
        if (first !== null && !this.loading() && performance.now() - stable > 2500) break;
      }
      const p = this.panel();
      const prose = last.replace(/```[\s\S]*?```/g, "");
      return {
        mode, q: q.slice(0, 90), firstMs: first && Math.round(first), totalMs: Math.round(performance.now() - t0 - 2500),
        mermaidErr: (last.match(/Mermaid Error/g) || []).length,
        katex: p ? p.querySelectorAll(".katex").length : 0,
        rawMath: /\$[^$\s][^$]*\$|\\(frac|approx|log|text)\b/.test(prose),
        barH: this.ta()?.offsetHeight, text: last,
        code: p ? [...p.querySelectorAll("pre")].map((x) => x.innerText) : [],
        backends: (window.__calls || []).splice(0),
      };
    },
    async newChat() {
      // Open the thread badge next to the bar, then press "New Chat".
      let nc = this.btn("New Chat");
      if (!nc) {
        const badge = this.ta()?.parentElement?.querySelector("button");
        if (!badge) return; // no thread yet
        badge.click(); await this.sleep(300);
        nc = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().includes("New Chat"));
      }
      nc?.click(); await this.sleep(300);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await this.sleep(200);
    },
  };
  // Record which backend each request goes to (/claude = Claude CLI, /stream-proxy = Groq).
  if (!window.__fetchWrapped) {
    window.__fetchWrapped = true; window.__calls = [];
    const orig = window.fetch;
    window.fetch = function (url, opts) {
      const u = String(url && url.url || url);
      if (/8787|groq|claude/.test(u)) {
        let model = ""; try { model = JSON.parse(opts?.body || "{}").model || ""; } catch {}
        window.__calls.push(u.replace(/^https?:\/\/[^/]+/, "") + (model ? " " + model : ""));
      }
      return orig.apply(this, arguments);
    };
  }
  window.__T = T;
  window.__R = window.__R || [];
  window.__batch = (items, opts = {}) => {
    const { fresh = true } = opts;
    window.__B = { done: false, out: [] };
    (async () => {
      for (const [mode, q] of items) {
        try {
          if (fresh) await T.newChat();
          const r = await T.ask(mode, q);
          window.__R.push(r);
          // Persist each answer (if the bridge has PLUELY_TEST_OUT set).
          const name = (opts.tag || mode) + "_" + window.__R.length + ".txt";
          const body = "Q: " + q + "\n\n" + r.code.map((c) => "```python\n" + c + "\n```").join("\n") + "\n\n" + r.text;
          fetch("http://localhost:8787/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, text: body }) }).catch(() => {});
          window.__B.out.push({ ...r, text: (r.text.split("Asked:")[1] || r.text).slice(0, 600) });
        } catch (e) { window.__B.out.push({ mode, q, err: String(e) }); }
      }
      window.__B.done = true;
    })();
    return "started " + items.length;
  };
})();

// ---- Interviewer simulator driver (needs ?simtest=1 and the sim tab shared) ----
(() => {
  const ch = new BroadcastChannel("pluely-sim");
  const waitMsg = (pred, ms) => new Promise((res) => {
    const t = setTimeout(() => { ch.removeEventListener("message", h); res(null); }, ms);
    const h = (e) => { if (pred(e.data)) { clearTimeout(t); ch.removeEventListener("message", h); res(e.data); } };
    ch.addEventListener("message", h);
  });
  const T = window.__T;
  window.__simPing = async () => { const p = waitMsg((d) => d.type === "pong", 2000); ch.postMessage({ type: "ping" }); return !!(await p); };
  // Play one scripted line in a given mode; measure transcript + answer.
  window.__simOne = async (item, { answerTimeout = 120000 } = {}) => {
    if (item.mode) { T.mode(item.mode); await T.sleep(400); }
    const logStart = (window.__txlog || []).length;
    const ended = waitMsg((d) => d.id === item.id && (d.type === "ended" || d.type === "error"), 30000);
    const tPlay = Date.now();
    ch.postMessage({ type: "play", id: item.id });
    const end = await ended;
    // Wait for this line's transcript (or noise drop) to appear.
    let shown = null, dropped = null, auto = null; const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const ev = (window.__txlog || []).slice(logStart);
      shown = ev.find((e) => e.event === "shown" && e.speaker === "interviewer");
      dropped = ev.find((e) => e.event === "dropped_noise" && e.speaker === "interviewer");
      if (shown || dropped) { auto = ev.find((e) => e.event === "auto_answer"); break; }
      await T.sleep(200);
    }
    const ev = (window.__txlog || []).slice(logStart);
    const speechEnd = ev.find((e) => e.event === "speech_end" && e.speaker === "interviewer");
    // If auto-answered, wait for the answer to finish streaming.
    let answer = null;
    if (auto) {
      const ta = Date.now(); let last = "", stable = Date.now(), first = null;
      while (Date.now() - ta < answerTimeout) {
        await T.sleep(300);
        const a = T.answer(); const body = (a.split("Asked:")[1] || "");
        if (first === null && body.trim().length > auto.text.length + 20 && !T.loading()) first = Date.now();
        if (a !== last) { last = a; stable = Date.now(); }
        if (first && !T.loading() && Date.now() - stable > 2500) break;
      }
      const p = T.panel();
      answer = { totalMs: Date.now() - auto.t - 2500, firstMs: first ? first - auto.t : null,
        mermaidErr: (last.match(/Mermaid Error/g) || []).length, backends: (window.__calls || []).splice(0),
        words: last.split(/\s+/).length, text: last.split("Asked:")[1]?.slice(0, 700) || "",
        code: p ? [...p.querySelectorAll("pre")].map((x) => x.innerText) : [] };
    }
    return {
      id: item.id, mode: item.mode, kind: item.kind, expected: item.text,
      heard: shown?.text || (dropped ? `(dropped as noise: ${dropped.text})` : null),
      segments: ev.filter((e) => e.event === "shown" && e.speaker === "interviewer").length,
      youLeak: ev.filter((e) => e.event === "shown" && e.speaker === "you").map((e) => e.text),
      clipSec: end && end.type === "ended" ? +((end.at - tPlay) / 1000).toFixed(1) : null,
      sttMs: speechEnd && shown ? shown.t - speechEnd.t : null,
      endToShownMs: end && shown ? shown.t - end.at : null,
      autoAnswered: !!auto, answer,
    };
  };
  window.__simRun = (items, opts) => {
    window.__S = { done: false, out: [] };
    (async () => {
      for (const it of items) {
        try { window.__S.out.push(await window.__simOne(it, opts)); }
        catch (e) { window.__S.out.push({ id: it.id, err: String(e) }); }
        await T.sleep(1500);
      }
      window.__S.done = true;
    })();
    return "sim started " + items.length;
  };
})();

// One-call setup for the live transcript test: open panel, auto-answer on, both sources on.
window.__setupLive = async ({ autoAnswer = true, you = true } = {}) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Test mode: run the interviewer simulator inside this tab (hidden frame).
  if (!document.getElementById("pluely-sim-frame")) {
    const f = document.createElement("iframe");
    f.id = "pluely-sim-frame"; f.src = "/interviewer-sim.html";
    f.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;right:0;border:0";
    document.body.appendChild(f);
    await new Promise((r) => f.addEventListener("load", r)); await sleep(500);
    try { await f.contentWindow.unlockAudio(); } catch (e) { console.warn("sim unlock", e); }
  }
  if (![...document.querySelectorAll("h3")].some((h) => h.textContent === "Live transcript")) {
    document.querySelector("svg.lucide-captions")?.closest("button")?.click(); await sleep(600);
  }
  const panel = [...document.querySelectorAll("h3")].find((h) => h.textContent === "Live transcript")?.parentElement;
  const btn = (t) => [...panel.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(t));
  const dot = (t) => btn(t).querySelector("span:last-child").className.includes("green");
  window.__dot = dot;
  const sw = panel.querySelector("[role=switch]"); // first = Interviewer
  if ((sw.getAttribute("aria-checked") === "true") !== autoAnswer) sw.click();
  if (you && !dot("You")) { btn("You").click(); await sleep(2500); }
  if (!you && dot("You")) { btn("You").click(); await sleep(500); }
  for (let attempt = 0; attempt < 4 && !dot("Interviewer"); attempt++) {
    btn("Interviewer").click(); await sleep(4000); // Chrome's auto-select occasionally misses; retry
  }
  return { you: dot("You"), interviewer: dot("Interviewer"), autoAnswer: sw.getAttribute("aria-checked"),
    error: panel.parentElement.innerText.match(/Microphone unavailable.*|No audio.*|Couldn.t.*/)?.[0] || null };
};

// ---- Queue tests: play several interviewer lines back to back, then wait for all jobs ----
(() => {
  const ch = new BroadcastChannel("pluely-sim");
  const T = window.__T;
  const playAndWait = (id) => new Promise((res) => {
    const h = (e) => { if (e.data?.id === id && (e.data.type === "ended" || e.data.type === "error")) { ch.removeEventListener("message", h); res(e.data); } };
    ch.addEventListener("message", h); ch.postMessage({ type: "play", id });
    setTimeout(() => res(null), 30000);
  });
  const jobs = () => (window.__queue?.jobs || []).map((j) => ({ id: j.id, text: j.text, mode: j.mode, source: j.source, status: j.status,
    waitS: j.startedAt ? +((j.startedAt - j.queuedAt) / 1000).toFixed(1) : null,
    answerS: j.doneAt && j.startedAt ? +((j.doneAt - j.startedAt) / 1000).toFixed(1) : null, error: j.error }));
  window.__jobs = jobs;
  // steps: [{play:id, mode?:'Code', gapMs?:500}, {manual:'text'}, {cancelAfterMs:n}, ...]
  window.__queueRun = (steps, { finishTimeoutMs = 300000 } = {}) => {
    window.__Q = { done: false, log: [] };
    (async () => {
      const t0 = Date.now(); const log = (m) => window.__Q.log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
      for (const st of steps) {
        if (st.mode) { T.mode(st.mode); await T.sleep(300); log("mode " + st.mode); }
        if (st.play) { await playAndWait(st.play); log("played " + st.play); }
        if (st.manual) { window.__queue.enqueue(st.manual, { mode: localStorage.getItem("interview_mode"), source: "manual" }); log("manual " + st.manual); }
        if (st.removeWaitingIndex !== undefined) { const w = window.__queue.jobs.filter((j) => j.status === "waiting")[st.removeWaitingIndex]; if (w) { window.__queue.remove(w.id); log("removed " + w.text); } }
        if (st.cancelCurrent) {
          // Titles are stripped on purpose (stealth); the text lives in data-original-title.
          // The answer panel's ✕ cancels while loading (titles are stripped for stealth).
          const header = [...document.querySelectorAll("h3")].find((h) => /AI Response|Conversation Mode/.test(h.textContent))?.parentElement?.parentElement;
          const b = header ? [...header.querySelectorAll("button")].find((x) => x.querySelector("svg.lucide-x")) : null;
          b?.click(); log(b ? "cancel clicked" : "cancel button NOT FOUND");
        }
        if (st.waitMs) await T.sleep(st.waitMs);
        await T.sleep(st.gapMs ?? 400);
      }
      log("all steps sent, waiting for queue to drain");
      const tEnd = Date.now();
      while (Date.now() - tEnd < finishTimeoutMs) {
        await T.sleep(1000);
        const js = window.__queue?.jobs || [];
        const transcribing = /transcribing…/.test(document.body.innerText);
        if (js.length && !transcribing && js.every((j) => !["waiting", "answering"].includes(j.status)) && !T.loading()) break;
      }
      window.__Q.jobs = jobs(); window.__Q.totalS = +((Date.now() - t0) / 1000).toFixed(1); window.__Q.done = true;
    })();
    return "queue run started";
  };
})();

// Attach a file through the app's real file input (same path as picking a file).
window.__attach = async (url, name, type) => {
  const blob = await (await fetch(url)).blob();
  const file = new File([blob], name, { type: type || blob.type });
  const input = document.querySelector('input[type=file]');
  if (!input) {
    document.querySelector("svg.lucide-paperclip")?.closest("button")?.click();
    await new Promise((r) => setTimeout(r, 400));
  }
  const el = document.querySelector('input[type=file]');
  const dt = new DataTransfer(); dt.items.add(file); el.files = dt.files;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1500));
  return name;
};
window.__tray = () => {
  const t = [...document.querySelectorAll("span")].find((s) => s.textContent.startsWith("Sending with next question"));
  return t ? t.parentElement.innerText.replace(/\n+/g, " | ") : "(no tray)";
};
