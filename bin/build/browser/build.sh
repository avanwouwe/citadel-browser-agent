#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v jq >/dev/null 2>&1 || { echo "jq is required but not installed." >&2; exit 1; }

BUILD_ROOT="/tmp/citadel-$(uuidgen)"
OUTPUT_PKG="citadel-plugin"

rm -rf "$SCRIPT_DIR/$OUTPUT_PKG"
rm -f "$SCRIPT_DIR"/citadel-plugin-*.zip
mkdir "$BUILD_ROOT"

"$SCRIPT_DIR/pack.sh"

# Copy the files to the directory structure
cd "$SCRIPT_DIR/../../.."
ROOT_DIR="$(pwd)"
cp ./*.js ./*.json "$BUILD_ROOT"
cp -r utils gui "$BUILD_ROOT"

VERSION="$(jq -r '.version' "$ROOT_DIR/manifest.json")"

cd "$SCRIPT_DIR" || exit
mv "$BUILD_ROOT" "$OUTPUT_PKG"
cd "$OUTPUT_PKG" || exit

# manifest.json as authored has both service_worker and background.scripts:
# Firefox (MV2-only) needs scripts; Chrome/Edge only ever load service_worker,
# and Edge's validator hard-fails if scripts is also present. Keep a copy of
# the authored manifest so we can restore it after building both zips.
cp manifest.json manifest.json.authored

# --- Firefox: manifest as authored ---
zip -r "../${OUTPUT_PKG}-firefox-v${VERSION}.zip" . -x "*.DS_Store" -x "manifest.json.authored"

# --- Chromium (Chrome + Edge): strip background.scripts ---
jq 'del(.background.scripts)' manifest.json.authored > manifest.json
zip -r "../${OUTPUT_PKG}-chromium-v${VERSION}.zip" . -x "*.DS_Store" -x "manifest.json.authored"

# restore the authored manifest.json so the staged directory matches source
mv manifest.json.authored manifest.json