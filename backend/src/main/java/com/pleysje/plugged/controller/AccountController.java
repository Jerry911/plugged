// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.AuthRequests;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.security.Authentications;
import com.pleysje.plugged.service.AccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The own account of the signed-in user (GDPR):
 * <ul>
 *   <li>GET /api/account/export: everything stored about and by him, as a JSON file to download (see AccountService#export)</li>
 *   <li>DELETE /api/account {password}: removes his account and what is his, and signs him out (403 wrong password, 409 for the primary
 *       administrator)</li>
 * </ul>
 * Changing the password is PUT /api/auth/password (AuthController).
 */
@RestController
@RequestMapping("/api/account")
public class AccountController {
    private static final Logger log = LoggerFactory.getLogger(AccountController.class);

    private final AccountService accounts;

    public AccountController(AccountService accounts) {
        this.accounts = accounts;
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(Authentication authentication) {
        return ApiLog.run(log, "GET /api/account/export", "", () -> {
            byte[] body = accounts.export(Authentications.userId(authentication)).getBytes(StandardCharsets.UTF_8);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("plugged-mijn-gegevens.json").build().toString())
                    .body(body);
        });
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@RequestBody AuthRequests.DeleteAccount body, Authentication authentication, HttpServletRequest request) {
        return ApiLog.run(log, "DELETE /api/account", "", () -> {
            accounts.deleteAccount(Authentications.userId(authentication), body.password());
            SecurityContextHolder.clearContext();
            HttpSession session = request.getSession(false);
            if (session != null) session.invalidate();
            return ResponseEntity.noContent().<Void>build();
        });
    }
}
