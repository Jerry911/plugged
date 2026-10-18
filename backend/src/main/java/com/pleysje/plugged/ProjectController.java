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
    private final ProjectRepo repo;

    public ProjectController(ProjectRepo r) {
        repo = r;
    }

    @GetMapping
    public List<Long> list() {
        return repo.findAll().stream().map(ProjectDoc::getId).toList();
    }

    @GetMapping(value = "/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> get(@PathVariable Long id) {
        return repo.findById(id).map(d -> ResponseEntity.ok(d.getJson())).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> put(@PathVariable Long id, @RequestBody String json) {
        repo.save(new ProjectDoc(id, json));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public void del(@PathVariable Long id) {
        repo.deleteById(id);
    }
}
