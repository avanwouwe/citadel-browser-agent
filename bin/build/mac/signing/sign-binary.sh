#!/bin/bash
set -euo pipefail

PACKAGE_ID="org.citadelagent"
BINARY_DIR="${1:?Usage: sign-binary.sh <path-to-onedir-directory>}"
BINARY_NAME="$(basename "$BINARY_DIR")"
BINARY_PATH="$BINARY_DIR/$BINARY_NAME"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENTITLEMENTS="$SCRIPT_DIR/entitlements.plist"

if [ ! -f "$ENTITLEMENTS" ]; then
    echo "ERROR: entitlements.plist not found at $ENTITLEMENTS"
    exit 1
fi

if [ ! -f "$BINARY_PATH" ]; then
    echo "ERROR: main binary not found at $BINARY_PATH"
    exit 1
fi

# Flags shared by all signing operations
SIGN_FLAGS=(
    --sign "Citadel Agent Signing"
    --options runtime
    --timestamp          # records signing time via Apple's TSA
    --force
)

# Sign bottom-up: internal libraries first, main executable last.
# Hardened runtime rejects libraries that are unsigned or signed by a
# different identity than the binary that loads them.
echo "→ Signing Mach-O files in _internal/ ..."
find "$BINARY_DIR/_internal" -type f | while IFS= read -r f; do
    if file "$f" | grep -qE "Mach-O"; then
        codesign "${SIGN_FLAGS[@]}" "$f"
    fi
done

echo "→ Signing main executable: $BINARY_PATH"
codesign "${SIGN_FLAGS[@]}" \
    --identifier "$PACKAGE_ID" \
    --entitlements "$ENTITLEMENTS" \
    "$BINARY_PATH"

echo "→ Verifying (deep + strict) ..."
codesign --verify --deep --strict --verbose=4 "$BINARY_PATH"

echo ""
echo "Designated requirement — paste this verbatim into the profile's CodeRequirement:"
codesign -d --requirements - "$BINARY_PATH" 2>&1 | grep "designated =>"