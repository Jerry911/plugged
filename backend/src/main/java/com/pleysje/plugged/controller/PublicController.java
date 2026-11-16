// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.service.ProjectService;
import com.pleysje.plugged.service.SymbolService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the page of a QR code needs, for everybody, without signing in (see SecurityConfig). The QR code on a circuit board holds
 * {@code /?schema=<project number>}; the page fetches the project here and builds the PDF in the browser.
 * <ul>
 *   <li>GET /api/public/schemas/{id} with the secret of the project's QR code in the header X-Schema-Key: the newest saved document of
 *       the project. 404 when the project does not exist, is in the trash, or the key is missing or wrong (nothing tells these apart).
 *       Never cached: the QR code stays the same, so every scan must show the latest version.</li>
 *   <li>GET /api/public/symbols: the standard symbols the sheets are drawn with</li>
 * </ul>
 * Everything here is read only.
 */
@RestController
@RequestMapping("/api/public")
public class PublicController {
    /** The header that carries the secret of the QR code. */
    public static final String KEY_HEADER = "X-Schema-Key";
    private static final Logger log = LoggerFactory.getLogger(PublicController.class);

    private final ProjectService projects;
    private final SymbolService symbols;

    public PublicController(ProjectService projects, SymbolService symbols) {
        this.projects = projects;
        this.symbols = symbols;
    }

    @GetMapping(value = "/schemas/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> schema(@PathVariable long id, @RequestHeader(value = KEY_HEADER, required = false) String key) {
        return ApiLog.run(log, "GET /api/public/schemas/{id}", "id=" + id,
                () -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(projects.publicDocument(id, key).json()));
    }

    @GetMapping("/symbols")
    public ResponseEntity<List<SymbolDto>> standardSymbols() {
        return ApiLog.run(log, "GET /api/public/symbols", "", () -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(symbols.standardSymbols()));
    }
}
