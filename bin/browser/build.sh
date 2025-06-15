#!/bin/bash

BUILD_ROOT="/tmp/citadel-$(uuidgen)"
OUTPUT_PKG="citadel-plugin"

rm -rf $OUTPUT_PKG
mkdir "$BUILD_ROOT"

# Copy the files to the directory structure
cd ../..
cp ./*.js ./*.json "$BUILD_ROOT"
cp -r utils gui blacklist "$BUILD_ROOT"

cd ./bin/browser/ || exit
mv "$BUILD_ROOT" $OUTPUT_PKG
cd "$OUTPUT_PKG" || exit
zip -r ../"$OUTPUT_PKG".zip .