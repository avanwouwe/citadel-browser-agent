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

IDLE_FILES=(
    ./utils/context.js
    ./utils/encryption/secure-message.js
    ./utils/trust/passwords.js
    ./utils/trust/mfa.js
)

rm -rf $BUNDLE_DIR
mkdir -p $BUNDLE_DIR
bundle "$BUNDLE_DIR/citadel-bundle-idle.js" "${IDLE_FILES[@]}"