// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import com.pleysje.plugged.entity.AppUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Keeps the session in step with the account:
 * <ul>
 *   <li>an account that was removed (or is no longer approved) while it was signed in: its next request is anonymous again;</li>
 *   <li>an account that was made administrator, or an ordinary user again: its next request has the new role, without signing in again;</li>
 *   <li>a session signed in before the password changed (by the user in another session, or a reset by an administrator) ends;</li>
 *   <li>an account with a temporary password may only change it (and use /api/auth and /api/info): the rest of the API answers 403.</li>
 * </ul>
 */
public class ActiveUserFilter extends OncePerRequestFilter {
    private final UserService userService;
    private final SecurityContextRepository contexts;

    public ActiveUserFilter(UserService userService, SecurityContextRepository contexts) {
        this.userService = userService;
        this.contexts = contexts;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof PluggedPrincipal principal) {
            AppUser user = userService.activeUser(principal.id());
            if (user == null || user.getCredentialsVersion() != principal.credentialsVersion()) {
                SecurityContextHolder.clearContext();
                HttpSession session = request.getSession(false);
                if (session != null) session.invalidate();
            } else if (user.isMustChangePassword() && mustWait(request)) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/problem+json");
                response.setCharacterEncoding("UTF-8");
                response.getWriter().write("{\"status\":403,\"messageKey\":\"auth.passwordChangeRequired\"}");
                return;
            } else if (user.isAdmin() != Authentications.isAdmin(authentication)) {
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(Authentications.of(user));
                SecurityContextHolder.setContext(context);
                contexts.saveContext(context, request, response);
            }
        }
        chain.doFilter(request, response);
    }

    /** With a temporary password: everything of the API except signing in and out, changing the password and the info. */
    private static boolean mustWait(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return path.startsWith("/api/") && !path.startsWith("/api/auth/") && !path.equals("/api/info");
    }
}
