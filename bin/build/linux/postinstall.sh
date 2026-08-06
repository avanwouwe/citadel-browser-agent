#!/bin/bash
set -euo pipefail

chown -R root:root /opt/citadel-agent
chmod -R go-w /opt/citadel-agent
chmod 755 /opt/citadel-agent/citadel-browser-agent

find /etc/opt/chrome/native-messaging-hosts /etc/opt/edge/native-messaging-hosts \
     /etc/brave/native-messaging-hosts /etc/opt/opera/native-messaging-hosts \
     /usr/lib/mozilla/native-messaging-hosts /usr/lib64/mozilla/native-messaging-hosts \
     /etc/opt/chrome/policies/managed /etc/opt/edge/policies/managed \
     /etc/brave/policies/managed /etc/opt/opera/policies/managed \
     /etc/firefox/policies \
     -type f -name '*.json' \
     -exec chown root:root {} \; -exec chmod 644 {} \; 2>/dev/null || true

exit 0