// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.repository.ComponentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static com.pleysje.plugged.SignedInRequests.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ComponentControllerTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    ComponentRepository repository;

    @BeforeEach
    void clean() {
        repository.deleteAll();
    }

    private void putOne(String key, String json) throws Exception {
        mvc.perform(put("/api/components/" + key).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isNoContent());
    }

    @Test
    void startsEmpty() throws Exception {
        mvc.perform(get("/api/components")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void putThenListRoundTrips() throws Exception {
        putOne("oven", "{\"componentKey\":\"oven\",\"name\":\"Oven\"}");
        mvc.perform(get("/api/components")).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].componentKey", is("oven")))
                .andExpect(jsonPath("$[0].json", containsString("\"name\":\"Oven\"")));
    }

    @Test
    void putOverwritesAndKeysMayContainColon() throws Exception {
        putOne("custom:x1", "{\"v\":1}");
        putOne("custom:x1", "{\"v\":2}");
        mvc.perform(get("/api/components")).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].json", is("{\"v\":2}")));
    }

    @Test
    void bulkPutUpsertsMany() throws Exception {
        putOne("a", "{\"v\":0}");
        mvc.perform(put("/api/components").contentType(MediaType.APPLICATION_JSON)
                .content("[{\"componentKey\":\"a\",\"json\":\"{\\\"v\\\":1}\"},{\"componentKey\":\"b\",\"json\":\"{\\\"v\\\":2}\"}]")).andExpect(status().isNoContent());
        mvc.perform(get("/api/components")).andExpect(jsonPath("$", hasSize(2)));
        org.junit.jupiter.api.Assertions.assertEquals("{\"v\":1}", repository.findById("a").orElseThrow().getJson());
    }

    @Test
    void deleteRemovesAndUnknownIsOk() throws Exception {
        putOne("a", "{}");
        mvc.perform(delete("/api/components/a")).andExpect(status().isOk());
        mvc.perform(get("/api/components")).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(delete("/api/components/nope")).andExpect(status().isOk());
    }
}
