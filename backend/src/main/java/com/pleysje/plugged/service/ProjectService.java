// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import com.pleysje.plugged.dto.ProjectRow;
import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.ProjectDoc;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.security.UserService;
import org.springframework.beans.factory.annotation.Value;
import tools.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who may do what with a project:
 * <ul>
 *   <li>see, open and save it: its owner, the members of a group it is shared with, and the primary administrator (the Hoofdbeheerder,
 *       plugged.admin.email), who sees the projects of everyone;</li>
 *   <li>delete it and choose the groups it is shared with: its owner and the primary administrator. An owner shares only with his own
 *       groups; an administrator with any group.</li>
 * </ul>
 * Other administrators manage users, groups and symbols, but for projects they are users like any other: their own projects and those
 * shared with their groups.
 * A project the user may not see answers 404, as if it did not exist: project numbers of others are not given away. New projects get their
 * number from the database ({@link #create}); a client cannot choose one.
 * <ul>
 *   <li>Every document is checked before it is stored ({@link ProjectJson}).</li>
 *   <li>A save names the version it is based on: when somebody else saved in between, it is refused (409) instead of overwriting that work.</li>
 *   <li>A user owns at most plugged.max-projects-per-user projects (0 = no limit).</li>
 *   <li>A student in educational mode (GroupService#isRestricted) cannot import: a project he creates must be empty (no circuits, nothing
 *       on the plans); he fills it by working in it.</li>
 * </ul>
 */
@Service
public class ProjectService {
    private static final Logger log = LoggerFactory.getLogger(ProjectService.class);

    private final ProjectRepository projects;
    private final UserRepository users;
    private final UserGroupRepository groups;
    private final UserService userService;
    private final GroupService groupService;
    private final int maxProjectsPerUser;

    public ProjectService(ProjectRepository projects, UserRepository users, UserGroupRepository groups, UserService userService, GroupService groupService,
                          @Value("${plugged.max-projects-per-user:500}") int maxProjectsPerUser) {
        this.projects = projects;
        this.users = users;
        this.groups = groups;
        this.userService = userService;
        this.groupService = groupService;
        this.maxProjectsPerUser = maxProjectsPerUser;
    }

    /** A project document with the version it has in the database. */
    public record Document(String json, long version) {
    }

    /** Does the user see and manage the projects of everyone? Only the primary administrator (the Hoofdbeheerder). */
    private boolean seesAll(AppUser user) {
        return userService.isPrimaryAdmin(user);
    }

    /** The signed-in user (401 when the account is gone). */
    public AppUser user(long userId) {
        return users.findById(userId).orElseThrow(() -> new LocalizedStatusException(HttpStatus.UNAUTHORIZED, "auth.signInRequired"));
    }

    private Set<Long> groupIdsOf(AppUser user) {
        return groups.findByMembers_IdOrderByNameAsc(user.getId()).stream().map(UserGroup::getId).collect(Collectors.toSet());
    }

    private static boolean owns(AppUser user, ProjectDoc project) {
        return user.getId().equals(project.getOwnerId());
    }

    private boolean canManage(AppUser user, ProjectDoc project) {
        return seesAll(user) || owns(user, project);
    }

    private boolean canOpen(AppUser user, ProjectDoc project) {
        if (canManage(user, project)) return true;
        Set<Long> mine = groupIdsOf(user);
        return project.getGroups().stream().anyMatch(group -> mine.contains(group.getId()));
    }

    /** The project, if the user may open it; else 404. */
    private ProjectDoc openable(AppUser user, long id) {
        ProjectDoc project = projects.findById(id).orElse(null);
        if (project == null || !canOpen(user, project)) throw new LocalizedStatusException(HttpStatus.NOT_FOUND, "project.notFound", id);
        return project;
    }

    /** The projects the user may see (the primary administrator: all of them), with owner and groups. */
    @Transactional(readOnly = true)
    public List<ProjectSummary> summaries(long userId) {
        AppUser user = user(userId);
        List<ProjectRow> rows = seesAll(user) ? projects.rows() : projects.rowsVisibleTo(user.getId());
        Map<Long, List<ProjectSummary.Ref>> sharedWith = new HashMap<>();
        if (!rows.isEmpty())
            for (Object[] link : projects.groupsOf(rows.stream().map(ProjectRow::id).toList()))
                sharedWith.computeIfAbsent((Long) link[0], key -> new ArrayList<>()).add(new ProjectSummary.Ref((Long) link[1], (String) link[2]));
        Map<Long, ProjectSummary.Ref> owners = new HashMap<>();
        users.findAllById(rows.stream().map(ProjectRow::ownerId).filter(java.util.Objects::nonNull).collect(Collectors.toSet()))
                .forEach(owner -> owners.put(owner.getId(), new ProjectSummary.Ref(owner.getId(), owner.getName() + " " + owner.getSurname())));
        return rows.stream().map(row -> {
            boolean mine = user.getId().equals(row.ownerId());
            return new ProjectSummary(row.id(), row.name(), row.updated(), owners.get(row.ownerId()), sharedWith.getOrDefault(row.id(), List.of()),
                    mine, mine || seesAll(user));
        }).toList();
    }

    /** The summary of one project the user may open. */
    @Transactional(readOnly = true)
    public ProjectSummary summary(long userId, long id) {
        return summaries(userId).stream().filter(summary -> summary.id() == id).findFirst()
                .orElseThrow(() -> new LocalizedStatusException(HttpStatus.NOT_FOUND, "project.notFound", id));
    }

    @Transactional(readOnly = true)
    public Document document(long userId, long id) {
        ProjectDoc project = openable(user(userId), id);
        return new Document(project.getJson(), project.getVersion());
    }

    /** A new project of the user; the database gives it its number. Answers the number and version. */
    @Transactional
    public ProjectSummary.Created create(long userId, String json, String name) {
        AppUser user = user(userId);
        JsonNode document = ProjectJson.check(json);
        if (groupService.isRestricted(user) && !ProjectJson.isEmpty(document))
            throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "project.importNotAllowed");
        if (maxProjectsPerUser > 0 && projects.countByOwnerId(user.getId()) >= maxProjectsPerUser)
            throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "project.quotaReached", maxProjectsPerUser);
        ProjectDoc project = new ProjectDoc(json, name);
        project.setOwnerId(user.getId());
        project = projects.saveAndFlush(project);
        log.info("Created project {} of user {} (name={}, {} chars)", project.getId(), user.getId(), name, json.length());
        return new ProjectSummary.Created(project.getId(), project.getVersion());
    }

    /**
     * Saves a project the user may open, based on version {@code expectedVersion}; answers the new version. 404 for a project that does not
     * exist or that the user may not open, 409 when it was saved by somebody else since that version.
     */
    @Transactional
    public long save(long userId, long id, long expectedVersion, String json, String name) {
        AppUser user = user(userId);
        ProjectDoc project = openable(user, id);
        if (project.getVersion() != expectedVersion) {
            log.info("Save of project {} by user {} refused: based on version {}, the database has {}", id, user.getId(), expectedVersion, project.getVersion());
            throw new LocalizedStatusException(HttpStatus.CONFLICT, "project.changedElsewhere", id);
        }
        ProjectJson.check(json);
        project.update(json, name);
        projects.flush();
        log.info("Saved project {} by user {} (name={}, {} chars, version {})", id, user.getId(), name, json.length(), project.getVersion());
        return project.getVersion();
    }

    /** Deletes a project (owner or administrator). A number that does not exist is fine: there is nothing to delete. */
    @Transactional
    public void delete(long userId, long id) {
        AppUser user = user(userId);
        if (!projects.existsById(id)) return;
        ProjectDoc project = openable(user, id);
        if (!canManage(user, project)) throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "project.notOwner");
        projects.delete(project);
        log.info("Deleted project {} by user {}", id, user.getId());
    }

    /**
     * Shares a project with exactly these groups (owner or administrator). An owner who is no administrator can only add or remove his own
     * groups; the groups of others that the project is already shared with (by an administrator) stay.
     */
    @Transactional
    public ProjectSummary share(long userId, long id, List<Long> groupIds) {
        AppUser user = user(userId);
        ProjectDoc project = openable(user, id);
        if (!canManage(user, project)) throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "project.notOwner");
        Set<Long> wanted = new LinkedHashSet<>(groupIds == null ? List.of() : groupIds);
        List<UserGroup> chosen = groups.findAllById(wanted);
        if (chosen.size() != wanted.size()) throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "group.notFound");
        Set<Long> allowed = user.isAdmin() ? null : groupIdsOf(user);
        if (allowed != null && chosen.stream().anyMatch(group -> !allowed.contains(group.getId()) && !project.getGroups().contains(group)))
            throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "group.notMember");
        // groups the user cannot choose stay as they are
        project.getGroups().removeIf(group -> (allowed == null || allowed.contains(group.getId())) && !wanted.contains(group.getId()));
        project.getGroups().addAll(chosen);
        log.info("Project {} shared with groups {} by user {}", id, project.getGroups().stream().map(UserGroup::getId).toList(), user.getId());
        projects.flush();
        return summary(userId, id);
    }
}
