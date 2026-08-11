#!/bin/bash
set -euo pipefail

PACKAGE_NAME="citadel-browser-agent"
VERSION="1.5.0"
PACKAGE_MAINTAINER="Citadel Agent <contact@citadelagent.org>"
BUILD_ROOT="/tmp/citadel-$(uuidgen)"

cleanup() {
    rm -rf "$BUILD_ROOT"
}
trap cleanup EXIT

# fpm builds .deb and .rpm packages from the same staged tree. Install via:
#
#   sudo apt-get install -y ruby ruby-dev rubygems build-essential rpm
#   sudo gem install --no-document fpm
#
# The rpm package provides rpmbuild, allowing fpm to emit RPM packages when
# this script is run on a Debian/Ubuntu host. The script only needs to be run
# once per architecture, not once per distribution family.
if ! command -v fpm &>/dev/null; then
    echo "Error: fpm not found. See the installation instructions above." >&2
    exit 1
fi

# Verify that at least one architecture build exists.
if ! compgen -G "binaries/*/" >/dev/null; then
    echo "Error: no architecture builds found in binaries/. Run build.sh first." >&2
    exit 1
fi

# Verify all packaging inputs before staging anything.
for REQUIRED_FILE in \
    citadel.browser.agent.json \
    citadel.browser.agent-firefox.json \
    citadel-policy.json \
    citadel-policy-firefox.json \
    postinstall.sh \
    postremove.sh
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
# Arc and Comet are intentionally absent because they currently have no
# documented conventional Linux package/native-messaging locations.
CHROMIUM_NATIVE_HOST_DIRS=(
    "etc/opt/chrome/native-messaging-hosts"
    "etc/chromium/native-messaging-hosts"
    "etc/opt/edge/native-messaging-hosts"
    "etc/brave/native-messaging-hosts"
    "etc/opt/opera/native-messaging-hosts"
)

# System-wide managed-policy locations for supported Chromium-family Linux
# browsers. Chromium supports multiple policy fragments, so Citadel can use a
# uniquely named package-owned file.
CHROMIUM_POLICY_DIRS=(
    "etc/opt/chrome/policies/managed"
    "etc/chromium/policies/managed"
    "etc/opt/edge/policies/managed"
    "etc/brave/policies/managed"
    "etc/opt/opera/policies/managed"
)

# Firefox native-messaging locations differ between distribution families.
FIREFOX_NATIVE_HOST_DIRS=(
    "usr/lib/mozilla/native-messaging-hosts"
    "usr/lib64/mozilla/native-messaging-hosts"
)

BUILT_ANY=false

for ARCH_DIR in binaries/*/; do
    BUILD_ARCH="$(basename "$ARCH_DIR")"

    DEB_ARCH="${DEB_ARCH_MAP[$BUILD_ARCH]:-}"
    RPM_ARCH="${RPM_ARCH_MAP[$BUILD_ARCH]:-}"

    if [ -z "$DEB_ARCH" ] || [ -z "$RPM_ARCH" ]; then
        echo "Warning: unknown architecture '$BUILD_ARCH', skipping." >&2
        continue
    fi

    BUILT_ANY=true

    echo "Staging package contents for $BUILD_ARCH..."

    STAGE="$BUILD_ROOT/$BUILD_ARCH"
    rm -rf "$STAGE"

    # --- Agent binaries and control packs ---

    install -d -m 0755 "$STAGE/opt/citadel-agent"
    cp -a "binaries/$BUILD_ARCH/." "$STAGE/opt/citadel-agent/"
    cp -a ../../controls "$STAGE/opt/citadel-agent/"

    # Individual executable bits are expected to have been set by build.sh.
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
    # staged tree can be used without build-time distribution detection.

    for DIR in "${FIREFOX_NATIVE_HOST_DIRS[@]}"; do
        install -d -m 0755 "$STAGE/$DIR"
        install -m 0644 \
            citadel.browser.agent-firefox.json \
            "$STAGE/$DIR/citadel.browser.agent.json"
    done

    # --- Chromium-family enterprise policies ---
    #
    # Chromium supports multiple policy fragments. Citadel's uniquely named
    # files are normal package-owned files and are automatically removed when
    # the package is uninstalled.

    for DIR in "${CHROMIUM_POLICY_DIRS[@]}"; do
        install -d -m 0755 "$STAGE/$DIR"
        install -m 0644 \
            citadel-policy.json \
            "$STAGE/$DIR/citadel-policy.json"
    done

    # --- Firefox enterprise-policy template ---
    #
    # Firefox supports only one system-wide policies.json and does not support
    # policy fragments. Do not package the active file directly because it may
    # already belong to an administrator or another product.
    #
    # Instead, package Citadel's complete policy under a private location.
    # postinstall.sh will copy it into place only when policies.json does not
    # already exist.

    install -d -m 0755 "$STAGE/usr/share/citadel-browser-agent"
    install -m 0644 \
        citadel-policy-firefox.json \
        "$STAGE/usr/share/citadel-browser-agent/firefox-policy.json"

    # --- Debian package ---
    #
    # No files are marked as configuration files:
    #
    # - Chromium policy fragments are ordinary package-owned files.
    # - Firefox's active policies.json is generated and managed by the
    #   lifecycle scripts; it is not present in the package archive.

    fpm -s dir -t deb \
        -n "$PACKAGE_NAME" \
        -v "$VERSION" \
        -a "$DEB_ARCH" \
        --maintainer "$PACKAGE_MAINTAINER" \
        --description "Citadel browser agent" \
        --url "https://www.citadelagent.org" \
        --after-install postinstall.sh \
        --after-remove postremove.sh \
        -C "$STAGE" \
        -p "citadel-browser-agent-${VERSION}-${DEB_ARCH}.deb" \
        opt etc usr

    # --- RPM package ---

    fpm -s dir -t rpm \
        -n "$PACKAGE_NAME" \
        -v "$VERSION" \
        -a "$RPM_ARCH" \
        --maintainer "$PACKAGE_MAINTAINER" \
        --description "Citadel browser agent" \
        --url "https://www.citadelagent.org" \
        --after-install postinstall.sh \
        --after-remove postremove.sh \
        -C "$STAGE" \
        -p "citadel-browser-agent-${VERSION}-${RPM_ARCH}.rpm" \
        opt etc usr

    echo "Created:"
    echo "  citadel-browser-agent-${VERSION}-${DEB_ARCH}.deb"
    echo "  citadel-browser-agent-${VERSION}-${RPM_ARCH}.rpm"
done

if [ "$BUILT_ANY" = false ]; then
    echo "Error: no supported architecture builds were found." >&2
    exit 1
fi

echo "Packaging completed."