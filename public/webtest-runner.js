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
