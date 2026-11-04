// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.InfoDto;
import com.pleysje.plugged.logging.ApiLog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What this installation shows on the Info page: the PayPal donate link (plugged.donate.paypal-url) and the address the contact form
 * writes to (plugged.admin.email, the address of the administrator). The server never sends mail: the contact form opens the visitor's own mail program.
 */
@RestController
@RequestMapping("/api/info")
public class InfoController {
    private static final Logger log = LoggerFactory.getLogger(InfoController.class);

    private final InfoDto info;

    public InfoController(@Value("${plugged.donate.paypal-url:}") String donateUrl,
                          @Value("${plugged.admin.email:}") String contactEmail) {
        this.info = new InfoDto(donateUrl.trim(), contactEmail.trim());
        // the address itself is not logged, only whether the contact form is on
        log.info("Info page configured: donate button {}, contact form {}", info.donateUrl().isEmpty() ? "disabled" : "enabled (" + info.donateUrl() + ")",
                info.contactEmail().isEmpty() ? "hidden" : "enabled");
    }

    @GetMapping
    public InfoDto info() {
        return ApiLog.run(log, "GET /api/info", "", () -> info);
    }
}
