#!/bin/bash
#
# Builds the x86_64 agent with PyInstaller.
#
# The build OS matters: PyInstaller does not bundle glibc, so the binary needs
# a glibc at least as new as the one it was built against. Build on the OLDEST
# system you want to support. By default the build runs in a container of that
# system, so it does not depend on the machine you run this on.
#
#   ./build.sh                           build in a ubuntu:22.04 container
#   BUILD_IMAGE=debian:12 ./build.sh     build in another container image
#   PYTHON_VERSION=3.12 ./build.sh       use another Python than the image's
#                                        (fetched with uv; untested with
#                                        PyInstaller, check the result)
#   ./build.sh --local                   build on this machine's OS instead
#
# Settings (environment):
#   BUILD_IMAGE     container image used as the build OS (default ubuntu:22.04)
#   PYTHON_VERSION  Python to build with; empty uses the OS's python3
#   MAX_GLIBC       oldest glibc you support. The build fails if the result
#                   needs a newer one (default 2.35: Ubuntu 22.04, and the
#                   runtime of Snap browsers still based on core22, e.g. Brave).
#                   Set it to empty to skip the check.
set -euo pipefail

BUILD_IMAGE="${BUILD_IMAGE:-ubuntu:22.04}"
PYTHON_VERSION="${PYTHON_VERSION:-}"
MAX_GLIBC="${MAX_GLIBC-2.35}"

die() {
    echo "ERROR: $*" >&2
    exit 1
}

clean_build() {
    rm -rf build
    rm -rf dist
    rm -rf citadel-browser-agent.spec
    rm -rf citadel-venv
    rm -rf citadel-uv
}

# Container runs as root and writes into the bind-mounted checkout; hand the
# results back to the invoking user.
fix_ownership() {
    if [[ -n ${HOST_UID:-} && -n ${HOST_GID:-} ]]; then
        chown -R "$HOST_UID:$HOST_GID" binaries build dist \
            citadel-venv citadel-uv citadel-browser-agent.spec 2>/dev/null || true
    fi
}

run_in_container() {
    local engine repo_root

    engine="$(command -v docker || command -v podman || true)"
    [[ -n $engine ]] ||
        die "docker or podman is required (or use --local on a suitable OS)"

    repo_root="$(cd ../../.. && pwd)"

    echo "Building in container image: $BUILD_IMAGE"
    "$engine" run --rm --platform linux/amd64 \
        -e BUILD_IMAGE="$BUILD_IMAGE" -e PYTHON_VERSION="$PYTHON_VERSION" \
        -e MAX_GLIBC="$MAX_GLIBC" \
        -e DEBIAN_FRONTEND=noninteractive \
        -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
        -v "$repo_root:/src" \
        -w /src/bin/build/linux \
        "$BUILD_IMAGE" \
        bash ./build.sh --local
}

require_x86_64() {
    local machine
    machine="$(uname -m)"
    if [[ "$machine" != "x86_64" ]]; then
        die "this build script only supports x86_64 (detected: $machine)."
    fi
}

# Ensure python3 + venv + pip and binutils (strip, objdump) are present
# regardless of distro family.
ensure_tools() {
    local sudo=""
    if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
        sudo="sudo"
    fi

    if command -v python3 &>/dev/null && python3 -m venv --help &>/dev/null &&
       python3 -m pip --version &>/dev/null &&
       command -v objdump &>/dev/null && command -v strip &>/dev/null; then
        return
    fi

    echo "Required tools not found, installing via system package manager..."

    if command -v apt-get &>/dev/null; then
        $sudo apt-get update
        $sudo apt-get install -y python3 python3-venv python3-pip binutils
    elif command -v dnf &>/dev/null; then
        $sudo dnf install -y python3 python3-pip binutils
    elif command -v zypper &>/dev/null; then
        $sudo zypper install -y python3 python3-pip binutils
    else
        echo "Install python3 (with venv and pip) and binutils manually and re-run." >&2
        die "no supported package manager found (apt-get/dnf/zypper)."
    fi
}

# Newest GLIBC_x.y symbol version required by any binary or library in $1.
max_glibc_required() {
    local file
    find "$1" -type f \( -name '*.so*' -o -perm -u+x \) -print0 |
        while IFS= read -r -d '' file; do
            objdump -T "$file" 2>/dev/null |
                grep -o 'GLIBC_[0-9][0-9.]*' || true
        done |
        sed 's/^GLIBC_//' | sort -uV | tail -n 1
}

check_glibc() {
    local found

    [[ -n $MAX_GLIBC ]] || return 0

    found="$(max_glibc_required "binaries/x86_64")"
    echo "Highest glibc version required by the build: ${found:-none}"

    if [[ -n $found &&
          "$(printf '%s\n' "$found" "$MAX_GLIBC" | sort -V | tail -n 1)" != "$MAX_GLIBC" ]]; then
        die "the build needs glibc $found but the oldest supported is $MAX_GLIBC. Build on an older OS (BUILD_IMAGE) or raise MAX_GLIBC knowingly."
    fi
}

build() {
    echo "Building citadel-browser-agent (x86_64)..."

    clean_build
    rm -rf "binaries/x86_64"

    ensure_tools

    if [[ -n $PYTHON_VERSION ]]; then
        # uv fetches a standalone Python of the requested version, which keeps
        # the Python version independent of the build OS (and its glibc).
        python3 -m venv citadel-uv
        citadel-uv/bin/pip install --upgrade pip uv
        citadel-uv/bin/uv venv --python "$PYTHON_VERSION" citadel-venv
        source citadel-venv/bin/activate
        citadel-uv/bin/uv pip install --upgrade pyinstaller json5
    else
        python3 -m venv citadel-venv
        source citadel-venv/bin/activate
        pip install --upgrade pip
        pip install --upgrade pyinstaller
        pip install --upgrade json5
    fi

    echo "Python: $(python --version)"

    pyinstaller --clean --strip --optimize 2 --onedir ../../citadel-browser-agent

    deactivate

    mkdir -p "binaries/x86_64"
    cp -r dist/citadel-browser-agent/* "binaries/x86_64/"

    BINARY_PATH="binaries/x86_64/citadel-browser-agent"
    if [ -f "$BINARY_PATH" ]; then
        BUILT_ARCH=$(file "$BINARY_PATH" | grep -o "x86-64" || true)
        echo "Built binary architecture check: ${BUILT_ARCH:-unknown}"
    fi

    check_glibc

    echo "Build completed. Files in binaries/x86_64/"

    clean_build
}

case "${1:-}" in
    "")
        run_in_container
        ;;
    --local)
        trap fix_ownership EXIT
        require_x86_64
        build
        ;;
    *)
        die "Usage: build.sh [--local]"
        ;;
esac

echo "Build completed."
