#!/bin/bash
set -euo pipefail

# BUILD-MACHINE ONLY. Do NOT run this on end-user machines and do NOT ship
# citadel-signing.crt to them. PPPC matches the leaf cert by SHA-1 hash
# (pinned in the .mobileconfig); endpoints need nothing in their keychain.
# Adding this self-signed cert as a trustRoot on a user machine would let
# anything signed by this key bypass Gatekeeper system-wide.

# Remove any existing copies to avoid ambiguity
security delete-certificate -c "Citadel Agent Signing" \
  ~/Library/Keychains/login.keychain-db 2>/dev/null || true

# Regenerate p12 — ephemeral
openssl pkcs12 -export \
  -in citadel-signing.crt \
  -inkey citadel-signing.key \
  -out citadel-signing.p12 \
  -legacy \
  -passout pass:"temp"

# Import then immediately delete
security import citadel-signing.p12 \
  -k ~/Library/Keychains/login.keychain-db \
  -T /usr/bin/codesign \
  -P "temp"

rm citadel-signing.p12

# Trust for code signing
security add-trusted-cert \
  -r trustRoot \
  -k ~/Library/Keychains/login.keychain-db \
  citadel-signing.crt

echo ""
echo "Certificate imported and trusted."
security find-identity -v -p codesigning