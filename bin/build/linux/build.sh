#!/bin/bash
set -euo pipefail

PACKAGE_ID="org.citadelagent"

clean_build() {
    rm -rf build
    rm -rf dist
    rm -rf citadel-browser-agent.spec
    rm -rf citadel-venv
}

require_x86_64() {
    local machine
    machine="$(uname -m)"
    if [[ "$machine" != "x86_64" ]]; then
        echo "ERROR: this build script only supports x86_64 (detected: $machine)." >&2
        exit 1
    fi
}

# Ensure a python3 + venv + pip toolchain is present regardless of distro
# family, without assuming any one package manager.
ensure_python() {
    if command -v python3 &>/dev/null && python3 -m venv --help &>/dev/null; then
        return
    fi

    echo "python3/venv not found, installing via system package manager..."

    if command -v apt-get &>/dev/null; then
        sudo apt-get update
        sudo apt-get install -y python3 python3-venv python3-pip
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y python3 python3-pip
    elif command -v zypper &>/dev/null; then
        sudo zypper install -y python3 python3-pip
    else
        echo "ERROR: no supported package manager found (apt-get/dnf/zypper)." >&2
        echo "Install python3 (with venv) manually and re-run." >&2
        exit 1
    fi
}

build() {
    echo "Building citadel-browser-agent (x86_64)..."

    clean_build
    rm -rf "binaries/x86_64"

    ensure_python

    python3 -m venv citadel-venv
    source citadel-venv/bin/activate

    pip install --upgrade pip
    pip install --upgrade pyinstaller
    pip install --upgrade json5

    pyinstaller --clean --strip --optimize 2 --onedir ../../citadel-browser-agent

    deactivate

    mkdir -p "binaries/x86_64"
    cp -r dist/citadel-browser-agent/* "binaries/x86_64/"

    BINARY_PATH="binaries/x86_64/citadel-browser-agent"
    if [ -f "$BINARY_PATH" ]; then
        BUILT_ARCH=$(file "$BINARY_PATH" | grep -o "x86-64" || true)
        echo "Built binary architecture check: ${BUILT_ARCH:-unknown}"
    fi

    echo "Build completed. Files in binaries/x86_64/"

    clean_build
}

require_x86_64
build

echo "Build completed."