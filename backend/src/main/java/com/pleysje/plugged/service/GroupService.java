// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import com.pleysje.plugged.dto.GroupDto;
import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The groups of coworkers. Creating, renaming and removing groups and choosing their members is for administrators (/api/admin/groups). */
@Service
public class GroupService {
    private static final Logger log = LoggerFactory.getLogger(GroupService.class);
    public static final int MAX_NAME_LENGTH = 100;

    private final UserGroupRepository groups;
    private final UserRepository users;
    private final ProjectRepository projects;

    public GroupService(UserGroupRepository groups, UserRepository users, ProjectRepository projects) {
        this.groups = groups;
        this.users = users;
        this.projects = projects;
    }

    @Transactional(readOnly = true)
    public List<GroupDto> all() {
        return groups.findAllByOrderByNameAsc().stream().map(GroupDto::of).toList();
    }

    /** The groups a user can share his projects with: his own groups; for an administrator every group. */
    @Transactional(readOnly = true)
    public List<ProjectSummary.Ref> shareableBy(AppUser user) {
        List<UserGroup> list = user.isAdmin() ? groups.findAllByOrderByNameAsc() : groups.findByMembers_IdOrderByNameAsc(user.getId());
        return list.stream().map(group -> new ProjectSummary.Ref(group.getId(), group.getName())).toList();
    }

    @Transactional
    public GroupDto create(String name) {
        String clean = validName(name);
        if (groups.existsByNameIgnoreCase(clean)) throw new LocalizedStatusException(HttpStatus.CONFLICT, "group.nameTaken", clean);
        UserGroup group = groups.save(new UserGroup(clean));
        log.info("Group {} \"{}\" created", group.getId(), clean);
        return GroupDto.of(group);
    }

    @Transactional
    public GroupDto rename(long id, String name) {
        UserGroup group = find(id);
        String clean = validName(name);
        if (groups.existsByNameIgnoreCaseAndIdNot(clean, id)) throw new LocalizedStatusException(HttpStatus.CONFLICT, "group.nameTaken", clean);
        group.setName(clean);
        log.info("Group {} renamed to \"{}\"", id, clean);
        return GroupDto.of(group);
    }

    /** Removes a group: its projects stay with their owners, they are just no longer shared with it. */
    @Transactional
    public void delete(long id) {
        UserGroup group = find(id);
        int unshared = projects.unshareGroup(id);
        groups.delete(group);
        log.info("Group {} deleted ({} project(s) no longer shared with it)", id, unshared);
    }

    @Transactional
    public GroupDto addMember(long id, long userId) {
        UserGroup group = find(id);
        AppUser user = users.findById(userId).orElseThrow(() -> new LocalizedStatusException(HttpStatus.NOT_FOUND, "user.notFound", userId));
        if (group.getMembers().add(user)) log.info("User {} added to group {}", userId, id);
        return GroupDto.of(group);
    }

    @Transactional
    public GroupDto removeMember(long id, long userId) {
        UserGroup group = find(id);
        if (group.getMembers().removeIf(user -> user.getId() == userId)) log.info("User {} removed from group {}", userId, id);
        return GroupDto.of(group);
    }

    private UserGroup find(long id) {
        return groups.findById(id).orElseThrow(() -> new LocalizedStatusException(HttpStatus.NOT_FOUND, "group.notFound"));
    }

    private static String validName(String name) {
        String clean = name == null ? "" : name.strip();
        if (clean.isEmpty()) throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "group.nameRequired");
        if (clean.length() > MAX_NAME_LENGTH) throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "group.nameTooLong", MAX_NAME_LENGTH);
        return clean;
    }
}
