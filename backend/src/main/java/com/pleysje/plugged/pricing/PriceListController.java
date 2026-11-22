// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.pricing;

import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.security.Authentications;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The price lists of the offertes (PriceListService):
 * GET /api/price-lists (own and shared, without documents), GET /api/price-lists/groups (the groups to share with),
 * GET /api/price-lists/{id}, POST /api/price-lists {name, document, groupIds}, PUT /api/price-lists/{id} with If-Match: "version",
 * DELETE /api/price-lists/{id}.
 */
@RestController
@RequestMapping("/api/price-lists")
public class PriceListController {
    private static final Logger log = LoggerFactory.getLogger(PriceListController.class);
    private final PriceListService service;

    public PriceListController(PriceListService service) {
        this.service = service;
    }

    @GetMapping
    public List<PriceListService.Summary> list(Authentication authentication) {
        return service.list(Authentications.userId(authentication));
    }

    @GetMapping("/groups")
    public List<ProjectSummary.Ref> groups(Authentication authentication) {
        return service.groupsFor(Authentications.userId(authentication));
    }

    @GetMapping("/{id}")
    public PriceListService.Full get(@PathVariable long id, Authentication authentication) {
        return service.get(Authentications.userId(authentication), id);
    }

    @PostMapping
    public ResponseEntity<PriceListService.Full> create(@RequestBody PriceListService.Save save, Authentication authentication) {
        return ApiLog.run(log, "POST /api/price-lists", "", () -> ResponseEntity.status(HttpStatus.CREATED).body(service.create(Authentications.userId(authentication), save)));
    }

    @PutMapping("/{id}")
    public PriceListService.Full save(@PathVariable long id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                      @RequestBody PriceListService.Save save, Authentication authentication) {
        long version;
        try {
            version = Long.parseLong(ifMatch == null ? "-1" : ifMatch.replace("\"", "").replace("W/", "").trim());
        } catch (NumberFormatException invalid) {
            version = -1;
        }
        long base = version;
        return ApiLog.run(log, "PUT /api/price-lists/{id}", "id=" + id, () -> service.save(Authentications.userId(authentication), id, base, save));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id, Authentication authentication) {
        return ApiLog.run(log, "DELETE /api/price-lists/{id}", "id=" + id, () -> {
            service.delete(Authentications.userId(authentication), id);
            return ResponseEntity.noContent().<Void>build();
        });
    }
}
