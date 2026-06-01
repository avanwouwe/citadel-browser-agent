#!/bin/bash
set -euo pipefail

openssl genrsa -aes256 -out citadel-signing.key 2048

openssl req -new -x509 \
  -key citadel-signing.key \
  -out citadel-signing.crt \
  -days 3650 \
  -subj "/CN=Citadel Agent Signing" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=codeSigning"

echo ""
echo "Certificate SHA-1 fingerprint (H\"...\" in CSRL is always SHA-1):"
openssl x509 -in citadel-signing.crt -noout -fingerprint -sha1 \
  | sed 's/://g' \
  | sed 's/SHA1 Fingerprint=//' \
  | tr '[:upper:]' '[:lower:]'

echo ""
echo "Do not paste this into the profile directly."
echo "After signing the binary, run:"
echo "  codesign -d --requirements - /your/install/path/citadel-browser-agent 2>&1 | grep 'designated =>'"
echo "and paste that line verbatim into CodeRequirement."
echo ""
echo "Store citadel-signing.key and citadel-signing.crt somewhere safe."
echo "Run import-cert.sh to make the certificate available for signing."