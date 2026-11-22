// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.desktop;

import com.pleysje.plugged.security.Authentications;
import com.pleysje.plugged.security.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Plugged as a program on one computer ({@link DesktopMode}):
 * <ul>
 *   <li>GET /desktop/open?token= : signs the browser in as the local account and goes to the editor; a wrong or used token goes to the
 *       editor without signing in (it then says to use the button in the Plugged window).</li>
 *   <li>POST /desktop/show with the header X-Plugged-Instance: a second start of the program; this one opens the browser (204), 403 for a
 *       wrong secret.</li>
 * </ul>
 */
@RestController
@ConditionalOnProperty(name = "plugged.desktop.enabled", havingValue = "true")
public class DesktopController {
    private static final Logger log = LoggerFactory.getLogger(DesktopController.class);

    private final DesktopMode mode;
    private final UserService userService;
    private final SecurityContextRepository contexts;

    public DesktopController(DesktopMode mode, UserService userService, SecurityContextRepository contexts) {
        this.mode = mode;
        this.userService = userService;
        this.contexts = contexts;
    }

    @GetMapping("/desktop/open")
    public ResponseEntity<Void> open(@RequestParam(required = false) String token, HttpServletRequest request, HttpServletResponse response) {
        if (mode.useToken(token)) {
            var user = userService.recordLogin(mode.localAccount().getId());
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(Authentications.of(user));
            SecurityContextHolder.setContext(context);
            if (request.getSession(false) != null) request.changeSessionId();
            contexts.saveContext(context, request, response);
            log.info("The browser is signed in as the local account");
        } else log.info("Sign-in link of the program refused (used or expired)");
        return ResponseEntity.status(HttpStatus.SEE_OTHER).location(URI.create("/")).build();
    }

    @PostMapping("/desktop/show")
    public ResponseEntity<Void> show(@RequestHeader(value = DesktopMode.INSTANCE_HEADER, required = false) String secret) {
        if (!mode.isInstanceSecret(secret)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        mode.openBrowser();
        return ResponseEntity.noContent().build();
    }
}
