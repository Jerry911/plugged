// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import java.io.Serializable;
import java.security.Principal;

/**
 * The signed-in user as it is kept in the session: the id of the account, its email address and the credentials version of the account
 * when he signed in. When the password changes, the version of the account goes up, and sessions with an older one end (ActiveUserFilter).
 */
public record PluggedPrincipal(long id, String email, int credentialsVersion) implements Principal, Serializable {
    @Override
    public String getName() {
        return email;
    }
}
