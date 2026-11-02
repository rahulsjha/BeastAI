/* Pluely web-test shim.
 * Loaded ONLY when the page URL has ?webtest. Emulates enough of the Tauri
 * runtime for the real React frontend to run in a normal browser, routing
 * invoke() to live backends (local bridge for the claude CLI; Cloudflare via
 * the bridge to avoid CORS). Never shipped in the native app. */
(function () {
  var BRIDGE = "http://localhost:8787";
  var cbs = {};
  var cbId = 1;

  function post(path, body) {
    return fetch(BRIDGE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json(); });
  }

  function invoke(cmd, args) {
    args = args || {};
    // ----- real backends -----
    if (cmd === "claude_cli_response") {
      return post("/claude", {
        prompt: args.prompt, model: args.model,
        session_id: args.sessionId, resume: args.resume,
      });
    }
    if (cmd === "claude_cli_status") {
      return Promise.resolve({ available: true, path: "bridge", version: "web" });
    }
    if (cmd === "debug_analyze_screen") {
      return post("/debug", {});
    }
    // ----- startup/app stubs (shapes the frontend reads) -----
    switch (cmd) {
      case "get_app_version": return Promise.resolve("0.1.9-webtest");
      case "validate_license_api":
        return Promise.resolve({ is_active: true, is_dev_license: false });
      case "check_license_status": return Promise.resolve(true);
      case "secure_storage_get": return Promise.resolve({});
      case "check_system_audio_access": return Promise.resolve(false);
      case "get_input_devices":
      case "get_output_devices": return Promise.resolve([]);
      case "check_shortcuts_registered": return Promise.resolve(true);
    }
    // ----- plugin calls routed through internals.invoke -----
    if (cmd.indexOf("plugin:sql|") === 0) {
      if (cmd.endsWith("load")) return Promise.resolve("sqlite:pluely.db");
      if (cmd.endsWith("select")) return Promise.resolve([]);
      // execute: plugin-sql destructures [rowsAffected, lastInsertId] (array)
      return Promise.resolve([1, Date.now() % 1000000000]);
    }
    if (cmd.indexOf("plugin:event|") === 0) {
      if (cmd.endsWith("listen")) return Promise.resolve(cbId); // rid
      return Promise.resolve(null);
    }
    if (cmd.indexOf("plugin:") === 0) return Promise.resolve(null);
    // everything else: no-op
    if (!invoke._warned) invoke._warned = {};
    if (!invoke._warned[cmd]) {
      invoke._warned[cmd] = 1;
      console.warn("[webtest] stubbed invoke:", cmd);
    }
    return Promise.resolve(null);
  }

  window.__TAURI_INTERNALS__ = {
    invoke: invoke,
    transformCallback: function (cb, once) {
      var id = cbId++;
      cbs[id] = cb;
      return id;
    },
    convertFileSrc: function (p) { return p; },
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    plugins: {},
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: function () { return Promise.resolve(); },
  };
  window.__TAURI__ = window.__TAURI__ || {};

  // Route the frontend's direct Cloudflare fetch through the bridge (CORS).
  var _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url);
      var isCF = url && url.indexOf("api.cloudflare.com") !== -1;
      var isGroq = url && url.indexOf("api.groq.com") !== -1;
      if (isCF || isGroq) {
        var headers = {};
        if (init && init.headers) {
          if (init.headers.forEach) init.headers.forEach(function (v, k) { headers[k] = v; });
          else headers = init.headers;
        }
        var body = init && init.body ? JSON.parse(init.body) : {};
        // Groq with stream:true -> relay the SSE stream so the browser gets tokens live.
        if (isGroq && body && body.stream) {
          return _fetch(BRIDGE + "/stream-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url, headers: headers, body: body }),
          });
        }
        // Otherwise buffer (Cloudflare STT, non-streaming Groq).
        return post("/cf-proxy", { url: url, headers: headers, body: body })
          .then(function (j) {
            return new Response(JSON.stringify(j), {
              status: 200, headers: { "Content-Type": "application/json" },
            });
          });
      }
    } catch (e) { /* fall through */ }
    return _fetch(input, init);
  };

  console.log("[webtest] Tauri shim installed");
})();
