#!/bin/bash

# Define variables for the package
PACKAGE_ID="nl.vanwouwe.citadel"
VERSION="1.0"
BUILD_ROOT="/tmp/citadel-$(uuidgen)"
OUTPUT_PKG="citadel-browser-agent-$VERSION.pkg"

rm -f "$OUTPUT_PKG"

# Create the directory structure
mkdir -p "$BUILD_ROOT/Library/Google/Chrome/NativeMessagingHosts"
mkdir -p "$BUILD_ROOT/Library/Scripts/Chrome"

# Copy the files to the directory structure
cp citadel.browser.agent.json "$BUILD_ROOT/Library/Google/Chrome/NativeMessagingHosts/"
cp ../citadel-browser-agent "$BUILD_ROOT/Library/Scripts/Chrome/"

# Run pkgbuild to create the package
pkgbuild --root "$BUILD_ROOT" \
         --identifier "$PACKAGE_ID" \
         --version "$VERSION" \
         --install-location "/" \
         "$OUTPUT_PKG"

rm -rf "$BUILD_ROOT"
