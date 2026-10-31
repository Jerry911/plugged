// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What this installation shows on the Info page: the PayPal donate link (plugged.donate.paypal-url) and the address the contact form
 * writes to (plugged.contact.email). The server never sends mail: the contact form opens the visitor's own mail program.
 */
@RestController
@RequestMapping("/api/info")
public class InfoController {
    public record Info(String donateUrl, String contactEmail) {
    }

    private final Info info;

    public InfoController(@Value("${plugged.donate.paypal-url:}") String donateUrl,
                          @Value("${plugged.contact.email:}") String contactEmail) {
        this.info = new Info(donateUrl.trim(), contactEmail.trim());
    }

    @GetMapping
    public Info info() {
        return info;
    }
}
