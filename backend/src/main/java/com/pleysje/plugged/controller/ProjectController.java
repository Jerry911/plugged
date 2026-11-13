// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.AdminRequests;
import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.security.Authentications;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.service.PresenceService;
import com.pleysje.plugged.service.ProjectService;
import java.util.Map;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The stored projects of the signed-in user: one JSON document per project number (the frontend owns the format), with its name, the time of
 * the last save, its owner and the groups it is shared with. Who may do what: see {@link ProjectService}.
 * <ul>
 *   <li>GET /api/projects: the numbers of the projects the user may see</li>
 *   <li>GET /api/projects/summaries: [{id, name, updated, owner, groups, mine, canManage}] of those projects</li>
 *   <li>POST /api/projects?name=: a new project, the server gives the number; answers {id, version} (201) and the version as ETag</li>
 *   <li>GET /api/projects/{id}: the document, its version in the ETag header; 404 for a project the user may not see</li>
 *   <li>PUT /api/projects/{id}: saves the document; the If-Match header must carry the version it is based on (428 without it, 409 when
 *       somebody else saved in between); answers 204 with the new version as ETag. A project that does not exist answers 404.</li>
 *   <li>DELETE /api/projects/{id}: into the trash. GET /api/projects/trash: the projects in the trash the user may restore;
 *       POST /api/projects/{id}/untrash takes one out again; DELETE /api/projects/trash/{id} removes it for good</li>
 *   <li>POST /api/projects/{id}/copy?name=: a copy as a new own project; answers {id, version} (201)</li>
 *   <li>GET /api/projects/{id}/versions: the history [{version, name, savedAt, savedBy, size, current}]; GET .../versions/{version}: that
 *       document; POST .../versions/{version}/restore: saves it again as the newest version (new ETag)</li>
 *   <li>POST /api/projects/{id}/presence {window, editing}: this window has the project open (a heartbeat); answers {others: [{name,
 *       editing, since, me}], version, savedBy, savedByMe}: who else has it open (me: another window of the same user), and the version in
 *       the database and who saved it. DELETE
 *       /api/projects/{id}/presence?window= when it closes.</li>
 *   <li>PUT /api/projects/{id}/groups {groupIds}: the groups the project is shared with (owner or administrator)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/projects")
public class ProjectController {
    private static final Logger log = LoggerFactory.getLogger(ProjectController.class);

    private final ProjectService projects;
    private final PresenceService presence;

    public ProjectController(ProjectService projects, PresenceService presence) {
        this.projects = projects;
        this.presence = presence;
    }

    @GetMapping
    public List<Long> list(Authentication authentication) {
        return ApiLog.run(log, "GET /api/projects", "", () -> {
            List<Long> ids = projects.summaries(Authentications.userId(authentication)).stream().map(ProjectSummary::id).toList();
            log.debug("    project ids: {}", ids);
            return ids;
        });
    }

    /** Id, name, last save, owner and groups of every project the user may see (for the "Laden" list). */
    @GetMapping("/summaries")
    public List<ProjectSummary> summaries(Authentication authentication) {
        return ApiLog.run(log, "GET /api/projects/summaries", "", () -> {
            List<ProjectSummary> summaries = projects.summaries(Authentications.userId(authentication));
            summaries.forEach(summary -> log.trace("    project {} \"{}\" last saved {}", summary.id(), summary.name(), summary.updated()));
            return summaries;
        });
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> get(@PathVariable long id, Authentication authentication) {
        return ApiLog.run(log, "GET /api/projects/{id}", "id=" + id, () -> {
            ProjectService.Document document = projects.document(Authentications.userId(authentication), id);
            return ResponseEntity.ok().eTag(etag(document.version())).body(document.json());
        });
    }

    @PostMapping
    public ResponseEntity<ProjectSummary.Created> create(@RequestBody String json, @RequestParam(required = false) String name, Authentication authentication) {
        String operation = "POST /api/projects";
        return ApiLog.run(log, operation, "name=" + name + ", json=" + json.length() + " chars", () -> {
            ApiLog.body(log, operation, json);
            ProjectSummary.Created created = projects.create(Authentications.userId(authentication), json, cleanName(name));
            return ResponseEntity.status(HttpStatus.CREATED).eTag(etag(created.version())).body(created);
        });
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> put(@PathVariable long id, @RequestBody String json, @RequestParam(required = false) String name,
                                    @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch, Authentication authentication) {
        String operation = "PUT /api/projects/{id}";
        return ApiLog.run(log, operation, "id=" + id + ", name=" + name + ", version=" + ifMatch + ", json=" + json.length() + " chars", () -> {
            ApiLog.body(log, operation, json);
            long version = projects.save(Authentications.userId(authentication), id, versionOf(ifMatch), json, cleanName(name));
            return ResponseEntity.noContent().eTag(etag(version)).<Void>build();
        });
    }

    /** The ETag of a version: "3". */
    static String etag(long version) {
        return "\"" + version + "\"";
    }

    /** The version of an If-Match header ("3", W/"3" or 3); 428 when there is none. */
    static long versionOf(String ifMatch) {
        String value = ifMatch == null ? "" : ifMatch.trim();
        if (value.startsWith("W/")) value = value.substring(2);
        value = value.replace("\"", "");
        try {
            if (!value.isEmpty()) return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            // falls through to the answer below
        }
        throw new LocalizedStatusException(HttpStatus.PRECONDITION_REQUIRED, "project.versionRequired");
    }

    @GetMapping("/trash")
    public List<ProjectSummary> trash(Authentication authentication) {
        return ApiLog.run(log, "GET /api/projects/trash", "", () -> projects.trash(Authentications.userId(authentication)));
    }

    @PostMapping("/{id}/untrash")
    public ProjectSummary untrash(@PathVariable long id, Authentication authentication) {
        return ApiLog.run(log, "POST /api/projects/{id}/untrash", "id=" + id, () -> {
            long userId = Authentications.userId(authentication);
            projects.untrash(userId, id);
            return projects.summary(userId, id);
        });
    }

    @DeleteMapping("/trash/{id}")
    public ResponseEntity<Void> purge(@PathVariable long id, Authentication authentication) {
        return ApiLog.run(log, "DELETE /api/projects/trash/{id}", "id=" + id, () -> {
            projects.purge(Authentications.userId(authentication), id);
            return ResponseEntity.noContent().<Void>build();
        });
    }

    @PostMapping("/{id}/copy")
    public ResponseEntity<ProjectSummary.Created> copy(@PathVariable long id, @RequestParam(required = false) String name, Authentication authentication) {
        return ApiLog.run(log, "POST /api/projects/{id}/copy", "id=" + id + ", name=" + name, () -> {
            ProjectSummary.Created created = projects.copy(Authentications.userId(authentication), id, cleanName(name));
            return ResponseEntity.status(HttpStatus.CREATED).eTag(etag(created.version())).body(created);
        });
    }

    @GetMapping("/{id}/versions")
    public List<ProjectService.VersionSummary> history(@PathVariable long id, Authentication authentication) {
        return ApiLog.run(log, "GET /api/projects/{id}/versions", "id=" + id, () -> projects.history(Authentications.userId(authentication), id));
    }

    @GetMapping(value = "/{id}/versions/{version}", produces = MediaType.APPLICATION_JSON_VALUE)
    public String version(@PathVariable long id, @PathVariable long version, Authentication authentication) {
        return ApiLog.run(log, "GET /api/projects/{id}/versions/{version}", "id=" + id + ", version=" + version,
                () -> projects.versionDocument(Authentications.userId(authentication), id, version));
    }

    @PostMapping("/{id}/versions/{version}/restore")
    public ResponseEntity<Map<String, Long>> restoreVersion(@PathVariable long id, @PathVariable long version, Authentication authentication) {
        return ApiLog.run(log, "POST /api/projects/{id}/versions/{version}/restore", "id=" + id + ", version=" + version, () -> {
            long now = projects.restoreVersion(Authentications.userId(authentication), id, version);
            return ResponseEntity.ok().eTag(etag(now)).body(Map.of("version", now));
        });
    }

    /** The body of a presence report: the (random) id of the browser window and whether it has unsaved changes. */
    public record Presence(String window, boolean editing) {
    }

    @PostMapping("/{id}/presence")
    public Map<String, Object> presence(@PathVariable long id, @RequestBody Presence body, Authentication authentication) {
        long userId = Authentications.userId(authentication);
        ProjectService.CurrentVersion current = projects.currentVersion(userId, id);
        AppUser user = projects.user(userId);
        String window = cleanWindow(body.window());
        List<PresenceService.Viewer> others = presence.report(id, window, userId, (user.getName() + " " + user.getSurname()).trim(), body.editing());
        Map<String, Object> answer = new java.util.LinkedHashMap<>();
        answer.put("others", others.stream().map(viewer -> Map.of("name", viewer.name(), "editing", viewer.editing(), "since", viewer.since(),
                "me", viewer.userId() == userId)).toList());
        answer.put("version", current.version());
        answer.put("savedBy", current.savedBy());
        answer.put("savedByMe", current.savedById() != null && current.savedById() == userId);
        return answer;
    }

    @DeleteMapping("/{id}/presence")
    public ResponseEntity<Void> leave(@PathVariable long id, @RequestParam String window) {
        presence.leave(id, cleanWindow(window));
        return ResponseEntity.noContent().build();
    }

    private static String cleanWindow(String window) {
        String clean = window == null ? "" : window.replaceAll("[^A-Za-z0-9_-]", "");
        if (clean.isEmpty() || clean.length() > 64) throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "project.invalidWindow");
        return clean;
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable long id, Authentication authentication) {
        ApiLog.runVoid(log, "DELETE /api/projects/{id}", "id=" + id, () -> projects.delete(Authentications.userId(authentication), id));
    }

    @PutMapping("/{id}/groups")
    public ProjectSummary share(@PathVariable long id, @RequestBody AdminRequests.Sharing body, Authentication authentication) {
        return ApiLog.run(log, "PUT /api/projects/{id}/groups", "id=" + id + ", groups=" + body.groupIds(),
                () -> projects.share(Authentications.userId(authentication), id, body.groupIds()));
    }

    private static String cleanName(String name) {
        return name == null || name.isBlank() ? null : name.strip();
    }
}
