// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.security.Authentications;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

/** Accounts stored in the database for the tests of who may do what, and requests made by them. */
public final class TestAccounts {
    private TestAccounts() {
    }

    /** Removes projects, groups and accounts (in that order: projects point at groups, groups at accounts). The test contexts share one database. */
    public static void clean(UserGroupRepository groups, ProjectRepository projects, UserRepository users) {
        projects.deleteAll();
        groups.deleteAll();
        users.deleteAll();
    }

    /** An approved account (an administrator when {@code admin}). */
    public static AppUser account(UserRepository users, String name, boolean admin) {
        AppUser user = new AppUser(name, "Test", name.toLowerCase() + "@example.be", "{noop}geheim123");
        user.setApproved(true);
        user.setAdmin(admin);
        return users.save(user);
    }

    /** The request is made by this signed-in account, with a valid CSRF token. */
    public static RequestPostProcessor as(AppUser user) {
        return request -> csrf().postProcessRequest(authentication(Authentications.of(user)).postProcessRequest(request));
    }
}
