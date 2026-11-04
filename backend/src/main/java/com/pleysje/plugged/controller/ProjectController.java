// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.AdminRequests;
import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.security.Authentications;
import com.pleysje.plugged.service.ProjectService;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The stored projects of the signed-in user: one JSON document per project number (the frontend owns the format), with its name, the time of
 * the last save, its owner and the groups it is shared with. Who may do what: see {@link ProjectService}.
 * <ul>
 *   <li>GET /api/projects: the numbers of the projects the user may see</li>
 *   <li>GET /api/projects/summaries: [{id, name, updated, owner, groups, mine, canManage}] of those projects</li>
 *   <li>POST /api/projects?name=: a new project under the next free number; answers {id} (201)</li>
 *   <li>GET / PUT / DELETE /api/projects/{id}: the document; 404 for a project the user may not see</li>
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
    public String get(@PathVariable long id, Authentication authentication) {
        return ApiLog.run(log, "GET /api/projects/{id}", "id=" + id, () -> projects.document(Authentications.userId(authentication), id));
    }

    @PostMapping
    public ResponseEntity<Map<String, Long>> create(@RequestBody String json, @RequestParam(required = false) String name, Authentication authentication) {
        String operation = "POST /api/projects";
        return ApiLog.run(log, operation, "name=" + name + ", json=" + json.length() + " chars", () -> {
            ApiLog.body(log, operation, json);
            long id = projects.create(Authentications.userId(authentication), json, cleanName(name));
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
        });
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> put(@PathVariable long id, @RequestBody String json, @RequestParam(required = false) String name, Authentication authentication) {
        String operation = "PUT /api/projects/{id}";
        return ApiLog.run(log, operation, "id=" + id + ", name=" + name + ", json=" + json.length() + " chars", () -> {
            ApiLog.body(log, operation, json);
            projects.save(Authentications.userId(authentication), id, json, cleanName(name));
            return ResponseEntity.noContent().<Void>build();
        });
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
