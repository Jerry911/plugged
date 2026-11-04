// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.controller;

import com.pleysje.plugged.TestAccounts;
import com.pleysje.plugged.catalog.CatalogJson;
import com.pleysje.plugged.catalog.StandardSymbols;
import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.entity.SymbolEntity;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.SymbolRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import com.pleysje.plugged.service.SymbolMapper;
import com.pleysje.plugged.service.SymbolService;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static com.pleysje.plugged.TestAccounts.account;
import static com.pleysje.plugged.TestAccounts.as;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Beheer → Symbolen: the catalog of standard symbols as this installation has it, to ship with the next release. */
@SpringBootTest
@AutoConfigureMockMvc
class AdminSymbolControllerTest {
    private static final String NEW_LAMP = "{\"t\":\"circle\",\"cx\":12,\"cy\":12,\"r\":6}";

    @Autowired
    MockMvc mvc;
    @Autowired
    SymbolRepository symbols;
    @Autowired
    SymbolService service;
    @Autowired
    UserRepository users;
    @Autowired
    UserGroupRepository groups;
    @Autowired
    ProjectRepository projects;

    AppUser admin, user;

    @BeforeEach
    void reset() {
        symbols.deleteAll();
        service.seed();
        TestAccounts.clean(groups, projects, users);
        admin = account(users, "Admin", true);
        user = account(users, "Jan", false);
    }

    private void draw(String key, String name, String shapes) throws Exception {
        mvc.perform(put("/api/symbols/" + key).with(as(user)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"k\":\"" + key + "\",\"name\":\"" + name + "\",\"cat\":\"Verlichting & bediening\",\"parents\":[\"kring\"],\"place\":true,\"shapes\":[" + shapes + "]}"))
                .andExpect(status().isOk());
    }

    private List<SymbolDto> download() throws Exception {
        String file = mvc.perform(get("/api/admin/symbols/catalog").with(as(admin))).andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("filename=\"standard-symbols.json\"")))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return CatalogJson.read(new ByteArrayInputStream(file.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void onlyAnAdministratorDownloadsTheCatalog() throws Exception {
        mvc.perform(get("/api/admin/symbols/catalog").with(as(user))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/symbols/catalog/changes").with(as(user))).andExpect(status().isForbidden());
    }

    @Test
    void untouchedTheDownloadIsTheShippedCatalog() throws Exception {
        mvc.perform(get("/api/admin/symbols/catalog/changes").with(as(admin))).andExpect(jsonPath("$", hasSize(0)));
        String file = mvc.perform(get("/api/admin/symbols/catalog").with(as(admin))).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertEquals(CatalogJson.write(StandardSymbols.all()), file);
    }

    @Test
    void aDrawingMadeStandardGoesIntoTheCatalog_anEditAloneDoesNot() throws Exception {
        draw("lichtpunt", "Lamp", NEW_LAMP);
        mvc.perform(get("/api/admin/symbols/catalog/changes").with(as(admin))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(post("/api/symbols/lichtpunt/standard").with(as(user))).andExpect(status().isOk());
        // what the next release changes
        mvc.perform(get("/api/admin/symbols/catalog/changes").with(as(admin)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].k", is("lichtpunt")))
                .andExpect(jsonPath("$[0].name", is("Lamp")));
        // the download: every standard symbol in catalog order, the chosen drawing for this one
        List<SymbolDto> catalog = download();
        assertEquals(StandardSymbols.all().stream().map(SymbolDto::key).toList(), catalog.stream().map(SymbolDto::key).toList());
        SymbolDto lamp = catalog.stream().filter(symbol -> symbol.key().equals("lichtpunt")).findFirst().orElseThrow();
        assertEquals("Lamp", lamp.name());
        assertEquals(1, lamp.shapes().size());
        assertEquals("circle", lamp.shapes().get(0).get("t"));
        // a later edit that is not made the standard changes nothing, nor does deleting another standard symbol
        draw("lichtpunt", "Nog een lamp", NEW_LAMP);
        mvc.perform(delete("/api/symbols/motor").with(as(user))).andExpect(status().isNoContent());
        List<SymbolDto> again = download();
        assertEquals("Lamp", again.stream().filter(symbol -> symbol.key().equals("lichtpunt")).findFirst().orElseThrow().name());
        assertTrue(again.stream().anyMatch(symbol -> symbol.key().equals("motor")));
    }

    @Test
    void atTheStartAnUneditedCopyFollowsTheCatalog_anEditedOneStays() {
        // as if the catalog changed since these copies were stored, with the same VERSION
        SymbolEntity old = SymbolMapper.toEntity(new SymbolDto("lichtpunt", "Oud lichtpunt", "Verlichting & bediening", List.of("kring"), true,
                List.of(Map.of("t", "rect", "x", 2.0, "y", 2.0, "w", 10.0, "h", 8.0)), null, StandardSymbols.VERSION, true, false, false));
        old.setBuiltin(true);
        old.setStandardVersion(StandardSymbols.VERSION);
        symbols.save(old);
        SymbolEntity edited = SymbolMapper.toEntity(new SymbolDto("motor", "Mijn motor", "Toestellen", List.of("kring"), true,
                List.of(Map.of("t", "rect", "x", 2.0, "y", 2.0, "w", 10.0, "h", 8.0)), null, StandardSymbols.VERSION, true, true, false));
        edited.setBuiltin(true);
        edited.setModified(true);
        edited.setStandardVersion(StandardSymbols.VERSION);
        symbols.save(edited);
        service.seed();
        assertTrue(symbols.findById("lichtpunt").orElseThrow().sameDefinition(SymbolMapper.toEntity(StandardSymbols.find("lichtpunt"))));
        assertEquals("Mijn motor", symbols.findById("motor").orElseThrow().getName());
    }
}
