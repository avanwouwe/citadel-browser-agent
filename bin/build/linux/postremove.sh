#!/bin/sh
set -eu

FIREFOX_POLICY_DIR="/etc/firefox/policies"
FIREFOX_POLICY_FILE="$FIREFOX_POLICY_DIR/policies.json"

CITADEL_STATE_DIR="/var/lib/citadel-browser-agent"
CITADEL_POLICY_STATE="$CITADEL_STATE_DIR/firefox-policy.sha256"

file_hash() {
    sha256sum "$1" | awk '{print $1}'
}

# Do not remove policies during an upgrade.
#
# Debian postrm arguments include:
#   remove     final ordinary removal
#   purge      final purge
#   upgrade    package upgrade
#
# RPM %postun receives:
#   0          final removal
#   1          upgrade
case "${1:-}" in
    remove|purge|0)
        ;;
    *)
        exit 0
        ;;
esac

# Without a state file, Citadel did not create the active Firefox policy.
if [ ! -f "$CITADEL_POLICY_STATE" ]; then
    exit 0
fi

INSTALLED_HASH="$(cat "$CITADEL_POLICY_STATE")"

# Never follow or remove a symbolic link.
if [ -L "$FIREFOX_POLICY_FILE" ]; then
    echo "Citadel: preserving Firefox policy symlink:" >&2
    echo "  $FIREFOX_POLICY_FILE" >&2
elif [ -f "$FIREFOX_POLICY_FILE" ]; then
    CURRENT_HASH="$(file_hash "$FIREFOX_POLICY_FILE")"

    if [ "$CURRENT_HASH" = "$INSTALLED_HASH" ]; then
        rm -f "$FIREFOX_POLICY_FILE"

        echo "Citadel: removed Firefox policy created by Citadel:"
        echo "  $FIREFOX_POLICY_FILE"
    else
        echo "Citadel: preserving modified Firefox policy:" >&2
        echo "  $FIREFOX_POLICY_FILE" >&2
    fi
elif [ -e "$FIREFOX_POLICY_FILE" ]; then
    echo "Citadel: preserving non-regular Firefox policy path:" >&2
    echo "  $FIREFOX_POLICY_FILE" >&2
fi

# Remove Citadel's ownership marker on final package removal. If a modified
# policy was preserved, a later Citadel installation will see it as an
# administrator-owned pre-existing policy.
rm -f "$CITADEL_POLICY_STATE"

# Remove directories only when empty.
rmdir "$CITADEL_STATE_DIR" 2>/dev/null || true
rmdir "$FIREFOX_POLICY_DIR" 2>/dev/null || true