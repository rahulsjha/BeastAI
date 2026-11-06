import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import { installAudioContextTracker } from "./lib/audio-context-tracker";
installAudioContextTracker();
// Browser version only: real Listen engine (meeting tab / system audio capture).
if ((window as any).__PLUELY_WEBTEST__) {
  import("./lib/webtest/browser-listen").then((m) => m.installBrowserListen());
  import("./lib/webtest/browser-crop").then((m) => m.installBrowserCrop());
  // Shortcuts (the desktop app registers these globally):
  //   ⌘⇧S / Ctrl+Shift+S → screenshot (drag to select)
  //   ⌘↵ / Ctrl+Enter   → screenshot, then send it and show the answer
  //   ⌘⇧O / Ctrl+Shift+O → start/stop Solve screen monitoring
  window.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const emit = (window as any).__webtestEmit;
    if (!emit) return;
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      emit("custom-shortcut-triggered", { action: "screenshot_enter" }); // capture + send
      return;
    }
    if (!e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === "s") {
      e.preventDefault();
      emit("trigger-screenshot", {});
    } else if (k === "o") {
      e.preventDefault();
      emit("custom-shortcut-triggered", { action: "solve_screen" });
    }
  });
}

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// Render different components based on window label
if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  // Render overlay without providers
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Overlay monitorIndex={monitorIndex} />
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
