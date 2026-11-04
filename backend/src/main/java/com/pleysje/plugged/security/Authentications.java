// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** The signed-in user as Spring Security keeps it: a {@link PluggedPrincipal} with ROLE_USER, plus ROLE_ADMIN for an administrator. */
public final class Authentications {
    public static final String ADMIN_AUTHORITY = "ROLE_" + SecurityConfig.ROLE_ADMIN;

    private Authentications() {
    }

    public static Authentication of(AppUser user) {
        List<GrantedAuthority> roles = new ArrayList<>(List.of(new SimpleGrantedAuthority("ROLE_" + SecurityConfig.ROLE_USER)));
        if (user.isAdmin()) roles.add(new SimpleGrantedAuthority(ADMIN_AUTHORITY));
        return UsernamePasswordAuthenticationToken.authenticated(new PluggedPrincipal(user.getId(), user.getEmail()), null, roles);
    }

    /** True when the authentication carries the administrator role. */
    public static boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().stream().anyMatch(authority -> ADMIN_AUTHORITY.equals(authority.getAuthority()));
    }

    /** The id of the signed-in user; 401 when the request has none of our sign-ins. */
    public static long userId(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof PluggedPrincipal principal) return principal.id();
        throw new LocalizedStatusException(HttpStatus.UNAUTHORIZED, "auth.signInRequired");
    }
}
