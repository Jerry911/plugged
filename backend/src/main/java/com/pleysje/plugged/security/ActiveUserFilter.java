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
 *   <li>an account that was made administrator, or an ordinary user again: its next request has the new role, without signing in again.</li>
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
            if (user == null) {
                SecurityContextHolder.clearContext();
                HttpSession session = request.getSession(false);
                if (session != null) session.invalidate();
            } else if (user.isAdmin() != Authentications.isAdmin(authentication)) {
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(Authentications.of(user));
                SecurityContextHolder.setContext(context);
                contexts.saveContext(context, request, response);
            }
        }
        chain.doFilter(request, response);
    }
}
