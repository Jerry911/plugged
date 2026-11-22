// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.desktop;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Plugged as a program on one computer: one local account, the browser signed in by a one-time link, only local requests. */
@SpringBootTest(properties = {"plugged.desktop.enabled=true", "plugged.admin.email=lokaal@plugged.desktop"})
@AutoConfigureMockMvc
class DesktopModeTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    DesktopMode mode;

    @Test
    void theLocalAccountExistsAndTheStatusSaysDesktopWithoutAnAddress() throws Exception {
        mvc.perform(get("/api/auth/status")).andExpect(status().isOk())
                .andExpect(jsonPath("$.desktop").value(true)).andExpect(jsonPath("$.setupRequired").value(false))
                .andExpect(jsonPath("$.adminEmail").value("")).andExpect(jsonPath("$.user").value(nullValue()));
        assertTrue(mode.localAccount().isAdmin());
        mvc.perform(get("/api/info")).andExpect(jsonPath("$.contactEmail").value("")).andExpect(jsonPath("$.desktop").value(true));
    }

    @Test
    void theOneTimeLinkSignsTheBrowserInOnce() throws Exception {
        String token = mode.newToken();
        MockHttpSession session = (MockHttpSession) mvc.perform(get("/desktop/open").param("token", token))
                .andExpect(status().isSeeOther()).andExpect(header().string("Location", "/")).andReturn().getRequest().getSession();
        mvc.perform(get("/api/auth/status").session(session)).andExpect(jsonPath("$.user.admin").value(true));
        mvc.perform(get("/api/projects/summaries").session(session)).andExpect(status().isOk());
        // no QR codes on one computer: nobody could reach it to scan one
        mvc.perform(get("/api/projects/1/qr-key").session(session)).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/schemas/1")).andExpect(status().isNotFound());
        // used: a second browser with the same link is not signed in
        MockHttpSession other = (MockHttpSession) mvc.perform(get("/desktop/open").param("token", token)).andExpect(status().isSeeOther())
                .andReturn().getRequest().getSession();
        mvc.perform(get("/api/auth/status").session(other)).andExpect(jsonPath("$.user").value(nullValue()));
        mvc.perform(get("/desktop/open").param("token", "guessed")).andExpect(status().isSeeOther());
    }

    @Test
    void nobodyRegistersAndOnlyTheComputerItselfIsAnswered() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"A\",\"surname\":\"B\",\"email\":\"a@b.be\",\"password\":\"geheim1234\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/status").header("Host", "evil.example:47800")).andExpect(status().is(421));
        mvc.perform(get("/api/auth/status").header("Host", "localhost:47800")).andExpect(status().isOk());
        assertTrue(DesktopHostFilter.isLocal("[::1]:47800"));
        assertFalse(DesktopHostFilter.isLocal("127.0.0.1.evil.example"));
    }

    @Test
    void aSecondStartAsksTheRunningOneWithTheSecretOfTheInstanceFile(@TempDir Path folder) throws Exception {
        Path file = folder.resolve(DesktopLauncher.INSTANCE_FILE);
        mode.writeInstanceFile(file, 47800);
        String secret = Files.readAllLines(file).stream().filter(line -> line.startsWith("secret=")).findFirst().orElseThrow().substring(7);
        mvc.perform(post("/desktop/show").header(DesktopMode.INSTANCE_HEADER, "wrong")).andExpect(status().isForbidden());
        assertTrue(mode.isInstanceSecret(secret));
        // no running server behind that port in this test: the launcher then starts its own
        assertFalse(DesktopLauncher.askRunningInstance(folder));
        assertTrue(java.util.Arrays.asList(DesktopLauncher.withSettings(new String[] {"--desktop", "--x=1"}, 47801, folder))
                .containsAll(java.util.List.of("--x=1", "--server.port=47801")));
        assertFalse(java.util.Arrays.asList(DesktopLauncher.withSettings(new String[] {"--desktop"}, 47801, folder)).contains("--desktop"));
    }
}
