#!/bin/bash

PACKAGE_ID="nl.vanwouwe.citadel"
VERSION="1.2"

rm -rf binaries

# Clean up previous build artifacts
clean_build() {
      rm -rf build
      rm -rf dist
      rm -rf citadel-browser-agent.spec
      rm -rf citadel-venv
}

# Build for a specific architecture
build_for_arch() {
    clean_build

    local BUILD_ARCH=$1
    echo "Building for $BUILD_ARCH architecture..."

    if [[ "$BUILD_ARCH" == "arm64" ]]; then
        ARCH_CMD=""
        PYTHON_CMD="/opt/homebrew/bin/python3"
        BREW_CMD="/opt/homebrew/bin/brew"
    else
        ARCH_CMD="arch -x86_64"
        PYTHON_CMD="/usr/local/bin/python3"
        BREW_CMD="/usr/local/bin/brew"
    fi

    # Ensure the latest version of Python is installed
    if [ ! -f "$BREW_CMD" ]; then
        echo "WARNING: installing Homebrew at $BREW_CMD"
        $ARCH_CMD /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
        $ARCH_CMD brew install python
    fi
    $ARCH_CMD $BREW_CMD upgrade python

    # Create and activate virtual environment
    $ARCH_CMD $PYTHON_CMD -m venv citadel-venv
    source citadel-venv/bin/activate

    # Install PyInstaller and build
    $ARCH_CMD pip install --upgrade pip
    $ARCH_CMD pip install --upgrade pyinstaller

    # Build the package using the correct architecture
    $ARCH_CMD pyinstaller --clean --strip --optimize 2 \
        --osx-bundle-identifier $PACKAGE_ID \
        --onedir \
        ../citadel-browser-agent

    deactivate

    # Copy the build to the architecture-specific directory
    mkdir -p "binaries/$BUILD_ARCH"
    cp -r dist/citadel-browser-agent/* "binaries/$BUILD_ARCH/"

    # Verify the binary's architecture
    BINARY_PATH="binaries/$BUILD_ARCH/citadel-browser-agent"
    if [ -f "$BINARY_PATH" ]; then
        BUILT_ARCH=$(file "$BINARY_PATH" | grep -o "x86_64\|arm64")
        echo "Built binary architecture: $BUILT_ARCH"
    fi

    echo "Build for $BUILD_ARCH completed. Files in binaries/$BUILD_ARCH/"

    clean_build
}

# Build for both architectures
build_for_arch "arm64"
build_for_arch "x86_64"


echo "Universal build completed."

./package.sh

