// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "plugged.admin.email= Admin@Example.be ")
@AutoConfigureMockMvc
class AuthControllerTest {
    static final String ADMIN = "admin@example.be";
    static final String PASSWORD = "geheim123";

    @Autowired
    MockMvc mvc;
    @Autowired
    UserRepository users;
    @Autowired
    com.pleysje.plugged.repository.UserGroupRepository groups;
    @Autowired
    com.pleysje.plugged.repository.ProjectRepository projects;

    @BeforeEach
    void clean() {
        com.pleysje.plugged.TestAccounts.clean(groups, projects, users);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, String json) throws Exception {
        if (session != null) request.session(session);
        return mvc.perform(request.with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions setupAdmin(MockHttpSession session) throws Exception {
        return send(post("/api/auth/setup"), session, "{\"name\":\" Jeroen \",\"surname\":\"Pleysier\",\"password\":\"" + PASSWORD + "\"}");
    }

    private ResultActions register(String email, String password) throws Exception {
        return send(post("/api/auth/register"), null, "{\"name\":\"Jan\",\"surname\":\"Peeters\",\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
    }

    private ResultActions login(MockHttpSession session, String email, String password) throws Exception {
        return send(post("/api/auth/login"), session, "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
    }

    private MockHttpSession signedInAdmin() throws Exception {
        MockHttpSession session = new MockHttpSession();
        setupAdmin(session).andExpect(status().isOk());
        return session;
    }

    private long userId(String email) {
        return users.findByEmail(email).map(AppUser::getId).orElseThrow();
    }

    @Test
    void firstStartAsksForTheAdministratorWithTheConfiguredAddress() throws Exception {
        mvc.perform(get("/api/auth/status")).andExpect(status().isOk())
                .andExpect(jsonPath("$.setupRequired", is(true)))
                .andExpect(jsonPath("$.adminEmail", is(ADMIN)))
                .andExpect(jsonPath("$.user", nullValue()));
    }

    @Test
    void setupCreatesAnApprovedAdministratorAndSignsItIn() throws Exception {
        MockHttpSession session = new MockHttpSession();
        // an email address in the request is ignored: the address of the administrator is plugged.admin.email
        send(post("/api/auth/setup"), session, "{\"name\":\"Jeroen\",\"surname\":\"Pleysier\",\"email\":\"other@example.be\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email", is(ADMIN)))
                .andExpect(jsonPath("$.admin", is(true)))
                .andExpect(jsonPath("$.approved", is(true)))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        mvc.perform(get("/api/auth/status").session(session))
                .andExpect(jsonPath("$.setupRequired", is(false)))
                .andExpect(jsonPath("$.user.email", is(ADMIN)))
                .andExpect(jsonPath("$.user.name", is("Jeroen")));
        assertTrue(users.findByEmail("other@example.be").isEmpty());
        mvc.perform(get("/api/projects").session(session)).andExpect(status().isOk());
    }

    @Test
    void setupGivesTheProjectsFromBeforeAccountsToTheAdministrator() throws Exception {
        projects.save(new com.pleysje.plugged.entity.ProjectDoc(3L, "{}", "Oud"));
        MockHttpSession session = new MockHttpSession();
        setupAdmin(session).andExpect(status().isOk());
        mvc.perform(get("/api/projects/summaries").session(session)).andExpect(jsonPath("$[0].mine", is(true)));
    }

    @Test
    void setupOnlyHappensOnce() throws Exception {
        setupAdmin(null).andExpect(status().isOk());
        setupAdmin(null).andExpect(status().isConflict()).andExpect(jsonPath("$.messageKey", is("auth.setupDone")));
    }

    @Test
    void passwordIsStoredHashed() throws Exception {
        setupAdmin(null);
        String hash = users.findByEmail(ADMIN).orElseThrow().getPasswordHash();
        assertFalse(hash.contains(PASSWORD));
        assertTrue(hash.startsWith("{bcrypt}"));
    }

    @Test
    void nobodyRegistersOrSignsInBeforeTheSetup() throws Exception {
        register("jan@example.be", PASSWORD).andExpect(status().isConflict()).andExpect(jsonPath("$.messageKey", is("auth.setupRequired")));
        login(null, ADMIN, PASSWORD).andExpect(status().isUnauthorized());
    }

    @Test
    void aRegisteredAccountWaitsForApproval() throws Exception {
        MockHttpSession admin = signedInAdmin();
        register(" Jan@Example.be ", PASSWORD).andExpect(status().isCreated())
                .andExpect(jsonPath("$.email", is("jan@example.be")))
                .andExpect(jsonPath("$.admin", is(false)))
                .andExpect(jsonPath("$.approved", is(false)));
        login(null, "jan@example.be", PASSWORD).andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("auth.notApproved")));
        // the administrator sees it first in the list, and approves it
        mvc.perform(get("/api/admin/users").session(admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].email", is("jan@example.be")))
                .andExpect(jsonPath("$[1].email", is(ADMIN)));
        long id = userId("jan@example.be");
        mvc.perform(post("/api/admin/users/" + id + "/approve").session(admin).with(csrf())).andExpect(status().isOk()).andExpect(jsonPath("$.approved", is(true)));
        mvc.perform(post("/api/admin/users/" + id + "/approve").session(admin).with(csrf())).andExpect(status().isOk());
        MockHttpSession jan = new MockHttpSession();
        login(jan, "JAN@example.be", PASSWORD).andExpect(status().isOk()).andExpect(jsonPath("$.email", is("jan@example.be")));
        mvc.perform(get("/api/auth/status").session(jan)).andExpect(jsonPath("$.user.admin", is(false)));
        mvc.perform(get("/api/projects").session(jan)).andExpect(status().isOk());
        // a user is no administrator
        mvc.perform(get("/api/admin/users").session(jan)).andExpect(status().isForbidden());
    }

    @Test
    void wrongPasswordOrUnknownAddressIsRefusedTheSameWay() throws Exception {
        setupAdmin(null);
        login(null, ADMIN, "verkeerd!!").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.messageKey", is("auth.badCredentials")));
        login(null, "nobody@example.be", PASSWORD).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.messageKey", is("auth.badCredentials")));
        send(post("/api/auth/login"), null, "{}").andExpect(status().isUnauthorized());
        // an unapproved account with a wrong password does not learn that it exists
        register("jan@example.be", PASSWORD);
        login(null, "jan@example.be", "verkeerd!!").andExpect(status().isUnauthorized());
    }

    @Test
    void registrationIsValidated() throws Exception {
        setupAdmin(null);
        register("geen-adres", PASSWORD).andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("auth.invalidEmail")));
        register("jan@example.be", "kort").andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("auth.passwordTooShort")));
        register("jan@example.be", "x".repeat(73)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("auth.passwordTooLong")));
        register(ADMIN.toUpperCase(), PASSWORD).andExpect(status().isConflict()).andExpect(jsonPath("$.messageKey", is("auth.emailTaken")));
        send(post("/api/auth/register"), null, "{\"name\":\"\",\"surname\":\"P\",\"email\":\"a@b.be\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("auth.nameRequired")));
        send(post("/api/auth/register"), null, "{\"name\":\"J\",\"email\":\"a@b.be\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("auth.surnameRequired")));
        send(post("/api/auth/register"), null, "{\"name\":\"" + "j".repeat(101) + "\",\"surname\":\"P\",\"email\":\"a@b.be\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("auth.nameTooLong")));
        send(post("/api/auth/register"), null, "{\"name\":\"J\",\"surname\":\"P\",\"email\":\"a@b.be\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("auth.passwordTooShort")));
        // the messages are in the language of the request
        mvc.perform(post("/api/auth/register").with(csrf()).header(HttpHeaders.ACCEPT_LANGUAGE, "en").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"J\",\"surname\":\"P\",\"email\":\"x\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(jsonPath("$.detail", is("Not a valid email address")));
    }

    @Test
    void theApiNeedsASignedInUser() throws Exception {
        mvc.perform(get("/api/projects")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/symbols")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/users")).andExpect(status().isUnauthorized());
        // the page and the Info settings are public
        mvc.perform(get("/api/info")).andExpect(status().isOk());
    }

    @Test
    void changesNeedTheCsrfToken() throws Exception {
        MockHttpSession admin = signedInAdmin();
        mvc.perform(put("/api/projects/1").session(admin).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/projects/1").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNoContent());
    }

    @Test
    void logoutEndsTheSession() throws Exception {
        MockHttpSession admin = signedInAdmin();
        mvc.perform(post("/api/auth/logout").session(admin).with(csrf())).andExpect(status().isNoContent());
        assertTrue(admin.isInvalid());
        mvc.perform(get("/api/auth/status")).andExpect(jsonPath("$.user", nullValue()));
    }

    @Test
    void aDeletedAccountIsSignedOutAndTheAdministratorCannotBeDeleted() throws Exception {
        MockHttpSession admin = signedInAdmin();
        register("jan@example.be", PASSWORD);
        long id = userId("jan@example.be");
        mvc.perform(post("/api/admin/users/" + id + "/approve").session(admin).with(csrf()));
        MockHttpSession jan = new MockHttpSession();
        login(jan, "jan@example.be", PASSWORD).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/users/" + id).session(admin).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/projects").session(jan)).andExpect(status().isUnauthorized());
        assertTrue(jan.isInvalid());
        mvc.perform(delete("/api/admin/users/" + userId(ADMIN)).session(admin).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.messageKey", is("user.adminCannotBeDeleted")));
        mvc.perform(delete("/api/admin/users/99999").session(admin).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(post("/api/admin/users/99999/approve").session(admin).with(csrf())).andExpect(status().isNotFound());
    }
}
