// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.AuthRequests;
import com.pleysje.plugged.dto.AuthStatusDto;
import com.pleysje.plugged.dto.UserDto;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.logging.UserMdcFilter;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.security.Authentications;
import com.pleysje.plugged.security.LoginThrottle;
import com.pleysje.plugged.security.PluggedPrincipal;
import com.pleysje.plugged.security.SetupKey;
import com.pleysje.plugged.security.UserService;
import com.pleysje.plugged.service.GroupService;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
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
 *   <li>POST /api/auth/setup {name, surname, password, setupKey}: creates the administrator (first start only) and signs it in; 403 when
 *       the setup key (printed in the log at start-up, see {@link SetupKey}) is wrong</li>
 *   <li>POST /api/auth/register {name, surname, email, password}: a new account, waiting for approval (201)</li>
 *   <li>POST /api/auth/login {email, password}: 401 wrong address or password, 403 not approved yet, 423 locked after too many wrong
 *       passwords</li>
 *   <li>POST /api/auth/logout</li>
 * </ul>
 * Setup, registration and failed sign-ins count towards the attempts of the network address (429 when there are too many, see
 * {@link LoginThrottle}).
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserService userService;
    private final GroupService groups;
    private final SecurityContextRepository contexts;
    private final SetupKey setupKey;
    private final LoginThrottle throttle;

    public AuthController(UserService userService, GroupService groups, SecurityContextRepository contexts, SetupKey setupKey, LoginThrottle throttle) {
        this.userService = userService;
        this.groups = groups;
        this.contexts = contexts;
        this.setupKey = setupKey;
        this.throttle = throttle;
    }

    /** The user as the editor needs him: with what educational mode allows him (see GroupService#isRestricted) and the groups he owns. */
    private UserDto forEditor(AppUser user) {
        return UserDto.of(user).forEditor(groups.isRestricted(user), groups.ownedGroupIds(user.getId()));
    }

    @GetMapping("/status")
    public AuthStatusDto status(Authentication authentication) {
        return ApiLog.run(log, "GET /api/auth/status", "", () -> {
            AppUser user = authentication != null && authentication.getPrincipal() instanceof PluggedPrincipal principal ? userService.activeUser(principal.id()) : null;
            return new AuthStatusDto(userService.setupRequired(), userService.adminEmail(), user == null ? null : forEditor(user));
        });
    }

    @PostMapping("/setup")
    public UserDto setup(@Valid @RequestBody AuthRequests.Setup body, HttpServletRequest request, HttpServletResponse response) {
        return ApiLog.run(log, "POST /api/auth/setup", "", () -> {
            String address = request.getRemoteAddr();
            throttle.checkAddress(address);
            throttle.recordAddress(address);
            if (!userService.setupRequired()) throw new LocalizedStatusException(HttpStatus.CONFLICT, "auth.setupDone");
            if (!setupKey.matches(body.setupKey())) {
                log.info("First start refused: wrong setup key");
                throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "auth.setupKeyWrong");
            }
            return signIn(userService.setup(body), request, response);
        });
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto register(@Valid @RequestBody AuthRequests.Register body, HttpServletRequest request) {
        return ApiLog.run(log, "POST /api/auth/register", "", () -> {
            String address = request.getRemoteAddr();
            throttle.checkAddress(address);
            throttle.recordAddress(address);
            return UserDto.of(userService.register(body));
        });
    }

    @PostMapping("/login")
    public UserDto login(@RequestBody AuthRequests.Login body, HttpServletRequest request, HttpServletResponse response) {
        return ApiLog.run(log, "POST /api/auth/login", "", () -> {
            String address = request.getRemoteAddr();
            throttle.checkAddress(address);
            AppUser user;
            try {
                user = userService.authenticate(body);
            } catch (LocalizedStatusException refused) {
                if (refused.getStatusCode() != HttpStatus.FORBIDDEN) throttle.recordAddress(address); // "not approved yet" knew the password
                throw refused;
            }
            return signIn(user, request, response);
        });
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        ApiLog.runVoid(log, "POST /api/auth/logout", "", () -> new SecurityContextLogoutHandler().logout(request, response, authentication));
    }

    /**
     * Puts the user in a new session (a new session id, so an id that was known before signing in is worthless), counts the sign-in and
     * from now on writes him in the log lines of this request.
     */
    private UserDto signIn(AppUser account, HttpServletRequest request, HttpServletResponse response) {
        AppUser user = userService.recordLogin(account.getId());
        UserMdcFilter.setUser(user.getEmail());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(Authentications.of(user));
        SecurityContextHolder.setContext(context);
        if (request.getSession(false) != null) request.changeSessionId();
        contexts.saveContext(context, request, response);
        log.info("User {} signed in (sign-in number {})", user.getId(), user.getLoginCount());
        return forEditor(user);
    }
}
