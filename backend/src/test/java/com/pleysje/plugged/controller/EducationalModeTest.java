// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.TestAccounts;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Educational mode: in a group with it on, the members who are no owner (students) cannot validate, import or export; the owners (teachers)
 * switch it, administrators are never restricted.
 */
@SpringBootTest(properties = "plugged.admin.email=admin@example.be")
@AutoConfigureMockMvc
class EducationalModeTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    ProjectRepository projects;

    AppUser admin, teacher, student, other;
    long klas;

    @BeforeEach
    void clean() throws Exception {
        TestAccounts.clean(groups, projects, users);
        admin = account(users, "Admin", true);
        teacher = account(users, "Leraar", false);
        student = account(users, "Student", false);
        other = account(users, "Ander", false);
        String answer = mvc.perform(post("/api/admin/groups").with(as(admin)).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Klas 5\"}"))
                .andReturn().getResponse().getContentAsString();
        klas = Long.parseLong(answer.replaceAll("^\\{\"id\":(\\d+).*$", "$1"));
        // the owner becomes a member by becoming owner
        mvc.perform(put("/api/admin/groups/" + klas + "/owners/" + teacher.getId()).with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$.members[?(@.name == 'Leraar')].owner", contains(true)))
                .andExpect(jsonPath("$.educational", is(false)));
        mvc.perform(put("/api/admin/groups/" + klas + "/members/" + student.getId()).with(as(admin))).andExpect(status().isOk());
    }

    private ResultActions authStatus(AppUser user) throws Exception {
        return mvc.perform(get("/api/auth/status").with(as(user)));
    }

    private ResultActions educational(AppUser user, long group, boolean on) throws Exception {
        return mvc.perform(put("/api/groups/" + group + "/educational").with(as(user)).contentType(MediaType.APPLICATION_JSON).content("{\"educational\":" + on + "}"));
    }

    @Test
    void offByDefault_nobodyIsRestricted() throws Exception {
        authStatus(student).andExpect(jsonPath("$.user.restricted", is(false))).andExpect(jsonPath("$.user.ownedGroups", hasSize(0)));
        authStatus(teacher).andExpect(jsonPath("$.user.restricted", is(false))).andExpect(jsonPath("$.user.ownedGroups", contains((int) klas)));
    }

    @Test
    void theTeacherSwitchesItOn_theStudentIsRestricted_theTeacherAndAdministratorsAreNot() throws Exception {
        educational(teacher, klas, true).andExpect(status().isOk()).andExpect(jsonPath("$.educational", is(true)));
        authStatus(student).andExpect(jsonPath("$.user.restricted", is(true)));
        authStatus(teacher).andExpect(jsonPath("$.user.restricted", is(false)));
        // an administrator who is an ordinary member of the group is still not restricted
        mvc.perform(put("/api/admin/groups/" + klas + "/members/" + admin.getId()).with(as(admin)));
        authStatus(admin).andExpect(jsonPath("$.user.restricted", is(false)));
        // somebody outside the group is not restricted
        authStatus(other).andExpect(jsonPath("$.user.restricted", is(false)));
        // signing in tells the editor at once
        mvc.perform(post("/api/auth/login").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"student@example.be\",\"password\":\"geheim123\"}"))
                .andExpect(jsonPath("$.restricted", is(true)));
        educational(teacher, klas, false).andExpect(jsonPath("$.educational", is(false)));
        authStatus(student).andExpect(jsonPath("$.user.restricted", is(false)));
    }

    @Test
    void onlyAnOwnerOrAnAdministratorSwitchesIt() throws Exception {
        educational(student, klas, true).andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("group.notOwner")));
        educational(other, klas, true).andExpect(status().isForbidden());
        educational(admin, klas, true).andExpect(status().isOk());
        educational(admin, 99999, true).andExpect(status().isNotFound());
    }

    @Test
    void theOwnedGroupsWithTheirMembers() throws Exception {
        mvc.perform(post("/api/admin/groups").with(as(admin)).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Andere klas\"}"));
        mvc.perform(get("/api/groups/owned").with(as(teacher))).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", contains("Klas 5")))
                .andExpect(jsonPath("$[0].members[*].name", contains("Leraar", "Student")))
                .andExpect(jsonPath("$[0].members[?(@.name == 'Student')].owner", contains(false)));
        mvc.perform(get("/api/groups/owned").with(as(student))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/groups/owned").with(as(admin))).andExpect(jsonPath("$[*].name", contains("Andere klas", "Klas 5")));
    }

    @Test
    void anOwnerWhoLosesOwnershipBecomesAStudent_aRemovedMemberIsNoOwnerEither() throws Exception {
        educational(teacher, klas, true);
        mvc.perform(delete("/api/admin/groups/" + klas + "/owners/" + teacher.getId()).with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$.members[?(@.name == 'Leraar')].owner", contains(false)));
        authStatus(teacher).andExpect(jsonPath("$.user.restricted", is(true)));
        mvc.perform(put("/api/admin/groups/" + klas + "/owners/" + teacher.getId()).with(as(admin)));
        mvc.perform(delete("/api/admin/groups/" + klas + "/members/" + teacher.getId()).with(as(admin))).andExpect(jsonPath("$.members[*].name", contains("Student")));
        authStatus(teacher).andExpect(jsonPath("$.user.restricted", is(false))).andExpect(jsonPath("$.user.ownedGroups", hasSize(0)));
        mvc.perform(put("/api/admin/groups/" + klas + "/owners/99999").with(as(admin))).andExpect(status().isNotFound());
        mvc.perform(put("/api/admin/groups/" + klas + "/owners/" + teacher.getId()).with(as(student))).andExpect(status().isForbidden());
    }

    @Test
    void aTeacherOfOneGroupIsAStudentInAnother() throws Exception {
        String answer = mvc.perform(post("/api/admin/groups").with(as(admin)).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Bijscholing\"}"))
                .andReturn().getResponse().getContentAsString();
        long course = Long.parseLong(answer.replaceAll("^\\{\"id\":(\\d+).*$", "$1"));
        mvc.perform(put("/api/admin/groups/" + course + "/members/" + teacher.getId()).with(as(admin)));
        educational(admin, course, true);
        authStatus(teacher).andExpect(jsonPath("$.user.restricted", is(true)));
        // his own group: he still switches it
        educational(teacher, klas, true).andExpect(status().isOk());
    }

    @Test
    void aRemovedOwnerLeavesNoOwnership() throws Exception {
        mvc.perform(delete("/api/admin/users/" + teacher.getId()).with(as(admin))).andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/groups").with(as(admin))).andExpect(jsonPath("$[0].members[*].name", contains("Student")));
    }
}
