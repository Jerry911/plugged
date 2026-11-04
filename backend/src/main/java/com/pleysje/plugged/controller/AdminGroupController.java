// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.AdminRequests;
import com.pleysje.plugged.dto.GroupDto;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.service.GroupService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
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
 * The groups, for administrators (SecurityConfig: /api/admin/** needs the ADMIN role).
 * <ul>
 *   <li>GET /api/admin/groups: every group with its members</li>
 *   <li>POST /api/admin/groups {name} (201), PUT /api/admin/groups/{id} {name}, DELETE /api/admin/groups/{id}</li>
 *   <li>PUT / DELETE /api/admin/groups/{id}/members/{userId}: add or remove a member; both answer the group</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/admin/groups")
public class AdminGroupController {
    private static final Logger log = LoggerFactory.getLogger(AdminGroupController.class);

    private final GroupService groups;

    public AdminGroupController(GroupService groups) {
        this.groups = groups;
    }

    @GetMapping
    public List<GroupDto> all() {
        return ApiLog.run(log, "GET /api/admin/groups", "", groups::all);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GroupDto create(@RequestBody AdminRequests.GroupName body) {
        return ApiLog.run(log, "POST /api/admin/groups", "name=" + body.name(), () -> groups.create(body.name()));
    }

    @PutMapping("/{id}")
    public GroupDto rename(@PathVariable long id, @RequestBody AdminRequests.GroupName body) {
        return ApiLog.run(log, "PUT /api/admin/groups/{id}", "id=" + id + ", name=" + body.name(), () -> groups.rename(id, body.name()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        ApiLog.runVoid(log, "DELETE /api/admin/groups/{id}", "id=" + id, () -> groups.delete(id));
    }

    @PutMapping("/{id}/members/{userId}")
    public GroupDto addMember(@PathVariable long id, @PathVariable long userId) {
        return ApiLog.run(log, "PUT /api/admin/groups/{id}/members/{userId}", "id=" + id + ", userId=" + userId, () -> groups.addMember(id, userId));
    }

    @DeleteMapping("/{id}/members/{userId}")
    public GroupDto removeMember(@PathVariable long id, @PathVariable long userId) {
        return ApiLog.run(log, "DELETE /api/admin/groups/{id}/members/{userId}", "id=" + id + ", userId=" + userId, () -> groups.removeMember(id, userId));
    }
}
