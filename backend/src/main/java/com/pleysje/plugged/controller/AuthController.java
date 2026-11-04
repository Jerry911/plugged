// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.AuthRequests;
import com.pleysje.plugged.dto.AuthStatusDto;
import com.pleysje.plugged.dto.UserDto;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.security.PluggedPrincipal;
import com.pleysje.plugged.security.SecurityConfig;
import com.pleysje.plugged.security.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Signing in and out, registration and the first start.
 * <ul>
 *   <li>GET /api/auth/status: {setupRequired, adminEmail, user} (see {@link AuthStatusDto})</li>
 *   <li>POST /api/auth/setup {name, surname, password}: creates the administrator (first start only) and signs it in</li>
 *   <li>POST /api/auth/register {name, surname, email, password}: a new account, waiting for approval (201)</li>
 *   <li>POST /api/auth/login {email, password}: 401 wrong address or password, 403 not approved yet</li>
 *   <li>POST /api/auth/logout</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserService userService;
    private final SecurityContextRepository contexts;

    public AuthController(UserService userService, SecurityContextRepository contexts) {
        this.userService = userService;
        this.contexts = contexts;
    }

    @GetMapping("/status")
    public AuthStatusDto status(Authentication authentication) {
        return ApiLog.run(log, "GET /api/auth/status", "", () -> {
            AppUser user = authentication != null && authentication.getPrincipal() instanceof PluggedPrincipal principal ? userService.activeUser(principal.id()) : null;
            return new AuthStatusDto(userService.setupRequired(), userService.adminEmail(), user == null ? null : UserDto.of(user));
        });
    }

    @PostMapping("/setup")
    public UserDto setup(@RequestBody AuthRequests.Setup body, HttpServletRequest request, HttpServletResponse response) {
        return ApiLog.run(log, "POST /api/auth/setup", "", () -> signIn(userService.setup(body), request, response));
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto register(@RequestBody AuthRequests.Register body) {
        return ApiLog.run(log, "POST /api/auth/register", "", () -> UserDto.of(userService.register(body)));
    }

    @PostMapping("/login")
    public UserDto login(@RequestBody AuthRequests.Login body, HttpServletRequest request, HttpServletResponse response) {
        return ApiLog.run(log, "POST /api/auth/login", "", () -> signIn(userService.authenticate(body), request, response));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        ApiLog.runVoid(log, "POST /api/auth/logout", "", () -> new SecurityContextLogoutHandler().logout(request, response, authentication));
    }

    /** Puts the user in a new session (a new session id, so an id that was known before signing in is worthless). */
    private UserDto signIn(AppUser user, HttpServletRequest request, HttpServletResponse response) {
        List<GrantedAuthority> roles = new ArrayList<>(List.of(new SimpleGrantedAuthority("ROLE_" + SecurityConfig.ROLE_USER)));
        if (user.isAdmin()) roles.add(new SimpleGrantedAuthority("ROLE_" + SecurityConfig.ROLE_ADMIN));
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new PluggedPrincipal(user.getId(), user.getEmail()), null, roles));
        SecurityContextHolder.setContext(context);
        if (request.getSession(false) != null) request.changeSessionId();
        contexts.saveContext(context, request, response);
        log.info("User {} signed in", user.getId());
        return UserDto.of(user);
    }
}
