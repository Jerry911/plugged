// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.AdminRequests;
import com.pleysje.plugged.dto.UserDto;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.security.Authentications;
import com.pleysje.plugged.security.UserService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The accounts, for the administrator (SecurityConfig: /api/admin/** needs the ADMIN role).
 * <ul>
 *   <li>GET /api/admin/users: the accounts, those waiting for approval first</li>
 *   <li>POST /api/admin/users/{id}/approve: the account may sign in from now on</li>
 *   <li>PUT /api/admin/users/{id}/admin {admin}: makes the account administrator (true; also approves it) or an ordinary user again</li>
 *   <li>DELETE /api/admin/users/{id}: removes the account (also to turn down a registration); not an administrator. Its projects go to the
 *       administrator who removes it.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/admin/users")
public class UserAdminController {
    private static final Logger log = LoggerFactory.getLogger(UserAdminController.class);

    private final UserService userService;

    public UserAdminController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public List<UserDto> users() {
        return ApiLog.run(log, "GET /api/admin/users", "", () -> userService.all().stream().map(user -> UserDto.of(user, userService.isPrimaryAdmin(user))).toList());
    }

    @PostMapping("/{id}/approve")
    public UserDto approve(@PathVariable long id) {
        return ApiLog.run(log, "POST /api/admin/users/{id}/approve", "id=" + id, () -> UserDto.of(userService.approve(id)));
    }

    @PutMapping("/{id}/admin")
    public UserDto setAdmin(@PathVariable long id, @RequestBody AdminRequests.Role body, Authentication authentication) {
        return ApiLog.run(log, "PUT /api/admin/users/{id}/admin", "id=" + id + ", admin=" + body.admin(),
                () -> UserDto.of(userService.setAdmin(Authentications.userId(authentication), id, body.admin())));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id, Authentication authentication) {
        ApiLog.runVoid(log, "DELETE /api/admin/users/{id}", "id=" + id, () -> userService.delete(Authentications.userId(authentication), id));
    }
}
