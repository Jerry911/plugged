// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/groups: the groups the signed-in user can share a project with ({id, name}): his own; for an administrator every group. */
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
}
