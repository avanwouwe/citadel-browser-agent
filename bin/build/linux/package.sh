#!/bin/bash
set -euo pipefail

PACKAGE_NAME="citadel-browser-agent"
VERSION="1.5.0"
BUILD_ROOT="/tmp/citadel-$(uuidgen)"

# fpm builds .deb and .rpm from the same staged tree. Install via:
#   sudo apt-get install -y ruby ruby-dev rubygems build-essential rpm
#   sudo gem install --no-document fpm
# ('rpm' package above only provides rpmbuild, so fpm can emit .rpm output
# even when this script itself is run on a Debian/Ubuntu host - you do NOT
# need to run this once per distro family, only once per architecture.)
if ! command -v fpm &>/dev/null; then
    echo "Error: fpm not found. See comment above for install instructions." >&2
    exit 1
fi

# Verify at least one architecture build exists
if ! compgen -G "binaries/*/" > /dev/null; then
    echo "Error: no architecture builds found in binaries/. Run build.sh first." >&2
    exit 1
fi

declare -A DEB_ARCH_MAP=( [x86_64]="amd64" [arm64]="arm64" )
declare -A RPM_ARCH_MAP=( [x86_64]="x86_64" [arm64]="aarch64" )

for ARCH_DIR in binaries/*/; do
    BUILD_ARCH="$(basename "$ARCH_DIR")"

    DEB_ARCH="${DEB_ARCH_MAP[$BUILD_ARCH]:-}"
    RPM_ARCH="${RPM_ARCH_MAP[$BUILD_ARCH]:-}"
    if [ -z "$DEB_ARCH" ] || [ -z "$RPM_ARCH" ]; then
        echo "Warning: unknown architecture '$BUILD_ARCH', skipping." >&2
        continue
    fi

    echo "Staging package contents for $BUILD_ARCH..."

    STAGE="$BUILD_ROOT/$BUILD_ARCH"
    rm -rf "$STAGE"

    # --- agent binary + control packs ---
    mkdir -p "$STAGE/opt/citadel-agent"
    cp -r "binaries/$BUILD_ARCH/"* "$STAGE/opt/citadel-agent/"
    cp -r ../../controls "$STAGE/opt/citadel-agent/"

    # --- native messaging host manifests (system-wide, all users) ---
    for DIR in \
        "etc/opt/chrome/native-messaging-hosts" \
        "etc/opt/edge/native-messaging-hosts" \
        "etc/brave/native-messaging-hosts" \
        "etc/opt/opera/native-messaging-hosts"
    do
        mkdir -p "$STAGE/$DIR"
        cp citadel.browser.agent-chromium.json "$STAGE/$DIR/citadel.browser.agent.json"
    done

    # Firefox: install to both the Debian/Ubuntu-family path (merged
    # /usr/lib) and the Fedora/RHEL/openSUSE-family path (/usr/lib64) so
    # one package works across both without detecting the distro.
    for DIR in "usr/lib/mozilla/native-messaging-hosts" "usr/lib64/mozilla/native-messaging-hosts"; do
        mkdir -p "$STAGE/$DIR"
        cp citadel.browser.agent-firefox.json "$STAGE/$DIR/citadel.browser.agent.json"
    done

    # --- enterprise policies: force-install + native messaging allowlist,
    # the Linux equivalent of the macOS mobileconfig's
    # ExtensionInstallForcelist/NativeMessagingAllowlist payloads. ---
    for DIR in \
        "etc/opt/chrome/policies/managed" \
        "etc/opt/edge/policies/managed" \
        "etc/brave/policies/managed" \
        "etc/opt/opera/policies/managed"
    do
        mkdir -p "$STAGE/$DIR"
        cp citadel-policy-chromium.json "$STAGE/$DIR/citadel-policy.json"
    done

    mkdir -p "$STAGE/etc/firefox/policies"
    cp citadel-policy-firefox.json "$STAGE/etc/firefox/policies/policies.json"

    # --- .deb ---
    fpm -s dir -t deb \
        -n "$PACKAGE_NAME" \
        -v "$VERSION" \
        -a "$DEB_ARCH" \
        --description "Citadel browser agent" \
        --url "https://www.citadelagent.org" \
        --after-install postinstall.sh \
        --before-remove preremove.sh \
        --config-files etc \
        -C "$STAGE" \
        -p "citadel-browser-agent-${VERSION}-${DEB_ARCH}.deb" \
        opt etc

    # --- .rpm ---
    fpm -s dir -t rpm \
        -n "$PACKAGE_NAME" \
        -v "$VERSION" \
        -a "$RPM_ARCH" \
        --description "Citadel browser agent" \
        --url "https://www.citadelagent.org" \
        --after-install postinstall.sh \
        --before-remove preremove.sh \
        --config-files etc \
        -C "$STAGE" \
        -p "citadel-browser-agent-${VERSION}-${RPM_ARCH}.rpm" \
        opt etc

    echo "Created: citadel-browser-agent-${VERSION}-${DEB_ARCH}.deb, citadel-browser-agent-${VERSION}-${RPM_ARCH}.rpm"
done

rm -rf "$BUILD_ROOT"
echo "Packaging completed."