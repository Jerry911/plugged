// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.AdminRequests;
import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.security.Authentications;
import com.pleysje.plugged.service.ProjectService;
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
 *   <li>DELETE /api/projects/{id}</li>
 *   <li>PUT /api/projects/{id}/groups {groupIds}: the groups the project is shared with (owner or administrator)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/projects")
public class ProjectController {
    private static final Logger log = LoggerFactory.getLogger(ProjectController.class);

    private final ProjectService projects;

    public ProjectController(ProjectService projects) {
        this.projects = projects;
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
