// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.entity.ComponentDoc;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.repository.ComponentRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The component library: GET lists all components as [{k, json}], PUT /{k} stores one component (body = its JSON),
 * PUT (collection) upserts many at once (used to seed the standard components), DELETE /{k} removes one.
 * <p>
 * Legacy: the symbol library now lives in the symbols table ({@link SymbolController}, /api/symbols). This API is only kept so the
 * frontend can copy the own components of an older installation into the symbols table (and delete them here) the first time it starts.
 * Once nobody has rows left in component_doc, this controller, {@link ComponentDoc} and {@link ComponentRepository} can be removed.
 */
@RestController
@RequestMapping("/api/components")
public class ComponentController {
    private static final Logger log = LoggerFactory.getLogger(ComponentController.class);

    private final ComponentRepository repository;

    public ComponentController(ComponentRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<ComponentDoc> list() {
        return ApiLog.run(log, "GET /api/components", "", () -> {
            List<ComponentDoc> components = repository.findAll();
            log.debug("    components in the database: {}", components.size());
            return components;
        });
    }

    @PutMapping
    public ResponseEntity<Void> putAll(@RequestBody List<ComponentDoc> components) {
        return ApiLog.run(log, "PUT /api/components", "components=" + (components == null ? 0 : components.size()), () -> {
            repository.saveAll(components);
            log.info("Saved {} components in one go", components.size());
            return ResponseEntity.noContent().<Void>build();
        });
    }

    @PutMapping("/{componentKey}")
    public ResponseEntity<Void> put(@PathVariable String componentKey, @RequestBody String json) {
        String operation = "PUT /api/components/{componentKey}";
        return ApiLog.run(log, operation, "componentKey=" + componentKey + ", json=" + (json == null ? 0 : json.length()) + " chars", () -> {
            ApiLog.body(log, operation, json);
            repository.save(new ComponentDoc(componentKey, json));
            log.info("Saved component {}", componentKey);
            return ResponseEntity.noContent().<Void>build();
        });
    }

    @DeleteMapping("/{componentKey}")
    public void delete(@PathVariable String componentKey) {
        ApiLog.runVoid(log, "DELETE /api/components/{componentKey}", "componentKey=" + componentKey, () -> {
            repository.deleteById(componentKey);
            log.info("Deleted component {}", componentKey);
        });
    }
}
