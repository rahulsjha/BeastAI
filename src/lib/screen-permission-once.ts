// Ask macOS for Screen Recording at most once per app session. Without this,
// every screenshot re-opened the system prompt ("keeps asking again and again").
let asked = false;
export async function requestScreenPermissionOnce(request: () => Promise<unknown>): Promise<boolean> {
  if (asked) return false;
  asked = true;
  await request();
  return true;
}
