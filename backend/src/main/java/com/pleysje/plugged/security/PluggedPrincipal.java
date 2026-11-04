// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import java.io.Serializable;
import java.security.Principal;

/** The signed-in user as it is kept in the session: the id of the account and its email address. */
public record PluggedPrincipal(long id, String email) implements Principal, Serializable {
    @Override
    public String getName() {
        return email;
    }
}
