// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

import java.util.List;

/**
 * What the project list shows: no project document, only its id, name, the moment it was last saved, who owns it and the groups it is shared
 * with. {@code mine}: the signed-in user owns it; {@code canManage}: the signed-in user may delete it and change the groups (owner or admin).
 */
public record ProjectSummary(Long id, String name, String updated, Ref owner, List<Ref> groups, boolean mine, boolean canManage) {
    /** A user or a group as a project shows it: its id and its name. */
    public record Ref(long id, String name) {
    }
}
