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
 *   <li>see, open and save it: its owner, the members of a group it is shared with, and administrators;</li>
 *   <li>delete it and choose the groups it is shared with: its owner and administrators. An owner shares only with his own groups;
 *       an administrator with any group.</li>
 * </ul>
 * A project the user may not see answers 404, as if it did not exist: project numbers of others are not given away. New projects get the
 * next free number from the server ({@link #create}), so two users never pick the same one.
 */
@Service
public class ProjectService {
    private static final Logger log = LoggerFactory.getLogger(ProjectService.class);

    private final ProjectRepository projects;
    private final UserRepository users;
    private final UserGroupRepository groups;

    public ProjectService(ProjectRepository projects, UserRepository users, UserGroupRepository groups) {
        this.projects = projects;
        this.users = users;
        this.groups = groups;
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

    private static boolean canManage(AppUser user, ProjectDoc project) {
        return user.isAdmin() || owns(user, project);
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

    /** The projects the user may see (an administrator: all of them), with owner and groups. */
    @Transactional(readOnly = true)
    public List<ProjectSummary> summaries(long userId) {
        AppUser user = user(userId);
        List<ProjectRow> rows = user.isAdmin() ? projects.rows() : projects.rowsVisibleTo(user.getId());
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
                    mine, mine || user.isAdmin());
        }).toList();
    }

    /** The summary of one project the user may open. */
    @Transactional(readOnly = true)
    public ProjectSummary summary(long userId, long id) {
        return summaries(userId).stream().filter(summary -> summary.id() == id).findFirst()
                .orElseThrow(() -> new LocalizedStatusException(HttpStatus.NOT_FOUND, "project.notFound", id));
    }

    @Transactional(readOnly = true)
    public String document(long userId, long id) {
        return openable(user(userId), id).getJson();
    }

    /** A new project of the user under the next free number; answers that number. */
    @Transactional
    public synchronized long create(long userId, String json, String name) {
        AppUser user = user(userId);
        long id = projects.maxId() + 1;
        ProjectDoc project = new ProjectDoc(id, json, name);
        project.setOwnerId(user.getId());
        projects.save(project);
        log.info("Created project {} of user {} (name={}, {} chars)", id, user.getId(), name, json.length());
        return id;
    }

    /**
     * Saves a project the user may open. A number that does not exist yet becomes a new project of the user (an import or an older client
     * that chose the number itself); a project of someone else that the user may not open answers 404.
     */
    @Transactional
    public synchronized void save(long userId, long id, String json, String name) {
        AppUser user = user(userId);
        ProjectDoc project = projects.findById(id).orElse(null);
        if (project == null) {
            project = new ProjectDoc(id, json, name);
            project.setOwnerId(user.getId());
            projects.save(project);
            log.info("Created project {} of user {} (name={}, {} chars)", id, user.getId(), name, json.length());
            return;
        }
        if (!canOpen(user, project)) throw new LocalizedStatusException(HttpStatus.NOT_FOUND, "project.notFound", id);
        project.update(json, name);
        log.info("Saved project {} by user {} (name={}, {} chars)", id, user.getId(), name, json.length());
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
