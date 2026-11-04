// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.catalog.CatalogJson;
import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.service.SymbolService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The standard symbols for the next release, for administrators (see StandardSymbols):
 * <ul>
 *   <li>GET /api/admin/symbols/catalog: the catalog file standard-symbols.json as this installation has it (download)</li>
 *   <li>GET /api/admin/symbols/catalog/changes: the standard symbols whose standard differs from the shipped catalog</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/admin/symbols/catalog")
public class AdminSymbolController {
    private static final Logger log = LoggerFactory.getLogger(AdminSymbolController.class);
    public static final String FILE_NAME = "standard-symbols.json";

    private final SymbolService symbols;

    public AdminSymbolController(SymbolService symbols) {
        this.symbols = symbols;
    }

    @GetMapping
    public ResponseEntity<String> catalog() {
        return ApiLog.run(log, "GET /api/admin/symbols/catalog", "", () -> ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(FILE_NAME).build().toString())
                .body(CatalogJson.write(symbols.catalog())));
    }

    @GetMapping("/changes")
    public List<SymbolDto> changes() {
        return ApiLog.run(log, "GET /api/admin/symbols/catalog/changes", "", symbols::catalogChanges);
    }
}
