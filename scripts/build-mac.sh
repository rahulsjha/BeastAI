#!/bin/bash
# Build Pluely, sign it with the same local certificate every time, install it.
# A stable signature means macOS keeps the Screen Recording / Microphone
# permissions across rebuilds (ad-hoc builds look like a new app each time).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
KC="$HOME/Library/Keychains/pluely-signing.keychain-db"
ID="Pluely Local Signing"
APP="src-tauri/target/release/bundle/macos/Pluely.app"

npm run tauri build -- --bundles app || true   # the updater-key message is not fatal
[ -d "$APP" ] || { echo "build failed"; exit 1; }

if [ -f "$KC" ]; then
  security unlock-keychain -p "pluely-signing-local" "$KC"
  codesign --force --deep --keychain "$KC" --identifier com.srikanthnani.pluely --sign "$ID" "$APP"
  codesign -d -r- "$APP" 2>&1 | tail -1
else
  echo "No $KC — app stays ad-hoc signed (permissions reset on every rebuild)."
fi

pkill -f "Pluely.app/Contents/MacOS" 2>/dev/null || true
sleep 1
rm -rf /Applications/Pluely.app
cp -R "$APP" /Applications/
xattr -dr com.apple.quarantine /Applications/Pluely.app 2>/dev/null || true
open /Applications/Pluely.app
echo "Installed /Applications/Pluely.app"
