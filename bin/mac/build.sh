#!/bin/bash

# Define variables for the package
PACKAGE_ID="nl.vanwouwe.citadel"
VERSION="1.2"
BUILD_ROOT="/tmp/citadel-$(uuidgen)"
OUTPUT_PKG="citadel-browser-agent-$VERSION.pkg"

rm -f "$OUTPUT_PKG"

# Create the directory structure
mkdir -p "$BUILD_ROOT/root/Library/Google/Chrome/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/root/Library/Application Support/Mozilla/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/root/Library/Opera/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/root/Library/Microsoft Edge/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/root/Library/Scripts/Citadel"

# Copy the files to the directory structure
cp citadel.browser.agent.json "$BUILD_ROOT/root/Library/Google/Chrome/NativeMessagingHosts/"
cp citadel.browser.agent-firefox.json "$BUILD_ROOT/root/Library/Application Support/Mozilla/NativeMessagingHosts/citadel.browser.agent.json"
cp citadel.browser.agent.json "$BUILD_ROOT/root/Library/Opera/NativeMessagingHosts/"
cp citadel.browser.agent.json "$BUILD_ROOT/root/Library/Microsoft Edge/NativeMessagingHosts/"
cp ../citadel-browser-agent "$BUILD_ROOT/root/Library/Scripts/Citadel/"

# Run pkgbuild to create the package
pkgbuild --root "$BUILD_ROOT/root" \
         --identifier "$PACKAGE_ID" \
         --version "$VERSION" \
         --install-location "/" \
         "$OUTPUT_PKG"

rm -rf "$BUILD_ROOT"
