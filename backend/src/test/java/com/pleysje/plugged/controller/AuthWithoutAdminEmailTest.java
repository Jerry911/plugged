// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.is;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Without plugged.admin.email (or with an invalid one) no administrator can be created. */
@SpringBootTest(properties = "plugged.admin.email=geen-adres")
@AutoConfigureMockMvc
class AuthWithoutAdminEmailTest {
    @Autowired
    MockMvc mvc;

    @Test
    void setupIsRefused() throws Exception {
        mvc.perform(get("/api/auth/status")).andExpect(jsonPath("$.setupRequired", is(true)));
        mvc.perform(post("/api/auth/setup").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"J\",\"surname\":\"P\",\"password\":\"geheim123\",\"setupKey\":\"test-setup-key\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.messageKey", is("auth.adminEmailMissing")));
    }
}
