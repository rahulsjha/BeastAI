/* Pluely web-test shim.
 * Loaded ONLY when the page URL has ?webtest. Emulates enough of the Tauri
 * runtime for the real React frontend to run in a normal browser, routing
 * invoke() to live backends (local bridge for the claude CLI; Cloudflare via
 * the bridge to avoid CORS). Never shipped in the native app. */
(function () {
  // Marks web-test mode so the app uses the browser fetch (which this shim
  // proxies) instead of Tauri's Rust HTTP client.
  window.__PLUELY_WEBTEST__ = true;
  var BRIDGE = "http://localhost:8787";
  var cbs = {};
  var cbId = 1;
  // Event bus: lets browser engines emit the same events the Rust backend does.
  var listeners = {}; // event -> [handlerId]
  function emit(event, payload) {
    (listeners[event] || []).slice().forEach(function (h) {
      try { cbs[h] && cbs[h]({ event: event, id: h, payload: payload }); } catch (e) { console.error(e); }
    });
  }
  window.__webtestEmit = emit;
  function browserListen() {
    if (!window.__browserListen) throw new Error("browser Listen engine not loaded");
    return window.__browserListen;
  }

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
        images: args.images || [],
      });
    }
    if (cmd === "claude_cli_status") {
      return Promise.resolve({ available: true, path: "bridge", version: "web" });
    }
    if (cmd.startsWith("plugin:macos-permissions|")) {
      return Promise.resolve(true); // the bridge's screencapture has permission
    }
    if (cmd === "capture_to_base64") {
      return post("/screenshot", {}).then((r) => r.image);
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
      case "check_system_audio_access": return Promise.resolve(true);
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
      if (cmd.endsWith("|listen")) {
        var ev = args && args.event; var h = args && args.handler;
        if (ev && h != null) (listeners[ev] = listeners[ev] || []).push(h);
        return Promise.resolve(h); // eventId = handler id
      }
      if (cmd.endsWith("|unlisten")) {
        var ue = args && args.event; var uid = args && args.eventId;
        if (ue && listeners[ue]) listeners[ue] = listeners[ue].filter(function (x) { return x !== uid; });
        return Promise.resolve(null);
      }
      if (cmd.endsWith("|emit")) { emit(args && args.event, args && args.payload); return Promise.resolve(null); }
      return Promise.resolve(null);
    }
    // ----- Listen (system audio): served by the browser engine -----
    if (cmd === "start_system_audio_capture") {
      return browserListen().start(emit, args && args.vadConfig).then(function () { return "started"; });
    }
    if (cmd === "stop_system_audio_capture") return browserListen().stop(emit).then(function () { return "stopped"; });
    if (cmd === "manual_stop_continuous") return browserListen().manualStop(emit).then(function () { return null; });
    if (cmd === "get_vad_config") {
      return Promise.resolve({ enabled: true, hop_size: 1024, sensitivity_rms: 0.012, peak_threshold: 0.035, silence_chunks: 45,
        min_speech_chunks: 7, pre_speech_chunks: 12, noise_gate_threshold: 0.003, max_recording_duration_secs: 180 });
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
