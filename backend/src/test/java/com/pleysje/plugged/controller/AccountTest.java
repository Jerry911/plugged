// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.TestAccounts;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.UserGroup;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.SymbolRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.security.LoginThrottle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Changing the own password, a temporary password from an administrator, exporting the own data and removing the own account. */
@SpringBootTest(properties = "plugged.admin.email=admin@example.be")
@AutoConfigureMockMvc
class AccountTest {
    private static final String PASSWORD = "geheim123";

    @Autowired
    MockMvc mvc;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    ProjectRepository projects;
    @Autowired
    SymbolRepository symbols;
    @Autowired
    PasswordEncoder encoder;
    @Autowired
    LoginThrottle throttle;

    AppUser admin, jan;

    @BeforeEach
    void clean() {
        TestAccounts.clean(groups, projects, users);
        throttle.reset();
        admin = account("Admin", "admin@example.be", true);
        jan = account("Jan", "jan@example.be", false);
    }

    private AppUser account(String name, String email, boolean isAdmin) {
        AppUser user = new AppUser(name, "Peeters", email, encoder.encode(PASSWORD));
        user.setApproved(true);
        user.setAdmin(isAdmin);
        return users.save(user);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, String json) throws Exception {
        return mvc.perform(request.session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private MockHttpSession signIn(String email, String password) throws Exception {
        MockHttpSession session = new MockHttpSession();
        send(post("/api/auth/login"), session, "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}").andExpect(status().isOk());
        return session;
    }

    private ResultActions changePassword(MockHttpSession session, String current, String next) throws Exception {
        return send(put("/api/auth/password"), session, "{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}");
    }

    private ResultActions authStatus(MockHttpSession session) throws Exception {
        return mvc.perform(get("/api/auth/status").session(session));
    }

    @Test
    void aNewPasswordEndsTheOtherSessionsButNotThisOne() throws Exception {
        MockHttpSession laptop = signIn("jan@example.be", PASSWORD), phone = signIn("jan@example.be", PASSWORD);
        changePassword(laptop, "fout", "nieuwgeheim").andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("auth.currentPasswordWrong")));
        changePassword(laptop, PASSWORD, "kort").andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("auth.passwordTooShort")));
        changePassword(laptop, PASSWORD, PASSWORD).andExpect(status().isBadRequest()).andExpect(jsonPath("$.messageKey", is("auth.passwordUnchanged")));
        changePassword(laptop, PASSWORD, "nieuwgeheim").andExpect(status().isOk()).andExpect(jsonPath("$.email", is("jan@example.be")));
        authStatus(laptop).andExpect(jsonPath("$.user.email", is("jan@example.be")));
        authStatus(phone).andExpect(jsonPath("$.user").value(nullValue()));
        send(post("/api/auth/login"), new MockHttpSession(), "{\"email\":\"jan@example.be\",\"password\":\"" + PASSWORD + "\"}").andExpect(status().isUnauthorized());
        signIn("jan@example.be", "nieuwgeheim");
    }

    @Test
    void aTemporaryPasswordOfTheAdministratorHasToBeReplacedFirst() throws Exception {
        MockHttpSession old = signIn("jan@example.be", PASSWORD), adminSession = signIn("admin@example.be", PASSWORD);
        String answer = send(post("/api/admin/users/" + jan.getId() + "/password"), adminSession, "").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String temporary = answer.replaceAll(".*\"password\":\"([^\"]+)\".*", "$1");
        assertTrue(temporary.matches("[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}"), temporary);
        // his session of before ends
        authStatus(old).andExpect(jsonPath("$.user").value(nullValue()));
        MockHttpSession session = signIn("jan@example.be", temporary);
        authStatus(session).andExpect(jsonPath("$.user.mustChangePassword", is(true)));
        // nothing else until he chose his own
        mvc.perform(get("/api/projects").session(session)).andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("auth.passwordChangeRequired")));
        changePassword(session, temporary, "eigengeheim").andExpect(status().isOk()).andExpect(jsonPath("$.mustChangePassword", is(false)));
        mvc.perform(get("/api/projects").session(session)).andExpect(status().isOk());
    }

    @Test
    void notTheOwnNorThePrimaryAdministratorsPassword_andOnlyByAnAdministrator() throws Exception {
        MockHttpSession adminSession = signIn("admin@example.be", PASSWORD), janSession = signIn("jan@example.be", PASSWORD);
        send(post("/api/admin/users/" + admin.getId() + "/password"), adminSession, "").andExpect(status().isBadRequest());
        AppUser other = account("Ander", "ander@example.be", true);
        MockHttpSession otherSession = signIn("ander@example.be", PASSWORD);
        send(post("/api/admin/users/" + admin.getId() + "/password"), otherSession, "").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.messageKey", is("users.resetPrimaryPassword")));
        send(post("/api/admin/users/" + other.getId() + "/password"), janSession, "").andExpect(status().isForbidden());
    }

    @Test
    void theExportHoldsTheAccountGroupsProjectsAndSymbolsButNoPassword() throws Exception {
        MockHttpSession session = signIn("jan@example.be", PASSWORD);
        UserGroup team = new UserGroup("Team");
        team.getMembers().add(jan);
        groups.save(team);
        send(post("/api/projects").param("name", "Woning Jan"), session, "{\"footer\":{\"titel\":\"Mijn huis\"}}").andExpect(status().isCreated());
        send(put("/api/symbols/custom:jan"), session, "{\"name\":\"Lamp van Jan\",\"cat\":\"Eigen\",\"parents\":[],\"place\":true,"
                + "\"shapes\":[{\"t\":\"rect\",\"x\":2,\"y\":2,\"w\":10,\"h\":8}]}").andExpect(status().isOk());
        var response = mvc.perform(get("/api/account/export").session(session)).andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("attachment")))
                .andExpect(jsonPath("$.account.email", is("jan@example.be")))
                .andExpect(jsonPath("$.groups[0].name", is("Team")))
                .andExpect(jsonPath("$.projects[0].name", is("Woning Jan")))
                .andExpect(jsonPath("$.projects[0].document.footer.titel", is("Mijn huis")))
                .andExpect(jsonPath("$.symbols[0].name", is("Lamp van Jan")))
                .andReturn().getResponse().getContentAsString();
        assertFalse(response.contains("password") || response.contains("$2a$"), "no password (hash) in the export");
    }

    @Test
    void removingTheOwnAccountRemovesWhatIsHis() throws Exception {
        MockHttpSession session = signIn("jan@example.be", PASSWORD);
        send(post("/api/projects"), session, "{}").andExpect(status().isCreated());
        send(put("/api/symbols/custom:jan"), session, "{\"name\":\"Lamp\",\"cat\":\"Eigen\",\"parents\":[],\"place\":true,"
                + "\"shapes\":[{\"t\":\"rect\",\"x\":2,\"y\":2,\"w\":10,\"h\":8}]}").andExpect(status().isOk());
        send(delete("/api/account"), session, "{\"password\":\"fout\"}").andExpect(status().isForbidden());
        send(delete("/api/account"), session, "{\"password\":\"" + PASSWORD + "\"}").andExpect(status().isNoContent());
        authStatus(session).andExpect(jsonPath("$.user").value(nullValue()));
        assertTrue(users.findByEmail("jan@example.be").isEmpty());
        assertTrue(projects.idsOwnedBy(jan.getId()).isEmpty());
        assertTrue(symbols.findById("custom:jan").isEmpty());
    }

    @Test
    void thePrimaryAdministratorCannotRemoveHisAccount() throws Exception {
        MockHttpSession session = signIn("admin@example.be", PASSWORD);
        send(delete("/api/account"), session, "{\"password\":\"" + PASSWORD + "\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.messageKey", is("account.primaryCannotLeave")));
    }
}
