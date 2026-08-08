#!/bin/sh
set -eu

FIREFOX_POLICY_SOURCE="/usr/share/citadel-browser-agent/firefox-policy.json"
FIREFOX_POLICY_DIR="/etc/firefox/policies"
FIREFOX_POLICY_FILE="$FIREFOX_POLICY_DIR/policies.json"

CITADEL_STATE_DIR="/var/lib/citadel-browser-agent"
CITADEL_POLICY_STATE="$CITADEL_STATE_DIR/firefox-policy.sha256"

file_hash() {
    sha256sum "$1" | awk '{print $1}'
}

write_policy_state() {
    STATE_TEMP="$CITADEL_POLICY_STATE.tmp.$$"

    file_hash "$FIREFOX_POLICY_FILE" > "$STATE_TEMP"
    chmod 0600 "$STATE_TEMP"
    mv -f "$STATE_TEMP" "$CITADEL_POLICY_STATE"
}

install_firefox_policy() {
    if [ ! -f "$FIREFOX_POLICY_SOURCE" ]; then
        echo "Citadel: packaged Firefox policy template is missing:" >&2
        echo "  $FIREFOX_POLICY_SOURCE" >&2
        return 1
    fi

    # A state file means Citadel created policies.json during an earlier
    # installation. This normally indicates that the package is being
    # upgraded or reconfigured.
    if [ -f "$CITADEL_POLICY_STATE" ]; then
        PREVIOUS_HASH="$(cat "$CITADEL_POLICY_STATE")"

        # Never follow or replace a symbolic link.
        if [ -L "$FIREFOX_POLICY_FILE" ]; then
            echo "Citadel: preserving Firefox policy symlink:" >&2
            echo "  $FIREFOX_POLICY_FILE" >&2
            return 0
        fi

        if [ -f "$FIREFOX_POLICY_FILE" ]; then
            CURRENT_HASH="$(file_hash "$FIREFOX_POLICY_FILE")"

            if [ "$CURRENT_HASH" = "$PREVIOUS_HASH" ]; then
                # The policy still matches the version Citadel last installed,
                # so update it to the policy from the new package.
                install -m 0644 \
                    "$FIREFOX_POLICY_SOURCE" \
                    "$FIREFOX_POLICY_FILE"

                write_policy_state

                echo "Citadel: updated Firefox policy:"
                echo "  $FIREFOX_POLICY_FILE"
            else
                # The administrator has modified or replaced the file, perhaps
                # with a merged policy. Do not overwrite it.
                echo "Citadel: preserving modified Firefox policy:" >&2
                echo "  $FIREFOX_POLICY_FILE" >&2
                echo "Citadel: reconcile policy changes manually using:" >&2
                echo "  $FIREFOX_POLICY_SOURCE" >&2
            fi

            return 0
        fi

        if [ -e "$FIREFOX_POLICY_FILE" ]; then
            echo "Citadel: Firefox policy path is not a regular file;" >&2
            echo "Citadel: leaving it unchanged:" >&2
            echo "  $FIREFOX_POLICY_FILE" >&2
            return 0
        fi

        # Citadel previously created the policy, but the active file has since
        # disappeared. Recreate it from the current package template.
        install -d -m 0755 "$FIREFOX_POLICY_DIR"
        install -d -m 0755 "$CITADEL_STATE_DIR"

        install -m 0644 \
            "$FIREFOX_POLICY_SOURCE" \
            "$FIREFOX_POLICY_FILE"

        write_policy_state

        echo "Citadel: restored Firefox policy:"
        echo "  $FIREFOX_POLICY_FILE"

        return 0
    fi

    # No Citadel ownership state exists. An existing path belongs to the
    # administrator or another product, so it must not be overwritten.
    if [ -e "$FIREFOX_POLICY_FILE" ] ||
       [ -L "$FIREFOX_POLICY_FILE" ]; then
        echo "Citadel: existing Firefox policy was left unchanged:" >&2
        echo "  $FIREFOX_POLICY_FILE" >&2
        echo "Citadel: merge Citadel's policy into it manually from:" >&2
        echo "  $FIREFOX_POLICY_SOURCE" >&2
        return 0
    fi

    # No policy exists. Install Citadel's complete policy and record the exact
    # contents so uninstall can determine whether it remains unchanged.
    install -d -m 0755 "$FIREFOX_POLICY_DIR"
    install -d -m 0755 "$CITADEL_STATE_DIR"

    install -m 0644 \
        "$FIREFOX_POLICY_SOURCE" \
        "$FIREFOX_POLICY_FILE"

    write_policy_state

    echo "Citadel: installed Firefox policy:"
    echo "  $FIREFOX_POLICY_FILE"
}

install_firefox_policy

# Add any other existing Citadel post-install operations below this line.