#!/bin/bash
set -euo pipefail

PACKAGE_NAME="citadel-browser-agent"
VERSION="1.5.0"
PACKAGE_MAINTAINER="Citadel Agent <contact@citadelagent.org>"
BUILD_ROOT="$(mktemp -d /tmp/citadel-XXXXXXXX)"

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
    citadel-browser-setup \
    citadel-browser-setup.service \
    citadel-browser-setup.timer \
    citadel-snap-policy \
    citadel-snap-policy.service \
    citadel-snap-policy.timer \
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

# Firefox native-messaging locations differ between distribution families:
# Debian/Ubuntu use usr/lib, Fedora/RHEL (RPM) use usr/lib64.
FIREFOX_NATIVE_HOST_DIR_DEB="usr/lib/mozilla/native-messaging-hosts"
FIREFOX_NATIVE_HOST_DIR_RPM="usr/lib64/mozilla/native-messaging-hosts"

# Owner of every packaged file. Without this, fpm keeps the uid of whoever
# runs the build, which would make /opt/citadel-agent owned by an arbitrary
# user on the target machine.
FPM_COMMON_ARGS=(
    -s dir
    -n "$PACKAGE_NAME"
    -v "$VERSION"
    --force
    --maintainer "$PACKAGE_MAINTAINER"
    --description "Citadel browser agent"
    --url "https://www.citadelagent.org"
    --after-install postinstall.sh
    --after-remove postremove.sh
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

    # Executable bits come from the PyInstaller output (run by build.sh) and
    # are preserved by cp -a.
    chmod 0755 "$STAGE/opt" "$STAGE/opt/citadel-agent"

    # --- Chromium-family native-messaging manifests ---

    for DIR in "${CHROMIUM_NATIVE_HOST_DIRS[@]}"; do
        install -d -m 0755 "$STAGE/$DIR"
        install -m 0644 \
            citadel.browser.agent.json \
            "$STAGE/$DIR/citadel.browser.agent.json"
    done

    # --- Firefox native-messaging manifest (Debian layout) ---
    #
    # The RPM-specific location is added after the .deb has been built.

    install -d -m 0755 "$STAGE/$FIREFOX_NATIVE_HOST_DIR_DEB"
    install -m 0644 \
        citadel.browser.agent-firefox.json \
        "$STAGE/$FIREFOX_NATIVE_HOST_DIR_DEB/citadel.browser.agent.json"

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

    # Chromium policy for Snap Chromium, which does not read /etc/chromium.
    # citadel-snap-policy copies it into /var/snap/chromium when that snap
    # exists; a system timer repeats that so a later snap install is covered.
    install -m 0644 \
        citadel-policy.json \
        "$STAGE/usr/share/citadel-browser-agent/chromium-policy.json"

    install -m 0755 citadel-snap-policy \
        "$STAGE/opt/citadel-agent/citadel-snap-policy"
    install -d -m 0755 "$STAGE/usr/lib/systemd/system/timers.target.wants"
    install -m 0644 citadel-snap-policy.service \
        "$STAGE/usr/lib/systemd/system/citadel-snap-policy.service"
    install -m 0644 citadel-snap-policy.timer \
        "$STAGE/usr/lib/systemd/system/citadel-snap-policy.timer"
    ln -s ../citadel-snap-policy.timer \
        "$STAGE/usr/lib/systemd/system/timers.target.wants/citadel-snap-policy.timer"

    # --- Per-user setup timer ---
    #
    # Vendor units for every user's systemd user manager. The symlink in
    # timers.target.wants enables the timer for all users; both disappear
    # with the package.

    install -d -m 0755 "$STAGE/usr/lib/systemd/user/timers.target.wants"
    install -m 0644 citadel-browser-setup.service \
        "$STAGE/usr/lib/systemd/user/citadel-browser-setup.service"
    install -m 0644 citadel-browser-setup.timer \
        "$STAGE/usr/lib/systemd/user/citadel-browser-setup.timer"
    ln -s ../citadel-browser-setup.timer \
        "$STAGE/usr/lib/systemd/user/timers.target.wants/citadel-browser-setup.timer"

    # --- Flatpak per-user native-messaging integration ---
    #
    # These manifest templates are the same files staged into the system-wide
    # native-messaging-hosts directories below; citadel-browser-setup reuses
    # them as templates when generating per-user manifests for Flatpak
    # browsers, since Flatpak sandboxes cannot see system paths at all.

    install -d -m 0755 "$STAGE/opt/citadel-agent/manifests"
    install -m 0644 \
        citadel.browser.agent.json \
        "$STAGE/opt/citadel-agent/manifests/citadel.browser.agent.json"
    install -m 0644 \
        citadel.browser.agent-firefox.json \
        "$STAGE/opt/citadel-agent/manifests/citadel.browser.agent-firefox.json"
    install -m 0755 \
        citadel-browser-setup \
        "$STAGE/opt/citadel-agent/citadel-browser-setup"

    # --- Debian package ---
    #
    # fpm flags everything under /etc as a conffile by default, which would
    # leave the Chromium policy (force-install list) active after a plain
    # "apt remove". The fragments are uniquely named and package-owned, so
    # treat them as ordinary files. Firefox's active policies.json is not in
    # the archive; it is managed by the lifecycle scripts.

    fpm "${FPM_COMMON_ARGS[@]}" -t deb \
        -a "$DEB_ARCH" \
        --deb-user root --deb-group root \
        --deb-no-default-config-files \
        --deb-recommends python3 \
        --deb-recommends lsof \
        -C "$STAGE" \
        -p "citadel-browser-agent-${VERSION}-${DEB_ARCH}.deb" \
        opt etc usr

    # --- RPM package ---
    #
    # RPM keeps fpm's default of %config(noreplace) for /etc files: an
    # unmodified file is removed with the package, a modified one is kept
    # as .rpmsave.

    install -d -m 0755 "$STAGE/$FIREFOX_NATIVE_HOST_DIR_RPM"
    install -m 0644 \
        citadel.browser.agent-firefox.json \
        "$STAGE/$FIREFOX_NATIVE_HOST_DIR_RPM/citadel.browser.agent.json"

    fpm "${FPM_COMMON_ARGS[@]}" -t rpm \
        -a "$RPM_ARCH" \
        --rpm-user root --rpm-group root \
        --rpm-tag "Recommends: python3" \
        --rpm-tag "Recommends: lsof" \
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