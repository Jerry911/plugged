// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.TestAccounts;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.ProjectDoc;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.security.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Groups and administrator roles (/api/admin/groups, /api/admin/users/{id}/admin, /api/groups). */
@SpringBootTest(properties = "plugged.admin.email=admin@example.be")
@AutoConfigureMockMvc
class AdminControllerTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    ProjectRepository projects;
    @Autowired
    UserService userService;

    AppUser admin, alice, bob;

    @BeforeEach
    void clean() {
        TestAccounts.clean(groups, projects, users);
        admin = account(users, "Admin", true); // admin@example.be: the primary administrator
        alice = account(users, "Alice", false);
        bob = account(users, "Bob", false);
    }

    private ResultActions json(MockHttpServletRequestBuilder request, AppUser user, String body) throws Exception {
        return mvc.perform(request.with(as(user)).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private long createGroup(String name) throws Exception {
        String answer = json(post("/api/admin/groups"), admin, "{\"name\":\"" + name + "\"}").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return Long.parseLong(answer.replaceAll("^\\{\"id\":(\\d+).*$", "$1"));
    }

    @Test
    void onlyAnAdministratorManagesGroups() throws Exception {
        mvc.perform(get("/api/admin/groups").with(as(alice))).andExpect(status().isForbidden());
        json(post("/api/admin/groups"), alice, "{\"name\":\"X\"}").andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/users/" + bob.getId() + "/admin").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{\"admin\":true}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void groupsAreCreatedRenamedAndValidated() throws Exception {
        long id = createGroup(" Elektriciens ");
        json(post("/api/admin/groups"), admin, "{\"name\":\"elektriciens\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.messageKey", is("group.nameTaken")));
        json(post("/api/admin/groups"), admin, "{\"name\":\" \"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("group.nameRequired")));
        json(post("/api/admin/groups"), admin, "{}").andExpect(status().isBadRequest());
        json(post("/api/admin/groups"), admin, "{\"name\":\"" + "g".repeat(101) + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.messageKey", is("group.nameTooLong")));
        createGroup("Architecten");
        json(put("/api/admin/groups/" + id), admin, "{\"name\":\"Architecten\"}").andExpect(status().isConflict());
        json(put("/api/admin/groups/" + id), admin, "{\"name\":\"ELEKTRICIENS\"}").andExpect(status().isOk()).andExpect(jsonPath("$.name", is("ELEKTRICIENS")));
        json(put("/api/admin/groups/99999"), admin, "{\"name\":\"X\"}").andExpect(status().isNotFound()).andExpect(jsonPath("$.messageKey", is("group.notFound")));
        mvc.perform(get("/api/admin/groups").with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", contains("Architecten", "ELEKTRICIENS")));
    }

    @Test
    void membersAreAddedAndRemoved() throws Exception {
        long id = createGroup("Team");
        mvc.perform(put("/api/admin/groups/" + id + "/members/" + bob.getId()).with(as(admin))).andExpect(status().isOk());
        mvc.perform(put("/api/admin/groups/" + id + "/members/" + alice.getId()).with(as(admin))).andExpect(status().isOk());
        mvc.perform(put("/api/admin/groups/" + id + "/members/" + alice.getId()).with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$.members[*].name", contains("Alice", "Bob")))
                .andExpect(jsonPath("$.members[0].email", is("alice@example.be")));
        mvc.perform(put("/api/admin/groups/" + id + "/members/99999").with(as(admin))).andExpect(status().isNotFound());
        mvc.perform(put("/api/admin/groups/99999/members/" + bob.getId()).with(as(admin))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/admin/groups/" + id + "/members/" + bob.getId()).with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$.members[*].name", contains("Alice")));
        mvc.perform(delete("/api/admin/groups/" + id + "/members/" + bob.getId()).with(as(admin))).andExpect(status().isOk());
        // what a user may share with: his own groups; the administrator: all
        createGroup("Ander");
        mvc.perform(get("/api/groups").with(as(alice))).andExpect(jsonPath("$[*].name", contains("Team")));
        mvc.perform(get("/api/groups").with(as(bob))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/groups").with(as(admin))).andExpect(jsonPath("$[*].name", contains("Ander", "Team")));
    }

    @Test
    void aRemovedGroupNoLongerSharesItsProjects() throws Exception {
        long id = createGroup("Team");
        mvc.perform(put("/api/admin/groups/" + id + "/members/" + alice.getId()).with(as(admin)));
        mvc.perform(put("/api/admin/groups/" + id + "/members/" + bob.getId()).with(as(admin)));
        json(put("/api/projects/1"), alice, "{}").andExpect(status().isNoContent());
        json(put("/api/projects/1/groups"), alice, "{\"groupIds\":[" + id + "]}").andExpect(status().isOk());
        mvc.perform(get("/api/projects/1").with(as(bob))).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/groups/" + id).with(as(admin))).andExpect(status().isNoContent());
        mvc.perform(get("/api/projects/1").with(as(bob))).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/1").with(as(alice))).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/groups/" + id).with(as(admin))).andExpect(status().isNotFound());
    }

    @Test
    void anAccountBecomesAdministratorAndTheSessionFollowsAtOnce() throws Exception {
        bob.setApproved(false);
        users.save(bob);
        json(put("/api/admin/users/" + bob.getId() + "/admin"), admin, "{\"admin\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.admin", is(true)))
                .andExpect(jsonPath("$.approved", is(true)));
        // alice was signed in as an ordinary user; once she is administrator her next request has the role
        json(put("/api/admin/users/" + alice.getId() + "/admin"), admin, "{\"admin\":true}").andExpect(status().isOk());
        mvc.perform(get("/api/admin/groups").with(as(alice))).andExpect(status().isOk());
        // and the other way round
        AppUser aliceAsAdmin = users.findById(alice.getId()).orElseThrow();
        json(put("/api/admin/users/" + alice.getId() + "/admin"), admin, "{\"admin\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.admin", is(false)));
        mvc.perform(get("/api/admin/groups").with(as(aliceAsAdmin))).andExpect(status().isForbidden());
    }

    @Test
    void thePrimaryAdministratorStaysAndNobodyDemotesHimself() throws Exception {
        AppUser second = account(users, "Second", true);
        json(put("/api/admin/users/" + admin.getId() + "/admin"), second, "{\"admin\":false}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.messageKey", is("user.primaryAdmin")));
        json(put("/api/admin/users/" + second.getId() + "/admin"), second, "{\"admin\":false}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.messageKey", is("user.cannotDemoteSelf")));
        mvc.perform(delete("/api/admin/users/" + second.getId()).with(as(admin))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.messageKey", is("user.adminCannotBeDeleted")));
        json(put("/api/admin/users/" + second.getId() + "/admin"), admin, "{\"admin\":false}").andExpect(status().isOk());
        // demoting an ordinary user changes nothing
        json(put("/api/admin/users/" + bob.getId() + "/admin"), admin, "{\"admin\":false}").andExpect(status().isOk());
        json(put("/api/admin/users/99999/admin"), admin, "{\"admin\":true}").andExpect(status().isNotFound());
        mvc.perform(get("/api/admin/users").with(as(admin)))
                .andExpect(jsonPath("$[?(@.email == 'admin@example.be')].primary", contains(true)))
                .andExpect(jsonPath("$[?(@.email == 'second@example.be')].primary", contains(false)));
        assertTrue(userService.isPrimaryAdmin(admin));
        assertFalse(userService.isPrimaryAdmin(second));
    }

    @Test
    void theProjectsOfARemovedAccountGoToTheAdministratorWhoRemovesIt() throws Exception {
        long group = createGroup("Team");
        mvc.perform(put("/api/admin/groups/" + group + "/members/" + bob.getId()).with(as(admin)));
        json(put("/api/projects/4"), bob, "{\"v\":4}").andExpect(status().isNoContent());
        mvc.perform(delete("/api/admin/users/" + bob.getId()).with(as(admin))).andExpect(status().isNoContent());
        assertEquals(admin.getId(), projects.findById(4L).orElseThrow().getOwnerId());
        mvc.perform(get("/api/admin/groups").with(as(admin))).andExpect(jsonPath("$[0].members", hasSize(0)));
    }

    @Test
    void projectsFromBeforeAccountsBelongToThePrimaryAdministrator() {
        projects.save(new ProjectDoc(12L, "{}", "Oud"));
        userService.claimOwnerlessProjects();
        assertEquals(admin.getId(), projects.findById(12L).orElseThrow().getOwnerId());
    }
}
