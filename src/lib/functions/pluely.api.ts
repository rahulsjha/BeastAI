// The hosted Pluely API (license-gated) is not used in this build.
// All AI and STT calls go through the user-configured providers.
export async function shouldUsePluelyAPI(): Promise<boolean> {
  return false;
}
