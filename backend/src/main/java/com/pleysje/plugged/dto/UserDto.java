// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

import com.pleysje.plugged.entity.AppUser;
import java.util.List;

/**
 * A user account as the API shows it (never the password hash). {@code primary}: the administrator of plugged.admin.email, who always stays
 * administrator (only filled in for the administrators' list). {@code lastLogin} (ISO-8601, null = never) and {@code loginCount}: when the
 * account last signed in and how many times. {@code lockedUntil} (ISO-8601): the account is locked after too many wrong passwords until then
 * (null = not locked).
 */
public record UserDto(long id, String name, String surname, String email, boolean admin, boolean approved, String created, boolean primary,
                      String lastLogin, int loginCount, Boolean restricted, List<Long> ownedGroups, String lockedUntil) {
    public static UserDto of(AppUser user) {
        return of(user, false);
    }

    public static UserDto of(AppUser user, boolean primary) {
        return new UserDto(user.getId(), user.getName(), user.getSurname(), user.getEmail(), user.isAdmin(), user.isApproved(), user.getCreated(), primary,
                user.getLastLogin(), user.getLoginCount(), null, null, user.lockedUntil(java.time.Instant.now()) == null ? null : user.getLockedUntil());
    }

    /**
     * The signed-in user as the editor needs him: {@code restricted} (a student in a group in educational mode: no validation, no import or
     * export) and {@code ownedGroups} (the ids of the groups he owns, whose educational mode he may switch).
     */
    public UserDto forEditor(boolean restricted, List<Long> ownedGroups) {
        return new UserDto(id, name, surname, email, admin, approved, created, primary, lastLogin, loginCount, restricted, ownedGroups, lockedUntil);
    }
}
