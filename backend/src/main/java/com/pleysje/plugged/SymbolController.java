// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import java.util.List;
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
 *   <li>GET /api/symbols/{k}, PUT /api/symbols/{k} (create or update, 400 when invalid), DELETE /api/symbols/{k} (409 for a standard symbol)</li>
 *   <li>POST /api/symbols/{k}/restore: back to the standard drawing; POST /api/symbols/restore: all standard symbols (returns the full list)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/symbols")
public class SymbolController {
    private final SymbolService service;

    public SymbolController(SymbolService service) {
        this.service = service;
    }

    @GetMapping
    public List<SymbolDto> list() {
        return service.list();
    }

    @GetMapping("/template")
    public SymbolDto template() {
        return service.template();
    }

    @GetMapping("/{k}")
    public SymbolDto get(@PathVariable String k) {
        return service.get(k);
    }

    @PutMapping("/{k}")
    public SymbolDto put(@PathVariable String k, @RequestBody SymbolDto symbol) {
        return service.save(k, symbol);
    }

    @DeleteMapping("/{k}")
    public ResponseEntity<Void> delete(@PathVariable String k) {
        service.delete(k);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/restore")
    public List<SymbolDto> restoreAll() {
        return service.restoreAll();
    }

    @PostMapping("/{k}/restore")
    public SymbolDto restore(@PathVariable String k) {
        return service.restore(k);
    }
}
