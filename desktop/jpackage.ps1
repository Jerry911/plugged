# Copyright 2026 Pleysier Jeroen
# SPDX-License-Identifier: AGPL-3.0-only
#
# Plugged as a program for Windows (see backend/.../desktop/DesktopLauncher.java), packed with its own Java by jpackage: the Windows
# counterpart of jpackage.sh, without Git Bash. Needs a JDK 21 or newer (jpackage is part of it) and Maven on the PATH; for the .msi also
# the WiX toolset. Easiest: double-click desktop\jpackage.cmd, or in PowerShell:
#
#   .\desktop\jpackage.ps1            builds the application (mvn package, frontend included) and packs it
#   .\desktop\jpackage.ps1 -NoBuild   packs backend\target\plugged-<version>.jar as it is
#
# The version is the <version> of backend\pom.xml (and nowhere else).
#
# Result in desktop\target\:
#   Plugged-<version>-windows.zip   unpack anywhere and run Plugged\Plugged.exe (no installation, no administrator rights)
#   Plugged-<version>.msi           an installer (start menu, desktop shortcut, per user), when WiX (candle.exe or wix.exe) is on the PATH
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# the version: the first <version> indented by four spaces (the one of the project, not the one of the Spring Boot parent)
$VersionLine = Get-Content (Join-Path $Root 'backend\pom.xml') | Where-Object { $_ -match '^    <version>([^<]*)</version>' } | Select-Object -First 1
if (-not $VersionLine) { throw 'No <version> found in backend\pom.xml' }
$null = $VersionLine -match '^    <version>([^<]*)</version>'
$Version = $Matches[1]
# Windows (and macOS) only take three numbers, the first at least 1, at most 255.255.65535: check it before building anything
$Valid = $Version -match '^([1-9]\d*)\.(\d+)\.(\d+)$'
if ($Valid) { $Valid = [int]$Matches[1] -le 255 -and [int]$Matches[2] -le 255 -and [int]$Matches[3] -le 65535 }
if (-not $Valid) {
    throw "The <version> in backend\pom.xml is ""$Version"": it must be three numbers such as 1.2.0, the first at least 1, at most 255.255.65535."
}
foreach ($tool in @('jpackage') + $(if ($NoBuild) { @() } else { @('mvn') })) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not on the PATH: install a JDK 21 or newer$(if ($tool -eq 'mvn') { ' and Maven' })." }
}

$Jar = "plugged-$Version.jar"
if (-not $NoBuild) {
    Push-Location (Join-Path $Root 'backend')
    try {
        & mvn -B -ntp package -DskipTests
        if ($LASTEXITCODE -ne 0) { throw "mvn package failed ($LASTEXITCODE)" }
    } finally { Pop-Location }
}
$Built = Join-Path $Root "backend\target\$Jar"
if (-not (Test-Path $Built)) { throw "backend\target\$Jar is missing: build it first (leave out -NoBuild)" }

$Out = Join-Path $Root 'desktop\target'
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
$InputDir = Join-Path $Out 'input'
New-Item -ItemType Directory -Path $InputDir | Out-Null
Copy-Item $Built $InputDir

# the same options for the plain application folder and for the installer (as in jpackage.sh)
$Common = @(
    '--name', 'Plugged', '--app-version', $Version, '--vendor', 'Pleysier Jeroen', '--description', "Elektrische schema's volgens het AREI",
    '--copyright', 'Copyright 2026 Pleysier Jeroen, AGPL-3.0', '--icon', (Join-Path $Root 'desktop\icons\plugged.ico'),
    '--input', $InputDir, '--main-jar', $Jar, '--main-class', 'org.springframework.boot.loader.launch.JarLauncher',
    '--arguments', '--desktop', '--java-options', '-Dfile.encoding=UTF-8 -Xmx1g',
    # a Java of only the modules Spring Boot, Tomcat, Hibernate, H2 and the window need (about a third of a full JDK)
    '--add-modules', 'java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.sql,java.transaction.xa,java.xml,jdk.charsets,jdk.crypto.ec,jdk.localedata,jdk.management,jdk.net,jdk.unsupported,jdk.zipfs',
    '--jlink-options', '--strip-debug --no-man-pages --no-header-files --strip-native-commands'
)

function Invoke-Jpackage([string[]]$Arguments) {
    & jpackage @Arguments
    if ($LASTEXITCODE -ne 0) { throw "jpackage failed ($LASTEXITCODE)" }
}

Invoke-Jpackage (@('--type', 'app-image', '--dest', (Join-Path $Out 'image')) + $Common)
Compress-Archive -Path (Join-Path $Out 'image\Plugged') -DestinationPath (Join-Path $Out "Plugged-$Version-windows.zip")

if ((Get-Command candle.exe -ErrorAction SilentlyContinue) -or (Get-Command wix.exe -ErrorAction SilentlyContinue)) {
    # the upgrade code stays the same for every version, so a new .msi replaces the installed one
    Invoke-Jpackage (@('--type', 'msi', '--dest', $Out) + $Common + @(
        '--win-menu', '--win-shortcut', '--win-dir-chooser', '--win-per-user-install',
        '--win-upgrade-uuid', '5b0a8a5e-6d3c-4f43-9c2e-6f1d4d1c8a11', '--license-file', (Join-Path $Root 'LICENSE')))
} else {
    Write-Host 'No WiX toolset on the PATH: only the .zip is made (install WiX for an .msi installer).'
}

Remove-Item $InputDir -Recurse -Force
Write-Host "Done: $((Get-ChildItem $Out -File | ForEach-Object Name) -join ', ') in $Out"
