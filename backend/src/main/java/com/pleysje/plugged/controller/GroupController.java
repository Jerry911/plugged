// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.dto.AdminRequests;
import com.pleysje.plugged.dto.GroupDto;
import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.logging.ApiLog;
import com.pleysje.plugged.security.Authentications;
import com.pleysje.plugged.service.GroupService;
import com.pleysje.plugged.service.ProjectService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The groups, for every signed-in user:
 * <ul>
 *   <li>GET /api/groups: the groups he can share a project with ({id, name}): his own; for an administrator every group</li>
 *   <li>GET /api/groups/owned: the groups whose educational mode he may switch, with their members (the groups he owns; all for an admin)</li>
 *   <li>PUT /api/groups/{id}/educational {educational}: switches the educational mode (an owner of the group or an administrator)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/groups")
public class GroupController {
    private static final Logger log = LoggerFactory.getLogger(GroupController.class);

    private final GroupService groups;
    private final ProjectService projects;

    public GroupController(GroupService groups, ProjectService projects) {
        this.groups = groups;
        this.projects = projects;
    }

    @GetMapping
    public List<ProjectSummary.Ref> shareable(Authentication authentication) {
        return ApiLog.run(log, "GET /api/groups", "", () -> groups.shareableBy(projects.user(Authentications.userId(authentication))));
    }

    @GetMapping("/owned")
    public List<GroupDto> owned(Authentication authentication) {
        return ApiLog.run(log, "GET /api/groups/owned", "", () -> groups.manageableBy(projects.user(Authentications.userId(authentication))));
    }

    @PutMapping("/{id}/educational")
    public GroupDto educational(@PathVariable long id, @RequestBody AdminRequests.Educational body, Authentication authentication) {
        return ApiLog.run(log, "PUT /api/groups/{id}/educational", "id=" + id + ", educational=" + body.educational(),
                () -> groups.setEducational(projects.user(Authentications.userId(authentication)), id, body.educational()));
    }
}
