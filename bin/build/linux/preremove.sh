#!/bin/bash
set -euo pipefail
# dpkg/rpm already remove all package-owned files automatically on
# uninstall; nothing else currently needs cleanup here. Kept as a hook
# point for future use (e.g. purging a locally-generated config file that
# isn't itself part of the package).
exit 0