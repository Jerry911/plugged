// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

import java.util.List;

/** The bodies of the requests that change accounts, groups and the sharing of projects. */
public final class AdminRequests {
    private AdminRequests() {
    }

    /** Makes an account an administrator (true) or an ordinary user again (false). */
    public record Role(boolean admin) {
    }

    public record GroupName(String name) {
    }

    /** The groups a project is shared with. */
    public record Sharing(List<Long> groupIds) {
    }
}
