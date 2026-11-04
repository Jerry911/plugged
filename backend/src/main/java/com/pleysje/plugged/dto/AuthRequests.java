// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

/** The bodies of the requests of /api/auth. */
public final class AuthRequests {
    private AuthRequests() {
    }

    /** First start: the details of the administrator. The email address is not part of it: it is plugged.admin.email. */
    public record Setup(String name, String surname, String password) {
    }

    public record Register(String name, String surname, String email, String password) {
    }

    public record Login(String email, String password) {
    }
}
