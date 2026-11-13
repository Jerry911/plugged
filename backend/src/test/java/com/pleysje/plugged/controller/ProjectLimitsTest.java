// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.TestAccounts;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.UserGroup;
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

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** The size of a request body, the number of projects of a user, students who cannot import, and the security headers. */
@SpringBootTest(properties = {"plugged.max-request-size=2KB", "plugged.max-projects-per-user=2"})
@AutoConfigureMockMvc
class ProjectLimitsTest {
    private static final String WORK = "{\"een\":[{\"tree\":[{\"type\":\"aansluiting\",\"children\":[{\"type\":\"kring\",\"children\":[]}]}]}]}";

    @Autowired
    MockMvc mvc;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    ProjectRepository projects;

    AppUser alice;

    @BeforeEach
    void clean() {
        TestAccounts.clean(groups, projects, users);
        alice = account(users, "Alice", false);
    }

    @Test
    void aBodyLargerThanTheLimitIsRefusedBeforeItIsRead() throws Exception {
        String big = "{\"x\":\"" + "a".repeat(3000) + "\"}";
        mvc.perform(post("/api/projects").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content(big))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.messageKey", is("request.tooLarge")));
        mvc.perform(post("/api/projects").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{\"x\":\"klein\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void aBodyWithoutLengthIsCountedWhileItIsRead() throws Exception {
        String big = "{\"x\":\"" + "a".repeat(3000) + "\"}";
        // a chunked body has no Content-Length (MockMvc always sends one): the filter itself, with such a request
        var filter = new com.pleysje.plugged.config.RequestSizeLimit.LimitFilter(2048);
        var request = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/projects") {
            @Override
            public long getContentLengthLong() {
                return -1;
            }
        };
        request.setContent(big.getBytes());
        var response = new org.springframework.mock.web.MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> {
            throw new AssertionError("a body that is too large must not get through");
        });
        org.junit.jupiter.api.Assertions.assertEquals(413, response.getStatus());
        var small = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/projects") {
            @Override
            public long getContentLengthLong() {
                return -1;
            }
        };
        small.setContent("{\"x\":1}".getBytes());
        boolean[] passed = {false};
        filter.doFilter(small, new org.springframework.mock.web.MockHttpServletResponse(), (req, res) -> {
            passed[0] = new String(req.getInputStream().readAllBytes()).equals("{\"x\":1}");
        });
        org.junit.jupiter.api.Assertions.assertTrue(passed[0]);
    }

    @Test
    void aUserOwnsAtMostTheConfiguredNumberOfProjects() throws Exception {
        for (int project = 0; project < 2; project++)
            mvc.perform(post("/api/projects").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isCreated());
        mvc.perform(post("/api/projects").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("project.quotaReached")));
    }

    @Test
    void aStudentCannotCreateAProjectWithContent() throws Exception {
        AppUser student = account(users, "Student", false);
        UserGroup klas = new UserGroup("Klas");
        klas.getMembers().add(student);
        klas.setEducational(true);
        groups.save(klas);
        mvc.perform(post("/api/projects").with(as(student)).contentType(MediaType.APPLICATION_JSON).content(WORK))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.messageKey", is("project.importNotAllowed")));
        mvc.perform(post("/api/projects").with(as(student)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"sit\":[{\"walls\":[{\"x1\":0}],\"items\":[]}]}")).andExpect(status().isForbidden());
        // an empty project (a connection and a board, no circuits) he creates, and then he works in it
        mvc.perform(post("/api/projects").with(as(student)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"een\":[{\"tree\":[{\"type\":\"aansluiting\",\"children\":[{\"type\":\"bord\"}]}]}],\"sit\":[{\"walls\":[],\"items\":[]}]}"))
                .andExpect(status().isCreated());
        // others are not restricted
        mvc.perform(post("/api/projects").with(as(alice)).contentType(MediaType.APPLICATION_JSON).content(WORK)).andExpect(status().isCreated());
    }

    @Test
    void everyAnswerCarriesTheSecurityHeaders() throws Exception {
        mvc.perform(get("/api/info")).andExpect(header().string("Content-Security-Policy", containsString("script-src 'self'")))
                .andExpect(header().string("Content-Security-Policy", containsString("frame-ancestors 'none'")))
                .andExpect(header().string("Referrer-Policy", "same-origin"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"));
    }
}
