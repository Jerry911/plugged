// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

/**
 * What the frontend shows first: the first-start screen (setupRequired, with the fixed address of the administrator; adminEmail is empty when
 * plugged.admin.email is not configured), else the editor for the signed-in user, else the sign-in screen (user is null).
 * desktop: Plugged runs as a program on one computer (DesktopMode): no sign-in screen and no signing out, the program signs the browser in.
 */
public record AuthStatusDto(boolean setupRequired, String adminEmail, UserDto user, boolean desktop) {
    public AuthStatusDto(boolean setupRequired, String adminEmail, UserDto user) {
        this(setupRequired, adminEmail, user, false);
    }
}
