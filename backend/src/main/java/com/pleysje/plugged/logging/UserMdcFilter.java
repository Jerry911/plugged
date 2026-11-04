// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.logging;

import com.pleysje.plugged.security.PluggedPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Puts the signed-in user (his email address) in the logging context for the whole request, so every log line it causes says who did it
 * ({@code %X{user}} in the pattern of logback-spring.xml; "-" for a request without a signed-in user). Signing in puts the user there too
 * ({@link #setUser}), so the lines after a successful sign-in already carry him.
 */
public class UserMdcFilter extends OncePerRequestFilter {
    public static final String KEY = "user";

    /** From now on the log lines of this request carry this user. */
    public static void setUser(String email) {
        MDC.put(KEY, email);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof PluggedPrincipal principal) setUser(principal.email());
        try {
            chain.doFilter(request, response);
        } finally {
            // the thread serves other requests next
            MDC.remove(KEY);
        }
    }
}
