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

/**
 * The groups of coworkers. Creating, renaming and removing groups and choosing their members and owners is for administrators
 * (/api/admin/groups). The educational mode of a group is switched by an administrator or by an owner of that group.
 */
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

    /** Removes a member; an owner who is no longer a member is no owner any more either. */
    @Transactional
    public GroupDto removeMember(long id, long userId) {
        UserGroup group = find(id);
        group.getOwners().removeIf(user -> user.getId() == userId);
        if (group.getMembers().removeIf(user -> user.getId() == userId)) log.info("User {} removed from group {}", userId, id);
        return GroupDto.of(group);
    }

    /** Makes a user an owner of the group (and a member, if he was not yet), or takes the ownership away (he stays a member). */
    @Transactional
    public GroupDto setOwner(long id, long userId, boolean owner) {
        UserGroup group = find(id);
        AppUser user = users.findById(userId).orElseThrow(() -> new LocalizedStatusException(HttpStatus.NOT_FOUND, "user.notFound", userId));
        if (owner) {
            group.getMembers().add(user);
            if (group.getOwners().add(user)) log.info("User {} is owner of group {}", userId, id);
        } else if (group.getOwners().removeIf(candidate -> candidate.getId() == userId)) log.info("User {} is no owner of group {} any more", userId, id);
        return GroupDto.of(group);
    }

    /** Switches the educational mode of a group: an administrator, or an owner of this group. */
    @Transactional
    public GroupDto setEducational(AppUser acting, long id, boolean educational) {
        UserGroup group = find(id);
        if (!acting.isAdmin() && !group.isOwner(acting.getId())) throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "group.notOwner");
        if (group.isEducational() != educational) log.info("Educational mode of group {} {} by user {}", id, educational ? "on" : "off", acting.getId());
        group.setEducational(educational);
        return GroupDto.of(group);
    }

    /** The groups whose educational mode this user may switch, with their members: the groups he owns; every group for an administrator. */
    @Transactional(readOnly = true)
    public List<GroupDto> manageableBy(AppUser user) {
        return (user.isAdmin() ? groups.findAllByOrderByNameAsc() : groups.findByOwners_IdOrderByNameAsc(user.getId())).stream().map(GroupDto::of).toList();
    }

    /** The ids of the groups this user owns. */
    @Transactional(readOnly = true)
    public List<Long> ownedGroupIds(long userId) {
        return groups.findByOwners_IdOrderByNameAsc(userId).stream().map(UserGroup::getId).toList();
    }

    /**
     * True for a student: a member who is no owner of a group in educational mode. He cannot validate a schema, nor import or export one, in any
     * of his projects (else he could copy the work into a project of his own). Administrators are never restricted.
     */
    @Transactional(readOnly = true)
    public boolean isRestricted(AppUser user) {
        return !user.isAdmin() && groups.isStudent(user.getId());
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
