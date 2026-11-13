// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import com.pleysje.plugged.dto.ProjectRow;
import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.ProjectDoc;
import com.pleysje.plugged.entity.ProjectVersion;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.ProjectVersionRepository;
import java.time.Duration;
import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
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
 *       on the plans); he fills it by working in it. He only duplicates his own projects.</li>
 *   <li><b>History</b>: every save is kept as a version (the newest plugged.project-history of them); whoever may open the project sees
 *       them and restores one (which is saved as a new version).</li>
 *   <li><b>Trash</b>: deleting puts a project in the trash, where its owner (and the primary administrator) restores it or removes it for
 *       good. After plugged.trash-days days it is removed by itself. A project in the trash is not listed, opened or saved.</li>
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
    private final ProjectVersionRepository versions;
    private final int maxProjectsPerUser;
    private final int historySize;
    private final int trashDays;

    public ProjectService(ProjectRepository projects, UserRepository users, UserGroupRepository groups, UserService userService, GroupService groupService,
                          ProjectVersionRepository versions,
                          @Value("${plugged.max-projects-per-user:500}") int maxProjectsPerUser,
                          @Value("${plugged.project-history:50}") int historySize,
                          @Value("${plugged.trash-days:30}") int trashDays) {
        this.projects = projects;
        this.users = users;
        this.groups = groups;
        this.userService = userService;
        this.groupService = groupService;
        this.versions = versions;
        this.maxProjectsPerUser = maxProjectsPerUser;
        this.historySize = historySize;
        this.trashDays = trashDays;
    }

    /** One version of the history: {@code savedBy} the name of who saved it (null when unknown), {@code size} in characters. */
    public record VersionSummary(long version, String name, String savedAt, String savedBy, int size, boolean current) {
    }

    /** The version just saved goes into the history; the oldest beyond plugged.project-history are removed. */
    private void remember(ProjectDoc project, Long userId) {
        if (historySize <= 0) return;
        versions.save(new ProjectVersion(project.getId(), project.getVersion(), project.getJson(), project.getName(), userId));
        List<Long> ids = versions.idsNewestFirst(project.getId());
        if (ids.size() > historySize) versions.deleteAllByIdInBatch(ids.subList(historySize, ids.size()));
    }

    private String nameOf(Long userId, Map<Long, String> cache) {
        if (userId == null) return null;
        return cache.computeIfAbsent(userId, id -> users.findById(id).map(user -> (user.getName() + " " + user.getSurname()).trim()).orElse(null));
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

    /** The project, if the user may open it (not in the trash); else 404. */
    private ProjectDoc openable(AppUser user, long id) {
        ProjectDoc project = projects.findById(id).orElse(null);
        if (project == null || project.isDeleted() || !canOpen(user, project)) throw new LocalizedStatusException(HttpStatus.NOT_FOUND, "project.notFound", id);
        return project;
    }

    /** A project in the trash the user may restore or remove for good (owner, primary administrator); else 404. */
    private ProjectDoc trashed(AppUser user, long id) {
        ProjectDoc project = projects.findById(id).orElse(null);
        if (project == null || !project.isDeleted() || !canManage(user, project)) throw new LocalizedStatusException(HttpStatus.NOT_FOUND, "project.notFound", id);
        return project;
    }

    /** The projects the user may see (the primary administrator: all of them), with owner and groups. */
    @Transactional(readOnly = true)
    public List<ProjectSummary> summaries(long userId) {
        AppUser user = user(userId);
        return toSummaries(user, seesAll(user) ? projects.rows() : projects.rowsVisibleTo(user.getId()));
    }

    /** The projects in the trash the user may restore: his own (the primary administrator: all). {@code updated} is when it was deleted. */
    @Transactional(readOnly = true)
    public List<ProjectSummary> trash(long userId) {
        AppUser user = user(userId);
        return toSummaries(user, projects.trashOf(seesAll(user) ? null : user.getId()));
    }

    private List<ProjectSummary> toSummaries(AppUser user, List<ProjectRow> rows) {
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
        remember(project, user.getId());
        log.info("Created project {} of user {} (name={}, {} chars)", project.getId(), user.getId(), name, json.length());
        return new ProjectSummary.Created(project.getId(), project.getVersion());
    }

    /**
     * A copy of a project the user may open, as a new project of his own (not shared, without history); {@code name} null = "Kopie van ...".
     * A student only copies his own projects (a copy of somebody else's work would be an import).
     */
    @Transactional
    public ProjectSummary.Created copy(long userId, long id, String name) {
        AppUser user = user(userId);
        ProjectDoc original = openable(user, id);
        if (groupService.isRestricted(user) && !owns(user, original)) throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "project.importNotAllowed");
        if (maxProjectsPerUser > 0 && projects.countByOwnerId(user.getId()) >= maxProjectsPerUser)
            throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "project.quotaReached", maxProjectsPerUser);
        ProjectDoc copy = new ProjectDoc(original.getJson(), name != null ? name : original.getName());
        copy.setOwnerId(user.getId());
        copy = projects.saveAndFlush(copy);
        remember(copy, user.getId());
        log.info("Project {} copied to project {} of user {}", id, copy.getId(), user.getId());
        return new ProjectSummary.Created(copy.getId(), copy.getVersion());
    }

    /** The history of a project the user may open, newest first. */
    @Transactional(readOnly = true)
    public List<VersionSummary> history(long userId, long id) {
        ProjectDoc project = openable(user(userId), id);
        Map<Long, String> names = new HashMap<>();
        return versions.rowsOf(id).stream()
                .map(row -> new VersionSummary(row.version(), row.name(), row.savedAt(), nameOf(row.savedBy(), names), row.size(), row.version() == project.getVersion()))
                .toList();
    }

    /** One version of the history of a project the user may open. */
    @Transactional(readOnly = true)
    public String versionDocument(long userId, long id, long version) {
        openable(user(userId), id);
        return versions.findByProjectIdAndVersion(id, version).map(ProjectVersion::getJson)
                .orElseThrow(() -> new LocalizedStatusException(HttpStatus.NOT_FOUND, "project.versionNotFound", version));
    }

    /** Saves an older version again as the newest one; answers the new version. Whoever may save the project may restore. */
    @Transactional
    public long restoreVersion(long userId, long id, long version) {
        AppUser user = user(userId);
        ProjectDoc project = openable(user, id);
        ProjectVersion old = versions.findByProjectIdAndVersion(id, version)
                .orElseThrow(() -> new LocalizedStatusException(HttpStatus.NOT_FOUND, "project.versionNotFound", version));
        project.update(old.getJson(), old.getName());
        projects.flush();
        remember(project, user.getId());
        log.info("Project {}: version {} restored by user {} as version {}", id, version, user.getId(), project.getVersion());
        return project.getVersion();
    }

    /** The version a project has now and who saved it ({@code savedById} / {@code savedBy}: null when unknown). */
    public record CurrentVersion(long version, Long savedById, String savedBy) {
    }

    /** The version a project the user may open has now, and who saved it. */
    @Transactional(readOnly = true)
    public CurrentVersion currentVersion(long userId, long id) {
        ProjectDoc project = openable(user(userId), id);
        ProjectVersion newest = versions.findFirstByProjectIdOrderByVersionDesc(id).filter(row -> row.getVersion() == project.getVersion()).orElse(null);
        return newest == null ? new CurrentVersion(project.getVersion(), null, null)
                : new CurrentVersion(project.getVersion(), newest.getSavedBy(), nameOf(newest.getSavedBy(), new HashMap<>()));
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
        remember(project, user.getId());
        log.info("Saved project {} by user {} (name={}, {} chars, version {})", id, user.getId(), name, json.length(), project.getVersion());
        return project.getVersion();
    }

    /** Puts a project in the trash (owner or primary administrator). A number that does not exist is fine: there is nothing to delete. */
    @Transactional
    public void delete(long userId, long id) {
        AppUser user = user(userId);
        ProjectDoc existing = projects.findById(id).orElse(null);
        if (existing == null || existing.isDeleted() && canManage(user, existing)) return;
        ProjectDoc project = openable(user, id);
        if (!canManage(user, project)) throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "project.notOwner");
        project.trash(user.getId());
        log.info("Project {} put in the trash by user {}", id, user.getId());
    }

    /** Takes a project out of the trash again. */
    @Transactional
    public void untrash(long userId, long id) {
        AppUser user = user(userId);
        trashed(user, id).trash(null);
        log.info("Project {} taken out of the trash by user {}", id, user.getId());
    }

    /** Removes a project in the trash for good, with its history. */
    @Transactional
    public void purge(long userId, long id) {
        AppUser user = user(userId);
        ProjectDoc project = trashed(user, id);
        remove(List.of(project.getId()));
        log.info("Project {} removed for good by user {}", id, user.getId());
    }

    /** Removes projects for good, with their history (also for a removed account, see AccountService). */
    public void remove(List<Long> ids) {
        if (ids.isEmpty()) return;
        versions.deleteByProjectIds(ids);
        projects.deleteAllById(ids);
        projects.flush();
    }

    /** Every night (and at start-up): the projects that are longer than plugged.trash-days in the trash are removed for good. */
    @Scheduled(cron = "${plugged.trash-purge-cron:0 17 3 * * *}")
    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    @Transactional
    public void purgeExpiredTrash() {
        if (trashDays <= 0) return;
        List<Long> expired = projects.trashedBefore(Instant.now().minus(Duration.ofDays(trashDays)).toString());
        remove(expired);
        if (!expired.isEmpty()) log.info("{} project(s) longer than {} days in the trash removed for good", expired.size(), trashDays);
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
