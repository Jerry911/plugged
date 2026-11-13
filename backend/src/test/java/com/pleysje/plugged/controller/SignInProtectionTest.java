// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.TestAccounts;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.security.LoginThrottle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** The first start needs the setup key; wrong passwords lock an account; a network address gets a limited number of attempts. */
@SpringBootTest(properties = {"plugged.admin.email=admin@example.be", "plugged.auth.max-failed-logins=3", "plugged.auth.lockout=10m",
        "plugged.auth.ip-max-attempts=8", "plugged.auth.ip-window=15m"})
@AutoConfigureMockMvc
class SignInProtectionTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    ProjectRepository projects;
    @Autowired
    PasswordEncoder encoder;
    @Autowired
    LoginThrottle throttle;

    @BeforeEach
    void clean() {
        TestAccounts.clean(groups, projects, users);
        throttle.reset();
    }

    private ResultActions send(String url, String json, String address) throws Exception {
        return mvc.perform(post(url).with(csrf()).with(request -> {
            request.setRemoteAddr(address);
            return request;
        }).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions login(String email, String password, String address) throws Exception {
        return send("/api/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}", address);
    }

    private AppUser jan() {
        AppUser user = new AppUser("Jan", "Peeters", "jan@example.be", encoder.encode("geheim123"));
        user.setApproved(true);
        return users.save(user);
    }

    @Test
    void theAdministratorIsOnlyCreatedWithTheSetupKey() throws Exception {
        String admin = "{\"name\":\"J\",\"surname\":\"P\",\"password\":\"geheim123\",\"setupKey\":";
        send("/api/auth/setup", admin + "\"wrong\"}", "10.0.0.1").andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("auth.setupKeyWrong")));
        send("/api/auth/setup", "{\"name\":\"J\",\"surname\":\"P\",\"password\":\"geheim123\"}", "10.0.0.1").andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/status")).andExpect(jsonPath("$.setupRequired", is(true)));
        send("/api/auth/setup", admin + "\"test-setup-key\"}", "10.0.0.1").andExpect(status().isOk());
        send("/api/auth/setup", admin + "\"test-setup-key\"}", "10.0.0.1").andExpect(status().isConflict());
    }

    @Test
    void tooManyWrongPasswordsLockTheAccountUntilTheAdministratorUnlocksIt() throws Exception {
        AppUser user = jan();
        login("jan@example.be", "fout1234", "10.0.0.2").andExpect(status().isUnauthorized());
        login("jan@example.be", "fout1234", "10.0.0.3").andExpect(status().isUnauthorized());
        login("jan@example.be", "fout1234", "10.0.0.4").andExpect(status().isLocked())
                .andExpect(jsonPath("$.messageKey", is("auth.accountLocked"))).andExpect(jsonPath("$.detail", containsString("10")));
        // also the right password is refused now
        login("jan@example.be", "geheim123", "10.0.0.5").andExpect(status().isLocked());
        AppUser admin = TestAccounts.account(users, "Admin", true);
        mvc.perform(get("/api/admin/users").with(as(admin))).andExpect(jsonPath("$[?(@.email == 'jan@example.be')].lockedUntil", contains(notNullValue())));
        mvc.perform(post("/api/admin/users/" + user.getId() + "/unlock").with(as(user))).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/users/" + user.getId() + "/unlock").with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$.lockedUntil").value(nullValue()));
        login("jan@example.be", "geheim123", "10.0.0.5").andExpect(status().isOk());
    }

    @Test
    void aSuccessfulSignInForgetsTheWrongAttemptsBeforeIt() throws Exception {
        jan();
        login("jan@example.be", "fout1234", "10.0.0.6").andExpect(status().isUnauthorized());
        login("jan@example.be", "fout1234", "10.0.0.6").andExpect(status().isUnauthorized());
        login("jan@example.be", "geheim123", "10.0.0.6").andExpect(status().isOk());
        login("jan@example.be", "fout1234", "10.0.0.6").andExpect(status().isUnauthorized());
        login("jan@example.be", "fout1234", "10.0.0.6").andExpect(status().isUnauthorized());
        login("jan@example.be", "geheim123", "10.0.0.6").andExpect(status().isOk());
    }

    @Test
    void anUnknownAddressIsLockedTheSameWay_soTheAnswersDoNotTellWhichAccountsExist() throws Exception {
        login("niemand@example.be", "fout1234", "10.0.0.7").andExpect(status().isUnauthorized());
        login("niemand@example.be", "fout1234", "10.0.0.8").andExpect(status().isUnauthorized());
        login("niemand@example.be", "fout1234", "10.0.0.9").andExpect(status().isLocked());
        login("niemand@example.be", "fout1234", "10.0.0.10").andExpect(status().isLocked());
    }

    @Test
    void oneAddressGetsALimitedNumberOfAttempts() throws Exception {
        jan();
        for (int attempt = 0; attempt < 8; attempt++)
            login("iemand" + attempt + "@example.be", "fout1234", "192.0.2.1").andExpect(status().isUnauthorized());
        login("jan@example.be", "geheim123", "192.0.2.1").andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.messageKey", is("auth.tooManyAttempts")));
        send("/api/auth/register", "{\"name\":\"A\",\"surname\":\"B\",\"email\":\"a@example.be\",\"password\":\"geheim123\"}", "192.0.2.1")
                .andExpect(status().isTooManyRequests());
        // another address is not hindered
        login("jan@example.be", "geheim123", "192.0.2.2").andExpect(status().isOk());
    }
}
