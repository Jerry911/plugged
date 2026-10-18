// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ProjectControllerTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    ProjectRepo repo;

    @BeforeEach
    void clean() {
        repo.deleteAll();
    }

    private void putProject(long id, String json) throws Exception {
        mvc.perform(put("/api/projects/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isNoContent());
    }

    @Test
    void unknownProjectIs404() throws Exception {
        mvc.perform(get("/api/projects/99")).andExpect(status().isNotFound());
    }

    @Test
    void putThenGetRoundTrips() throws Exception {
        putProject(1, "{\"een\":[{\"id\":\"e1\",\"name\":\"Blad 1\"}],\"footer\":{\"titel\":\"Test\"}}");
        mvc.perform(get("/api/projects/1")).andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.footer.titel", is("Test"))).andExpect(jsonPath("$.een[0].name", is("Blad 1")));
    }

    @Test
    void putOverwrites() throws Exception {
        putProject(1, "{\"v\":1}");
        putProject(1, "{\"v\":2}");
        mvc.perform(get("/api/projects/1")).andExpect(jsonPath("$.v", is(2)));
    }

    @Test
    void listReturnsIds() throws Exception {
        mvc.perform(get("/api/projects")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        putProject(5, "{}");
        putProject(7, "{}");
        mvc.perform(get("/api/projects")).andExpect(jsonPath("$", hasSize(2))).andExpect(jsonPath("$", containsInAnyOrder(5, 7)));
    }

    @Test
    void deleteRemovesProject() throws Exception {
        putProject(3, "{}");
        mvc.perform(delete("/api/projects/3")).andExpect(status().isOk());
        mvc.perform(get("/api/projects/3")).andExpect(status().isNotFound());
    }

    @Test
    void deleteOfUnknownIdReturnsOk() throws Exception {
        // JpaRepository.deleteById is a no-op for missing ids in Spring Data 3
        mvc.perform(delete("/api/projects/404")).andExpect(status().isOk());
    }

    @Test
    void largeProjectRoundTrips() throws Exception {
        String big = "{\"data\":\"" + "x".repeat(300_000) + "\"}";
        putProject(9, big);
        mvc.perform(get("/api/projects/9")).andExpect(status().isOk()).andExpect(jsonPath("$.data", hasLength(300_000)));
    }
}
