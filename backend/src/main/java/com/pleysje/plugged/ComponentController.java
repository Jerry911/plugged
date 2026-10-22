// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * The component library: GET lists all components as [{k, json}], PUT /{k} stores one component (body = its JSON),
 * PUT (collection) upserts many at once (used to seed the standard components), DELETE /{k} removes one.
 * <p>
 * Legacy: the symbol library now lives in the symbols table ({@link SymbolController}, /api/symbols). This API is only kept so the
 * frontend can copy the own components of an older installation into the symbols table (and delete them here) the first time it starts.
 * Once nobody has rows left in component_doc, this controller, {@link ComponentDoc} and {@link ComponentRepo} can be removed.
 */
@RestController
@RequestMapping("/api/components")
public class ComponentController {
    private final ComponentRepo componentRepo;

    public ComponentController(ComponentRepo componentRepo) {
        this.componentRepo = componentRepo;
    }

    @GetMapping
    public List<ComponentDoc> list() {
        return componentRepo.findAll();
    }

    @PutMapping
    public ResponseEntity<Void> putAll(@RequestBody List<ComponentDoc> docs) {
        componentRepo.saveAll(docs);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{componentKey}")
    public ResponseEntity<Void> put(@PathVariable String componentKey, @RequestBody String json) {
        componentRepo.save(new ComponentDoc(componentKey, json));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{componentKey}")
    public void del(@PathVariable String componentKey) {
        componentRepo.deleteById(componentKey);
    }
}
