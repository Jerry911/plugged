#!/usr/bin/env sh
# Copyright 2026 Pleysier Jeroen
# SPDX-License-Identifier: AGPL-3.0-only
#
# Builds the Docker image with the version of backend/pom.xml (the only place the version is written), so it never has to be typed:
#   ./docker-build.sh                    -> plugged:1.2.0, plugged:1.2 and plugged:latest
#   ./docker-build.sh --no-cache         extra arguments go to docker build
#   IMAGE=registry.example.be/plugged ./docker-build.sh    another image name
set -eu
cd "$(dirname "$0")"
VERSION=$(tr -d '\r' < backend/pom.xml | sed -n 's:^    <version>\([^<]*\)</version>:\1:p' | head -1)
[ -n "$VERSION" ] || { echo "No <version> found in backend/pom.xml" >&2; exit 1; }
IMAGE=${IMAGE:-plugged}
MINOR=$(echo "$VERSION" | cut -d. -f1-2)
echo "Building $IMAGE:$VERSION (also $IMAGE:$MINOR and $IMAGE:latest)"
docker build --build-arg VERSION="$VERSION" -t "$IMAGE:$VERSION" -t "$IMAGE:$MINOR" -t "$IMAGE:latest" "$@" .
