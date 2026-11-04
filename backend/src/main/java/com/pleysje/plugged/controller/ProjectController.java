// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.entity.ProjectDoc;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.repository.ProjectRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The stored projects: one JSON document per project id (the frontend owns the format), with its name and the time of the last save. */
@RestController
@RequestMapping("/api/projects")
public class ProjectController {
    private static final Logger log = LoggerFactory.getLogger(ProjectController.class);

    private final ProjectRepository repository;

    public ProjectController(ProjectRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<Long> list() {
        return ApiLog.run(log, "GET /api/projects", "", () -> {
            List<Long> ids = repository.summaries().stream().map(ProjectSummary::id).toList();
            log.debug("    project ids: {}", ids);
            return ids;
        });
    }

    /** Id, name and last save of every stored project (for the "Laden" list). */
    @GetMapping("/summaries")
    public List<ProjectSummary> summaries() {
        return ApiLog.run(log, "GET /api/projects/summaries", "", () -> {
            List<ProjectSummary> summaries = repository.summaries();
            summaries.forEach(summary -> log.trace("    project {} \"{}\" last saved {}", summary.id(), summary.name(), summary.updated()));
            return summaries;
        });
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> get(@PathVariable Long id) {
        return ApiLog.run(log, "GET /api/projects/{id}", "id=" + id, () -> {
            ResponseEntity<String> answer = repository.findById(id).map(project -> ResponseEntity.ok(project.getJson())).orElse(ResponseEntity.notFound().build());
            if (answer.getBody() == null) log.info("Project {} not found", id);
            return answer;
        });
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> put(@PathVariable Long id, @RequestBody String json, @RequestParam(required = false) String name) {
        String operation = "PUT /api/projects/{id}";
        return ApiLog.run(log, operation, "id=" + id + ", name=" + name + ", json=" + (json == null ? 0 : json.length()) + " chars", () -> {
            ApiLog.body(log, operation, json);
            String cleanName = name == null || name.isBlank() ? null : name.strip();
            repository.save(new ProjectDoc(id, json, cleanName));
            log.info("Saved project {} (name={}, {} chars)", id, cleanName, json.length());
            return ResponseEntity.noContent().<Void>build();
        });
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        ApiLog.runVoid(log, "DELETE /api/projects/{id}", "id=" + id, () -> {
            repository.deleteById(id);
            log.info("Deleted project {}", id);
        });
    }
}
