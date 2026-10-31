// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {
    private final ProjectRepo projectRepo;

    public ProjectController(ProjectRepo projectRepo) {
        this.projectRepo = projectRepo;
    }

    @GetMapping
    public List<Long> list() {
        return projectRepo.summaries().stream().map(ProjectSummary::id).toList();
    }

    /** Id, name and last save of every stored project (for the "Laden" list). */
    @GetMapping("/summaries")
    public List<ProjectSummary> summaries() {
        return projectRepo.summaries();
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> get(@PathVariable Long id) {
        return projectRepo.findById(id).map(d -> ResponseEntity.ok(d.getJson())).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> put(@PathVariable Long id, @RequestBody String json, @RequestParam(required = false) String name) {
        projectRepo.save(new ProjectDoc(id, json, name == null || name.isBlank() ? null : name.strip()));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public void del(@PathVariable Long id) {
        projectRepo.deleteById(id);
    }
}
