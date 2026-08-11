#!/bin/sh
set -eu

FIREFOX_POLICY_SOURCE="/usr/share/citadel-browser-agent/firefox-policy.json"
CITADEL_STATE_DIR="/var/lib/citadel-browser-agent"

file_hash() {
    sha256sum "$1" | awk '{print $1}'
}

write_policy_state() {
    # $1 = state file, $2 = policy file whose hash we're recording
    STATE_TEMP="$1.tmp.$$"

    file_hash "$2" > "$STATE_TEMP"
    chmod 0600 "$STATE_TEMP"
    mv -f "$STATE_TEMP" "$1"
}

# Detects the real Firefox install prefix and prints its
# "distribution" directory, e.g. /usr/lib/firefox/distribution.
# Returns non-zero (and prints nothing) if Firefox is not found,
# or if it's clearly a snap/flatpak build that a postinst can't manage.
detect_firefox_distribution_dir() {
    FX_BIN="$(command -v firefox 2>/dev/null || true)"
    [ -n "$FX_BIN" ] || return 1

    FX_REAL="$(readlink -f "$FX_BIN" 2>/dev/null || echo "$FX_BIN")"

    case "$FX_REAL" in
        /snap/*|*/snapd/*)
            return 1
            ;;
    esac

    if [ ! -e "$FX_REAL" ]; then
        return 1
    fi

    FX_DIR="$(dirname "$FX_REAL")"
    printf '%s/distribution\n' "$FX_DIR"
}

# Installs (and tracks) a Citadel-managed policies.json at one target
# location, without ever clobbering an admin's own file or a symlink.
#
#   $1 = human-readable label, for log messages
#   $2 = destination directory (created if missing)
#   $3 = destination policies.json path
#   $4 = state file recording the hash Citadel last wrote there
install_firefox_policy() {
    LABEL="$1"
    POLICY_DIR="$2"
    POLICY_FILE="$3"
    STATE_FILE="$4"

    if [ ! -f "$FIREFOX_POLICY_SOURCE" ]; then
        echo "Citadel: packaged Firefox policy template is missing:" >&2
        echo "  $FIREFOX_POLICY_SOURCE" >&2
        return 1
    fi

    # A state file means Citadel created this policies.json during an
    # earlier installation. This normally indicates that the package is
    # being upgraded or reconfigured.
    if [ -f "$STATE_FILE" ]; then
        PREVIOUS_HASH="$(cat "$STATE_FILE")"

        # Never follow or replace a symbolic link.
        if [ -L "$POLICY_FILE" ]; then
            echo "Citadel: preserving Firefox ($LABEL) policy symlink:" >&2
            echo "  $POLICY_FILE" >&2
            return 0
        fi

        if [ -f "$POLICY_FILE" ]; then
            CURRENT_HASH="$(file_hash "$POLICY_FILE")"

            if [ "$CURRENT_HASH" = "$PREVIOUS_HASH" ]; then
                # The policy still matches the version Citadel last
                # installed, so update it to the policy from the new
                # package.
                install -m 0644 \
                    "$FIREFOX_POLICY_SOURCE" \
                    "$POLICY_FILE"

                write_policy_state "$STATE_FILE" "$POLICY_FILE"

                echo "Citadel: updated Firefox ($LABEL) policy:"
                echo "  $POLICY_FILE"
            else
                # The administrator has modified or replaced the file,
                # perhaps with a merged policy. Do not overwrite it.
                echo "Citadel: preserving modified Firefox ($LABEL) policy:" >&2
                echo "  $POLICY_FILE" >&2
                echo "Citadel: reconcile policy changes manually using:" >&2
                echo "  $FIREFOX_POLICY_SOURCE" >&2
            fi

            return 0
        fi

        if [ -e "$POLICY_FILE" ]; then
            echo "Citadel: Firefox ($LABEL) policy path is not a regular" >&2
            echo "Citadel: file; leaving it unchanged:" >&2
            echo "  $POLICY_FILE" >&2
            return 0
        fi

        # Citadel previously created the policy, but the active file has
        # since disappeared. Recreate it from the current package
        # template.
        install -d -m 0755 "$POLICY_DIR"
        install -d -m 0755 "$CITADEL_STATE_DIR"

        install -m 0644 \
            "$FIREFOX_POLICY_SOURCE" \
            "$POLICY_FILE"

        write_policy_state "$STATE_FILE" "$POLICY_FILE"

        echo "Citadel: restored Firefox ($LABEL) policy:"
        echo "  $POLICY_FILE"

        return 0
    fi

    # No Citadel ownership state exists. An existing path belongs to the
    # administrator or another product, so it must not be overwritten.
    if [ -e "$POLICY_FILE" ] || [ -L "$POLICY_FILE" ]; then
        echo "Citadel: existing Firefox ($LABEL) policy was left unchanged:" >&2
        echo "  $POLICY_FILE" >&2
        echo "Citadel: merge Citadel's policy into it manually from:" >&2
        echo "  $FIREFOX_POLICY_SOURCE" >&2
        return 0
    fi

    # No policy exists. Install Citadel's complete policy and record the
    # exact contents so uninstall/upgrade can determine whether it
    # remains unchanged.
    install -d -m 0755 "$POLICY_DIR"
    install -d -m 0755 "$CITADEL_STATE_DIR"

    install -m 0644 \
        "$FIREFOX_POLICY_SOURCE" \
        "$POLICY_FILE"

    write_policy_state "$STATE_FILE" "$POLICY_FILE"

    echo "Citadel: installed Firefox ($LABEL) policy:"
    echo "  $POLICY_FILE"
}

install_firefox_policies() {
    # Debian-patched Firefox/Firefox-ESR builds read this location.
    # Kept unconditionally: harmless if unused, required if present.
    install_firefox_policy \
        "system" \
        "/etc/firefox/policies" \
        "/etc/firefox/policies/policies.json" \
        "$CITADEL_STATE_DIR/firefox-policy-etc.sha256"

    # Upstream Mozilla builds (including Mozilla's own .deb, and most
    # non-Debian-patched installs) only read distribution/policies.json
    # next to the actual firefox binary. Resolve that path dynamically
    # rather than assuming /usr/lib/firefox.
    if DIST_DIR="$(detect_firefox_distribution_dir)"; then
        install_firefox_policy \
            "distribution" \
            "$DIST_DIR" \
            "$DIST_DIR/policies.json" \
            "$CITADEL_STATE_DIR/firefox-policy-dist.sha256"
    else
        echo "Citadel: could not locate a manageable Firefox install;" >&2
        echo "Citadel: skipping distribution/policies.json." >&2
        echo "Citadel: if Firefox is installed as a snap or flatpak," >&2
        echo "Citadel: its sandbox prevents this package from managing" >&2
        echo "Citadel: policy automatically. See:" >&2
        echo "  $FIREFOX_POLICY_SOURCE" >&2
        echo "Citadel: for the policy to apply manually." >&2
    fi
}

install_firefox_policies