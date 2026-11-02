// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The symbol catalog. Keys can contain ':' (symbols of the user are "custom:...").
 * <ul>
 *   <li>GET /api/symbols: all symbols, in catalog order (standard symbols first)</li>
 *   <li>GET /api/symbols/template: a new, empty symbol of the user (fresh key, default parents)</li>
 *   <li>GET /api/symbols/{k}, PUT /api/symbols/{k} (create or update, 400 when invalid), DELETE /api/symbols/{k} (a standard symbol is deleted too; POST restore brings it back)</li>
 *   <li>POST /api/symbols/{k}/standard: the current drawing of a standard symbol becomes its standard (409 for an own symbol)</li>
 *   <li>POST /api/symbols/{k}/restore: back to the standard drawing; POST /api/symbols/restore: all standard symbols (returns the full list)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/symbols")
public class SymbolController {
    private static final Logger log = LoggerFactory.getLogger(SymbolController.class);

    private final SymbolService service;

    public SymbolController(SymbolService service) {
        this.service = service;
    }

    @GetMapping
    public List<SymbolDto> list() {
        return ApiLog.run(log, "GET /api/symbols", "", service::list);
    }

    @GetMapping("/template")
    public SymbolDto template() {
        return ApiLog.run(log, "GET /api/symbols/template", "", service::template);
    }

    @GetMapping("/{k}")
    public SymbolDto get(@PathVariable String k) {
        return ApiLog.run(log, "GET /api/symbols/{k}", "k=" + k, () -> service.get(k));
    }

    @PutMapping("/{k}")
    public SymbolDto put(@PathVariable String k, @RequestBody SymbolDto symbol) {
        return ApiLog.run(log, "PUT /api/symbols/{k}", "k=" + k + ", " + (symbol == null ? "no body" : "name=\"" + symbol.name() + "\", cat=" + symbol.cat()
                + ", " + (symbol.shapes() == null ? 0 : symbol.shapes().size()) + " shapes, " + (symbol.parents() == null ? 0 : symbol.parents().size()) + " parents"), () -> {
            SymbolDto saved = service.save(k, symbol);
            log.info("Saved symbol {} (modified={})", saved.k(), saved.modified());
            return saved;
        });
    }

    @DeleteMapping("/{k}")
    public ResponseEntity<Void> delete(@PathVariable String k) {
        return ApiLog.run(log, "DELETE /api/symbols/{k}", "k=" + k, () -> {
            service.delete(k);
            log.info("Deleted symbol {}", k);
            return ResponseEntity.noContent().<Void>build();
        });
    }

    @PostMapping("/restore")
    public List<SymbolDto> restoreAll() {
        return ApiLog.run(log, "POST /api/symbols/restore", "", () -> {
            List<SymbolDto> all = service.restoreAll();
            log.info("Restored all standard symbols ({} symbols in the catalog)", all.size());
            return all;
        });
    }

    @PostMapping("/{k}/standard")
    public SymbolDto makeStandard(@PathVariable String k) {
        return ApiLog.run(log, "POST /api/symbols/{k}/standard", "k=" + k, () -> {
            SymbolDto d = service.makeStandard(k);
            log.info("Current drawing of symbol {} is now its standard", k);
            return d;
        });
    }

    @PostMapping("/{k}/restore")
    public SymbolDto restore(@PathVariable String k) {
        return ApiLog.run(log, "POST /api/symbols/{k}/restore", "k=" + k, () -> {
            SymbolDto d = service.restore(k);
            log.info("Restored symbol {} to its standard drawing", k);
            return d;
        });
    }
}