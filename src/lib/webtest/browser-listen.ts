// Browser stand-in for the desktop "Listen" engine. Listen captures the
// computer's audio natively in the desktop app (ScreenCaptureKit); the browser
// version does not open Chrome's tab-sharing pop-up, so it explains instead.
type Emit = (event: string, payload?: unknown) => void;

const MESSAGE =
  "Listen captures the computer's audio in the desktop app. In the browser, use the mic, screenshots or Solve screen.";

export async function start(_emit: Emit, _vadConfig?: unknown): Promise<void> {
  throw new Error(MESSAGE);
}
export async function manualStop(_emit: Emit) {}
export async function stop(_emit: Emit, _opts?: { silent?: boolean }) {}

export function installBrowserListen() {
  (window as any).__browserListen = { start, stop, manualStop };
}
