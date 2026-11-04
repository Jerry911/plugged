// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.UserGroup;
import java.util.Comparator;
import java.util.List;

/**
 * A group with its members, for the administrator and for its owners. {@code owner} marks the members who own the group (teachers);
 * {@code educational}: in educational mode the members who are no owner cannot validate, import or export.
 */
public record GroupDto(long id, String name, String created, List<Member> members, boolean educational) {
    public record Member(long id, String name, String surname, String email, boolean owner) {
    }

    public static GroupDto of(UserGroup group) {
        List<Member> members = group.getMembers().stream()
                .sorted(Comparator.comparing(AppUser::getName, String.CASE_INSENSITIVE_ORDER).thenComparing(AppUser::getSurname, String.CASE_INSENSITIVE_ORDER))
                .map(user -> new Member(user.getId(), user.getName(), user.getSurname(), user.getEmail(), group.isOwner(user.getId())))
                .toList();
        return new GroupDto(group.getId(), group.getName(), group.getCreated(), members, group.isEducational());
    }
}
