// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/** The bodies of the requests that change accounts, groups and the sharing of projects. */
public final class AdminRequests {
    private AdminRequests() {
    }

    /** Makes an account an administrator (true) or an ordinary user again (false). */
    public record Role(boolean admin) {
    }

    public static final int MAX_GROUP_NAME_LENGTH = 100;

    /** The name of a group (stripped before it is checked). */
    public record GroupName(@NotBlank(message = "group.nameRequired") @Size(max = MAX_GROUP_NAME_LENGTH, message = "group.nameTooLong") String name) {
        public GroupName {
            name = name == null ? null : name.strip();
        }
    }

    /** Educational mode of a group on (true) or off. */
    public record Educational(boolean educational) {
    }

    /** The groups a project is shared with. */
    public record Sharing(List<Long> groupIds) {
    }
}
