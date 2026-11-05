// Open the SYSTEM DEFAULT microphone. Without naming it, Chrome may pick the
// first input device, which on many Macs is a virtual one (silence).
export async function getDefaultMic(extra: MediaTrackConstraints = {}): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { ...extra, deviceId: { exact: "default" } } });
  } catch (e: any) {
    if (e?.name !== "OverconstrainedError" && e?.name !== "NotFoundError") throw e;
    return navigator.mediaDevices.getUserMedia({ audio: extra });
  }
}
