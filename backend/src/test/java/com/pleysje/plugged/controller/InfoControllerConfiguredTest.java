// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"plugged.donate.paypal-url= https://www.paypal.com/donate/?hosted_button_id=ABC ", "plugged.admin.email= me@example.be "})
@AutoConfigureMockMvc
class InfoControllerConfiguredTest {
    @Autowired
    MockMvc mvc;

    @Test
    void showsTheTrimmedDonateLinkAndContactAddress() throws Exception {
        mvc.perform(get("/api/info")).andExpect(status().isOk())
                .andExpect(jsonPath("$.donateUrl", is("https://www.paypal.com/donate/?hosted_button_id=ABC")))
                .andExpect(jsonPath("$.contactEmail", is("me@example.be")));
    }
}
