// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.desktop;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Plugged as a program on one computer: only requests addressed to this computer itself (Host 127.0.0.1, localhost or [::1]) are answered.
 * A web page somewhere else that points its own domain name at 127.0.0.1 (DNS rebinding) gets 421, so it cannot reach the local server.
 * The QR code of a circuit board does not exist here (nobody can reach this computer to scan it): its API answers 404.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(name = "plugged.desktop.enabled", havingValue = "true")
public class DesktopHostFilter extends OncePerRequestFilter {
    private static final Pattern QR_CODE = Pattern.compile("^/api/(public/.*|projects/[^/]+/qr-key)$");
    private static final Pattern LOCAL_HOST = Pattern.compile("^(127\\.0\\.0\\.1|localhost|\\[::1\\])(:\\d+)?$");

    static boolean isLocal(String host) {
        return host != null && LOCAL_HOST.matcher(host.trim().toLowerCase(Locale.ROOT)).matches();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        // the name from the Host header (Tomcat takes it from there)
        String host = request.getHeader("Host");
        if (!isLocal(host != null ? host : request.getServerName())) {
            response.sendError(421);
            return;
        }
        if (QR_CODE.matcher(request.getRequestURI()).matches()) {
            response.sendError(404);
            return;
        }
        chain.doFilter(request, response);
    }
}
