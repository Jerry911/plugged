@echo off
rem Copyright 2026 Pleysier Jeroen
rem SPDX-License-Identifier: AGPL-3.0-only
rem Builds the Windows program of Plugged: double-click this file, or run "desktop\jpackage.cmd -NoBuild". See jpackage.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0jpackage.ps1" %*
if errorlevel 1 (
    echo.
    echo Building Plugged failed, see the messages above.
)
pause