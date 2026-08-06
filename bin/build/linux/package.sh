#!/bin/bash
set -euo pipefail

PACKAGE_NAME="citadel-browser-agent"
VERSION="1.5.0"
BUILD_ROOT="/tmp/citadel-$(uuidgen)"

cleanup() {
    rm -rf "$BUILD_ROOT"
}
trap cleanup EXIT

# fpm builds .deb and .rpm from the same staged tree. Install via:
#   sudo apt-get install -y ruby ruby-dev rubygems build-essential rpm
#   sudo gem install --no-document fpm
#
# The rpm package above only provides rpmbuild, so fpm can emit .rpm output
# even when this script itself is run on a Debian/Ubuntu host. You do not
# need to run this once per distro family, only once per architecture.
if ! command -v fpm &>/dev/null; then
    echo "Error: fpm not found. See comment above for installation instructions." >&2
    exit 1
fi

# Verify at least one architecture build exists.
if ! compgen -G "binaries/*/" >/dev/null; then
    echo "Error: no architecture builds found in binaries/. Run build.sh first." >&2
    exit 1
fi

# Verify packaging inputs before doing any staging.
for REQUIRED_FILE in \
    citadel.browser.agent.json \
    citadel.browser.agent-firefox.json \
    citadel-policy.json \
    citadel-policy-firefox.json \
    postinstall.sh \
    preremove.sh
do
    if [ ! -f "$REQUIRED_FILE" ]; then
        echo "Error: required packaging file not found: $REQUIRED_FILE" >&2
        exit 1
    fi
done

if [ ! -d ../../controls ]; then
    echo "Error: controls directory not found: ../../controls" >&2
    exit 1
fi

declare -A DEB_ARCH_MAP=(
    [x86_64]="amd64"
    [arm64]="arm64"
)

declare -A RPM_ARCH_MAP=(
    [x86_64]="x86_64"
    [arm64]="aarch64"
)

# System-wide native-messaging manifest locations for supported
# Chromium-family Linux browsers.
#
# Arc and Comet are intentionally absent: they currently have no documented,
# conventional Linux package/native-messaging locations to target.
CHROMIUM_NATIVE_HOST_DIRS=(
    "etc/opt/chrome/native-messaging-hosts"
    "etc/chromium/native-messaging-hosts"
    "etc/opt/edge/native-messaging-hosts"
    "etc/brave/native-messaging-hosts"
    "etc/opt/opera/native-messaging-hosts"
)

# System-wide managed-policy locations for supported Chromium-family
# Linux browsers.
CHROMIUM_POLICY_DIRS=(
    "etc/opt/chrome/policies/managed"
    "etc/chromium/policies/managed"
    "etc/opt/edge/policies/managed"
    "etc/brave/policies/managed"
    "etc/opt/opera/policies/managed"
)

# Firefox native-messaging paths differ between distribution families.
FIREFOX_NATIVE_HOST_DIRS=(
    "usr/lib/mozilla/native-messaging-hosts"
    "usr/lib64/mozilla/native-messaging-hosts"
)

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

    # --- Agent binaries and control packs ---
    install -d -m 0755 "$STAGE/opt/citadel-agent"
    cp -a "binaries/$BUILD_ARCH/." "$STAGE/opt/citadel-agent/"
    cp -a ../../controls "$STAGE/opt/citadel-agent/"

    # Ensure packaged binaries and directories are traversable. Individual
    # binary executable bits are expected to have been set by build.sh.
    chmod 0755 "$STAGE/opt" "$STAGE/opt/citadel-agent"

    # --- Chromium-family native-messaging manifests ---
    for DIR in "${CHROMIUM_NATIVE_HOST_DIRS[@]}"; do
        install -d -m 0755 "$STAGE/$DIR"
        install -m 0644 \
            citadel.browser.agent.json \
            "$STAGE/$DIR/citadel.browser.agent.json"
    done

    # --- Firefox native-messaging manifests ---
    #
    # Install to both Debian/Ubuntu-family and RPM-family paths so the same
    # staged package works without build-time distribution detection.
    for DIR in "${FIREFOX_NATIVE_HOST_DIRS[@]}"; do
        install -d -m 0755 "$STAGE/$DIR"
        install -m 0644 \
            citadel.browser.agent-firefox.json \
            "$STAGE/$DIR/citadel.browser.agent.json"
    done

    # --- Chromium-family enterprise policies ---
    #
    # These provide force installation and native-messaging policy settings,
    # equivalent to the macOS configuration-profile payloads.
    for DIR in "${CHROMIUM_POLICY_DIRS[@]}"; do
        install -d -m 0755 "$STAGE/$DIR"
        install -m 0644 \
            citadel-policy.json \
            "$STAGE/$DIR/citadel-policy.json"
    done

    # --- Firefox enterprise policy ---
    #
    # Firefox expects the policy file to be named policies.json. Unlike
    # Chromium's managed policy directories, Firefox does not support multiple
    # policy fragments in this location.
    install -d -m 0755 "$STAGE/etc/firefox/policies"
    install -m 0644 \
        citadel-policy-firefox.json \
        "$STAGE/etc/firefox/policies/policies.json"

    # --- Debian package ---
    #
    # Include usr as well as opt and etc. The previous script staged Firefox
    # native-host manifests under usr but did not include usr in the package.
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
        opt etc usr

    # --- RPM package ---
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
        opt etc usr

    echo "Created:"
    echo "  citadel-browser-agent-${VERSION}-${DEB_ARCH}.deb"
    echo "  citadel-browser-agent-${VERSION}-${RPM_ARCH}.rpm"
done

echo "Packaging completed."