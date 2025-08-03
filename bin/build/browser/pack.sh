#!/bin/bash

set -e

OUTPUT_BUNDLE="./utils/injected/bundle/citadel-bundle.js"

rm -f "$OUTPUT_BUNDLE"


cd ../../..

cat \
    ./utils/context.js \
    ./utils/encryption/pbkdf2.js \
    ./utils/trust/passwords.js \
    ./utils/trust/mfa.js \
    ./utils/injected/citadel-page-script.js \
    > "$OUTPUT_BUNDLE"
