// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {
    private static final Logger log = LoggerFactory.getLogger(ProjectController.class);

    private final ProjectRepo projectRepo;

    public ProjectController(ProjectRepo projectRepo) {
        this.projectRepo = projectRepo;
    }

    @GetMapping
    public List<Long> list() {
        return ApiLog.run(log, "GET /api/projects", "", () -> {
            List<Long> ids = projectRepo.summaries().stream().map(ProjectSummary::id).toList();
            log.debug("    project ids: {}", ids);
            return ids;
        });
    }

    /** Id, name and last save of every stored project (for the "Laden" list). */
    @GetMapping("/summaries")
    public List<ProjectSummary> summaries() {
        return ApiLog.run(log, "GET /api/projects/summaries", "", () -> {
            List<ProjectSummary> summaries = projectRepo.summaries();
            summaries.forEach(s -> log.trace("    project {} \"{}\" last saved {}", s.id(), s.name(), s.updated()));
            return summaries;
        });
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> get(@PathVariable Long id) {
        return ApiLog.run(log, "GET /api/projects/{id}", "id=" + id, () -> {
            ResponseEntity<String> answer = projectRepo.findById(id).map(d -> ResponseEntity.ok(d.getJson())).orElse(ResponseEntity.notFound().build());
            if (answer.getBody() == null) log.info("Project {} not found", id);
            return answer;
        });
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> put(@PathVariable Long id, @RequestBody String json, @RequestParam(required = false) String name) {
        String op = "PUT /api/projects/{id}";
        return ApiLog.run(log, op, "id=" + id + ", name=" + name + ", json=" + (json == null ? 0 : json.length()) + " chars", () -> {
            ApiLog.body(log, op, json);
            String cleanName = name == null || name.isBlank() ? null : name.strip();
            projectRepo.save(new ProjectDoc(id, json, cleanName));
            log.info("Saved project {} (name={}, {} chars)", id, cleanName, json.length());
            return ResponseEntity.noContent().<Void>build();
        });
    }

    @DeleteMapping("/{id}")
    public void del(@PathVariable Long id) {
        ApiLog.runVoid(log, "DELETE /api/projects/{id}", "id=" + id, () -> {
            projectRepo.deleteById(id);
            log.info("Deleted project {}", id);
        });
    }
}
