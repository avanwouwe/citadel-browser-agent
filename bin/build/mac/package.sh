#!/bin/bash

set -eu

PACKAGE_ID="nl.vanwouwe.citadel"
VERSION="1.4"
BUILD_ROOT="/tmp/citadel-$(uuidgen)"
OUTPUT_PKG="citadel-browser-agent-$VERSION.pkg"

# Verify both builds exist
if [ ! -d "binaries/arm64" ] || [ ! -d "binaries/x86_64" ]; then
    echo "Error: Missing one or both architecture builds."
    exit 1
fi

# Create the directory structure
mkdir -p "$BUILD_ROOT/root/Library/Scripts"
mkdir -p "$BUILD_ROOT/root/Library/Google/Chrome/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/root/Library/Application Support/Mozilla/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/root/Library/Opera/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/root/Library/Microsoft Edge/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/root/Library/BraveSoftware/Brave-Browser/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/scripts"

# Copy the different architecture builds
cp -r binaries/arm64 "$BUILD_ROOT/root/Library/Scripts/Citadel-arm64/"
cp -r ../../controls "$BUILD_ROOT/root/Library/Scripts/Citadel-arm64/"
cp -r binaries/x86_64 "$BUILD_ROOT/root/Library/Scripts/Citadel-x86_64/"
cp -r ../../controls "$BUILD_ROOT/root/Library/Scripts/Citadel-x86_64/"

# Copy the Native Messaging manifest files to the directory structure
cp citadel.browser.agent.json "$BUILD_ROOT/root/Library/Google/Chrome/NativeMessagingHosts/"
cp citadel.browser.agent-firefox.json "$BUILD_ROOT/root/Library/Application Support/Mozilla/NativeMessagingHosts/citadel.browser.agent.json"
cp citadel.browser.agent.json "$BUILD_ROOT/root/Library/Opera/NativeMessagingHosts/"
cp citadel.browser.agent.json "$BUILD_ROOT/root/Library/Microsoft Edge/NativeMessagingHosts/"
cp citadel.browser.agent.json "$BUILD_ROOT/root/Library/BraveSoftware/Brave-Browser/NativeMessagingHosts/"

cp postinstall "$BUILD_ROOT/scripts/"
chmod 755 "$BUILD_ROOT/scripts/postinstall"

pkgbuild --root "$BUILD_ROOT/root" \
         --identifier "$PACKAGE_ID" \
         --version "$VERSION" \
         --scripts "$BUILD_ROOT/scripts" \
         --install-location "/" \
         "$OUTPUT_PKG"

rm -rf "$BUILD_ROOT"

echo "Universal package created: $OUTPUT_PKG"