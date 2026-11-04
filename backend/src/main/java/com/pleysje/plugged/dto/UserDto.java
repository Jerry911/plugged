// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

import com.pleysje.plugged.entity.AppUser;

/** A user account as the API shows it (never the password hash). */
public record UserDto(long id, String name, String surname, String email, boolean admin, boolean approved, String created) {
    public static UserDto of(AppUser user) {
        return new UserDto(user.getId(), user.getName(), user.getSurname(), user.getEmail(), user.isAdmin(), user.isApproved(), user.getCreated());
    }
}
