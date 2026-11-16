// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.entity.ProjectDoc;
import com.pleysje.plugged.repository.ProjectRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// The page of a QR code works without an account: these requests carry no session at all.
@SpringBootTest
@AutoConfigureMockMvc
class PublicControllerTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    ProjectRepository repository;

    static final String KEY = "k3y-of-the-qr-code_0123456789abcdefghij";

    private long stored(String json) {
        ProjectDoc project = new ProjectDoc(json, "Woning");
        project.setPublicKey(KEY);
        return repository.save(project).getId();
    }

    @Test
    void anybodyWithTheKeyReadsTheNewestSavedVersionWithoutSigningIn() throws Exception {
        long id = stored("{\"footer\":{\"titel\":\"eerste\"},\"een\":[],\"sit\":[]}");
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", KEY)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(jsonPath("$.footer.titel").value("eerste"));
        ProjectDoc project = repository.findById(id).orElseThrow();
        project.setJson("{\"footer\":{\"titel\":\"tweede\"},\"een\":[],\"sit\":[]}");
        repository.save(project);
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", KEY)).andExpect(jsonPath("$.footer.titel").value("tweede"));
    }

    @Test
    void withoutTheKeyOrWithAWrongOneNothingIsGivenAway() throws Exception {
        long id = stored("{\"een\":[],\"sit\":[]}");
        mvc.perform(get("/api/public/schemas/" + id)).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", "")).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", KEY + "x")).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/schemas/" + id).param("key", KEY)).andExpect(status().isNotFound()); // only the header counts
        // the same answer as for a project that does not exist
        mvc.perform(get("/api/public/schemas/987654321").header("X-Schema-Key", KEY)).andExpect(status().isNotFound());
    }

    @Test
    void aProjectWithoutAQrCodeYetIsNeverPublic() throws Exception {
        long id = repository.save(new ProjectDoc("{\"een\":[],\"sit\":[]}", "Zonder")).getId();
        mvc.perform(get("/api/public/schemas/" + id)).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", "null")).andExpect(status().isNotFound());
    }

    @Test
    void aProjectInTheTrashIs404EvenWithTheKey() throws Exception {
        long id = stored("{\"een\":[],\"sit\":[]}");
        ProjectDoc project = repository.findById(id).orElseThrow();
        project.trash(1L);
        repository.save(project);
        mvc.perform(get("/api/public/schemas/" + id).header("X-Schema-Key", KEY)).andExpect(status().isNotFound());
    }

    @Test
    void theStandardSymbolsArePublicToo() throws Exception {
        mvc.perform(get("/api/public/symbols")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(greaterThan(0))))
                .andExpect(jsonPath("$[0].builtin").value(true));
    }

    @Test
    void theRestOfTheApiStillNeedsASignIn() throws Exception {
        mvc.perform(get("/api/projects/1")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/symbols")).andExpect(status().isUnauthorized());
        // public is for reading only
        mvc.perform(post("/api/public/schemas/1")).andExpect(status().is4xxClientError());
    }
}
