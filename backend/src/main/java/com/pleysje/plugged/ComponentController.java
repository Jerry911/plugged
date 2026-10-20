// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * The component library: GET lists all components as [{k, json}], PUT /{k} stores one component (body = its JSON),
 * PUT (collection) upserts many at once (used to seed the standard components), DELETE /{k} removes one.
 */
@RestController
@RequestMapping("/api/components")
public class ComponentController {
    private final ComponentRepo repo;

    public ComponentController(ComponentRepo r) {
        repo = r;
    }

    @GetMapping
    public List<ComponentDoc> list() {
        return repo.findAll();
    }

    @PutMapping
    public ResponseEntity<Void> putAll(@RequestBody List<ComponentDoc> docs) {
        repo.saveAll(docs);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{k}")
    public ResponseEntity<Void> put(@PathVariable String k, @RequestBody String json) {
        repo.save(new ComponentDoc(k, json));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{k}")
    public void del(@PathVariable String k) {
        repo.deleteById(k);
    }
}
