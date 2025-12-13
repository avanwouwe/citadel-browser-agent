#!/bin/bash

set -e
cd ../../..

BUNDLE_DIR="./utils/injected/bundle"

bundle() {
    local output="$1"
    shift
    rm -f "$output"
    cat "$@" > "$output"
}

START_FILES=(
    ./utils/injected/citadel-page-script.js
)

IDLE_FILES=(
    ./utils/context.js
    ./utils/encryption/pbkdf2.js
    ./utils/trust/passwords.js
    ./utils/trust/mfa.js
)

bundle "$BUNDLE_DIR/citadel-bundle-start.js" "${START_FILES[@]}"
bundle "$BUNDLE_DIR/citadel-bundle-idle.js" "${IDLE_FILES[@]}"