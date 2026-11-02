// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Logger log = LoggerFactory.getLogger(ComponentController.class);

    private final ComponentRepo componentRepo;

    public ComponentController(ComponentRepo componentRepo) {
        this.componentRepo = componentRepo;
    }

    @GetMapping
    public List<ComponentDoc> list() {
        return ApiLog.run(log, "GET /api/components", "", () -> {
            List<ComponentDoc> docs = componentRepo.findAll();
            log.debug("    legacy components in the database: {}", docs.size());
            return docs;
        });
    }

    @PutMapping
    public ResponseEntity<Void> putAll(@RequestBody List<ComponentDoc> docs) {
        return ApiLog.run(log, "PUT /api/components", "components=" + (docs == null ? 0 : docs.size()), () -> {
            componentRepo.saveAll(docs);
            log.info("Saved {} legacy components in one go", docs.size());
            return ResponseEntity.noContent().<Void>build();
        });
    }

    @PutMapping("/{componentKey}")
    public ResponseEntity<Void> put(@PathVariable String componentKey, @RequestBody String json) {
        String op = "PUT /api/components/{componentKey}";
        return ApiLog.run(log, op, "componentKey=" + componentKey + ", json=" + (json == null ? 0 : json.length()) + " chars", () -> {
            ApiLog.body(log, op, json);
            componentRepo.save(new ComponentDoc(componentKey, json));
            log.info("Saved legacy component {}", componentKey);
            return ResponseEntity.noContent().<Void>build();
        });
    }

    @DeleteMapping("/{componentKey}")
    public void del(@PathVariable String componentKey) {
        ApiLog.runVoid(log, "DELETE /api/components/{componentKey}", "componentKey=" + componentKey, () -> {
            componentRepo.deleteById(componentKey);
            log.info("Deleted legacy component {}", componentKey);
        });
    }
}
