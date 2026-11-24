#!/usr/bin/env bash
# Copyright 2026 Pleysier Jeroen
# SPDX-License-Identifier: AGPL-3.0-only
#
# Plugged as a program for one computer (see backend/.../desktop/DesktopLauncher.java), packed with its own Java by jpackage (part of the
# JDK, 25 or newer). Run it on the operating system you build for (jpackage cannot build for another one). On Windows use jpackage.cmd or
# jpackage.ps1 (the same, in PowerShell), or run this script from Git Bash.
#
# The version is the <version> of backend/pom.xml (and nowhere else).
#
#   desktop/jpackage.sh            builds the application (mvn package, frontend included) and packs it
#   desktop/jpackage.sh --no-build packs backend/target/plugged-<version>.jar as it is
#
# Result in desktop/target/:
#   Linux    plugged_<version>_amd64.deb (when dpkg-deb and fakeroot are there) and Plugged-<version>-linux.tar.gz (unpack, run Plugged/bin/Plugged)
#   Windows  Plugged-<version>-windows.zip (unpack, run Plugged\Plugged.exe) and Plugged-<version>.msi when the WiX toolset is installed
#   macOS    Plugged-<version>.dmg (not signed: the first time open it with right-click > Open)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
VERSION=$(tr -d '\r' < backend/pom.xml | sed -n 's:^    <version>\([0-9][0-9.]*\)</version>:\1:p' | head -1)
# jpackage refuses a macOS version that starts with 0, and Windows allows at most 255.255.65535: check it before building anything
if ! [[ "$VERSION" =~ ^([1-9][0-9]*)\.([0-9]+)\.([0-9]+)$ ]] || (( BASH_REMATCH[1] > 255 || BASH_REMATCH[2] > 255 || BASH_REMATCH[3] > 65535 )); then
    echo "The <version> in backend/pom.xml is \"$VERSION\": it must be three numbers such as 1.2.0, the first at least 1, at most 255.255.65535." >&2
    exit 1
fi
JAR="plugged-$VERSION.jar"
if [ "${1:-}" != "--no-build" ]; then (cd backend && mvn -B -ntp package -DskipTests); fi
[ -f "backend/target/$JAR" ] || { echo "backend/target/$JAR is missing: build it first" >&2; exit 1; }

OUT="$ROOT/desktop/target"
rm -rf "$OUT" && mkdir -p "$OUT/input"
cp "backend/target/$JAR" "$OUT/input/"

case "$(uname -s)" in
    Linux*) OS=linux; ICON="$ROOT/desktop/icons/plugged.png" ;;
    Darwin*) OS=mac; ICON="$ROOT/desktop/icons/plugged.icns" ;;
    MINGW*|MSYS*|CYGWIN*) OS=windows; ICON="$ROOT/desktop/icons/plugged.ico" ;;
    *) echo "unknown operating system $(uname -s)" >&2; exit 1 ;;
esac

# the same options for the plain application folder and for an installer
COMMON=(--name Plugged --app-version "$VERSION" --vendor "Pleysier Jeroen" --description "Elektrische schema's volgens het AREI"
        --copyright "Copyright 2026 Pleysier Jeroen, AGPL-3.0" --icon "$ICON"
        --input "$OUT/input" --main-jar "$JAR" --main-class org.springframework.boot.loader.launch.JarLauncher
        --arguments --desktop --java-options "-Dfile.encoding=UTF-8 -Xmx1g"
        # a Java of only the modules Spring Boot, Tomcat, Hibernate, H2 and the window need (about a third of a full JDK)
        --add-modules java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.sql,java.transaction.xa,java.xml,jdk.charsets,jdk.crypto.ec,jdk.localedata,jdk.management,jdk.net,jdk.unsupported,jdk.zipfs
        --jlink-options "--strip-debug --no-man-pages --no-header-files --strip-native-commands")

jpackage --type app-image --dest "$OUT/image" "${COMMON[@]}"
case "$OS" in
    linux)
        tar -C "$OUT/image" -czf "$OUT/Plugged-$VERSION-linux.tar.gz" Plugged
        if command -v dpkg-deb >/dev/null && command -v fakeroot >/dev/null; then
            jpackage --type deb --dest "$OUT" "${COMMON[@]}" --linux-shortcut --linux-menu-group Office --linux-package-name plugged \
                --license-file "$ROOT/LICENSE"
        fi ;;
    windows)
        (cd "$OUT/image" && powershell -NoProfile -Command "Compress-Archive -Path Plugged -DestinationPath '../Plugged-$VERSION-windows.zip'")
        if command -v candle.exe >/dev/null || command -v wix.exe >/dev/null; then
            jpackage --type msi --dest "$OUT" "${COMMON[@]}" --win-menu --win-shortcut --win-dir-chooser --win-per-user-install \
                --win-upgrade-uuid 5b0a8a5e-6d3c-4f43-9c2e-6f1d4d1c8a11 --license-file "$ROOT/LICENSE"
        fi ;;
    mac)
        jpackage --type dmg --dest "$OUT" "${COMMON[@]}" --mac-package-name Plugged --license-file "$ROOT/LICENSE" ;;
esac
rm -rf "$OUT/input"
echo "Done: $(ls "$OUT")"
