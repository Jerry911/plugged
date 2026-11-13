// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.security.Authentications;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.service.SymbolService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The symbol catalog as the signed-in user sees it: the standard symbols, his personal symbols and those of his groups (see SymbolService for
 * who may change what; changing a standard symbol is for administrators). Error messages are written in the language of the request
 * (Accept-Language). Keys can contain ':' (symbols of the users are "custom:...").
 * <ul>
 *   <li>GET /api/symbols: the symbols of the user, in catalog order (standard symbols first); each says its {@code group} and whether it is {@code editable}</li>
 *   <li>GET /api/symbols/groups: the groups the user can put a symbol in ({id, name})</li>
 *   <li>GET /api/symbols/template: a new, empty symbol of the user (fresh key, default parents)</li>
 *   <li>GET /api/symbols/{key}, PUT /api/symbols/{key} (create or update, 400 when invalid; {@code group} null = personal symbol), DELETE /api/symbols/{key} (a standard symbol is deleted too; POST restore brings it back)</li>
 *   <li>POST /api/symbols/{key}/standard: the current drawing of a standard symbol becomes its standard (409 for an own symbol)</li>
 *   <li>POST /api/symbols/{key}/restore: back to the standard drawing; POST /api/symbols/restore: all standard symbols (returns the full list)</li>
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
    public List<SymbolDto> list(Authentication authentication) {
        return ApiLog.run(log, "GET /api/symbols", "", () -> service.list(Authentications.userId(authentication)));
    }

    @GetMapping("/groups")
    public List<ProjectSummary.Ref> groups(Authentication authentication) {
        return ApiLog.run(log, "GET /api/symbols/groups", "", () -> service.groupsFor(Authentications.userId(authentication)));
    }

    @GetMapping("/template")
    public SymbolDto template() {
        return ApiLog.run(log, "GET /api/symbols/template", "", service::template);
    }

    @GetMapping("/{key}")
    public SymbolDto get(@PathVariable String key, Authentication authentication) {
        return ApiLog.run(log, "GET /api/symbols/{key}", "key=" + key, () -> service.get(Authentications.userId(authentication), key));
    }

    @PutMapping("/{key}")
    public SymbolDto put(@PathVariable String key, @RequestBody SymbolDto symbol, Authentication authentication) {
        return ApiLog.run(log, "PUT /api/symbols/{key}", "key=" + key + ", " + (symbol == null ? "no body" : "name=\"" + symbol.name() + "\", category=" + symbol.category()
                + ", " + (symbol.shapes() == null ? 0 : symbol.shapes().size()) + " shapes, " + (symbol.parents() == null ? 0 : symbol.parents().size()) + " parents"), () -> {
            SymbolDto saved = service.save(Authentications.userId(authentication), key, symbol);
            log.info("Saved symbol {} (modified={})", saved.key(), saved.modified());
            return saved;
        });
    }

    @DeleteMapping("/{key}")
    public ResponseEntity<Void> delete(@PathVariable String key, Authentication authentication) {
        return ApiLog.run(log, "DELETE /api/symbols/{key}", "key=" + key, () -> {
            service.delete(Authentications.userId(authentication), key);
            log.info("Deleted symbol {}", key);
            return ResponseEntity.noContent().<Void>build();
        });
    }

    @PostMapping("/restore")
    public List<SymbolDto> restoreAll(Authentication authentication) {
        return ApiLog.run(log, "POST /api/symbols/restore", "", () -> {
            List<SymbolDto> all = service.restoreAll(Authentications.userId(authentication));
            log.info("Restored all standard symbols ({} symbols in the catalog)", all.size());
            return all;
        });
    }

    @PostMapping("/{key}/standard")
    public SymbolDto makeStandard(@PathVariable String key, Authentication authentication) {
        return ApiLog.run(log, "POST /api/symbols/{key}/standard", "key=" + key, () -> {
            SymbolDto standard = service.makeStandard(Authentications.userId(authentication), key);
            log.info("Current drawing of symbol {} is now its standard", key);
            return standard;
        });
    }

    @PostMapping("/{key}/restore")
    public SymbolDto restore(@PathVariable String key, Authentication authentication) {
        return ApiLog.run(log, "POST /api/symbols/{key}/restore", "key=" + key, () -> {
            SymbolDto restored = service.restore(Authentications.userId(authentication), key);
            log.info("Restored symbol {} to its standard drawing", key);
            return restored;
        });
    }
}