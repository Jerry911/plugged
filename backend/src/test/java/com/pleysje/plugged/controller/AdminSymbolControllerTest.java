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

    /** The log lines of SymbolService while `seed` runs. */
    private List<String> seedLog() {
        List<String> lines = new java.util.concurrent.CopyOnWriteArrayList<>();
        ch.qos.logback.core.AppenderBase<ch.qos.logback.classic.spi.ILoggingEvent> appender = new ch.qos.logback.core.AppenderBase<>() {
            @Override
            protected void append(ch.qos.logback.classic.spi.ILoggingEvent event) {
                lines.add(event.getFormattedMessage());
            }
        };
        appender.start();
        ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(SymbolService.class);
        logger.addAppender(appender);
        try {
            service.seed();
        } finally {
            logger.detachAppender(appender);
        }
        return lines;
    }

    @Test
    void theStartSaysWhatHappenedToEveryStandardSymbol() throws Exception {
        // nothing to do
        assertEquals(List.of("Standard symbols: catalog catalog/standard-symbols.json has " + StandardSymbols.all().size()
                + " symbols; 0 added, 0 updated to the catalog, 0 removed (no longer in the catalog)"), seedLog());
        // an edited one, one with its own standard, a deleted one, one that left the catalog, one that is missing
        draw("motor", "Mijn motor", NEW_LAMP);
        draw("lichtpunt", "Lamp", NEW_LAMP);
        mvc.perform(post("/api/symbols/lichtpunt/standard").with(as(user))).andExpect(status().isOk());
        mvc.perform(delete("/api/symbols/tv").with(as(user))).andExpect(status().isNoContent());
        SymbolEntity gone = SymbolMapper.toEntity(new SymbolDto("weg", "Weg", "Overig", List.of(), true, List.of(Map.of("t", "rect", "x", 2.0, "y", 2.0, "w", 10.0, "h", 8.0)),
                null, StandardSymbols.VERSION, true, false, false));
        gone.setBuiltin(true);
        symbols.save(gone);
        symbols.deleteById("teller");
        List<String> lines = seedLog();
        assertTrue(lines.get(0).endsWith("1 added, 0 updated to the catalog, 1 removed (no longer in the catalog)"), lines.get(0));
        assertTrue(lines.contains("    removed: [weg]"), lines.toString());
        assertTrue(lines.stream().anyMatch(line -> line.startsWith("    kept, because a user edited them") && line.endsWith("[motor]")), lines.toString());
        assertTrue(lines.stream().anyMatch(line -> line.startsWith("    this installation keeps its own standard") && line.endsWith("[lichtpunt]")), lines.toString());
        assertTrue(lines.contains("    deleted by a user, not put back: [tv]"), lines.toString());
        assertEquals("Lamp", symbols.findById("lichtpunt").orElseThrow().getName());
    }

    @Test
    void theStartUpdatesAnOutdatedVersion() {
        SymbolEntity stored = symbols.findById("motor").orElseThrow();
        stored.setStandardVersion(StandardSymbols.VERSION - 1);
        symbols.save(stored);
        assertTrue(seedLog().contains("    updated to the catalog: [motor]"));
    }

    @Test
    void theDatabaseIsDescribedSoYouKnowWhichFileItIs() {
        String expected = java.nio.file.Path.of("data/plugged").toAbsolutePath().normalize() + ".mv.db";
        assertEquals("H2 file " + expected, com.pleysje.plugged.config.DatabaseLocationLogger.describe("jdbc:h2:file:./data/plugged;MODE=LEGACY"));
        assertEquals("jdbc:h2:mem:test", com.pleysje.plugged.config.DatabaseLocationLogger.describe("jdbc:h2:mem:test;DB_CLOSE_DELAY=-1"));
        assertEquals("(not configured)", com.pleysje.plugged.config.DatabaseLocationLogger.describe(""));
        assertEquals("(not configured)", com.pleysje.plugged.config.DatabaseLocationLogger.describe(null));
        new com.pleysje.plugged.config.DatabaseLocationLogger("jdbc:h2:mem:x").logLocation();
    }

    @Test
    void theDownloadOnlyRefersToStandardSymbols_aMissingSocketCountComesFromTheCatalog() throws Exception {
        // an own symbol under which the general socket may hang, made the standard
        mvc.perform(put("/api/symbols/custom:tweepolig").with(as(user)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"k\":\"custom:tweepolig\",\"name\":\"Tweepolig\",\"cat\":\"Eigen\",\"parents\":[\"kring\"],\"place\":true,\"shapes\":[" + NEW_LAMP + "]}"))
                .andExpect(status().isOk());
        SymbolDto general = StandardSymbols.find("stopcontact_alg");
        List<String> parents = new java.util.ArrayList<>(general.parents());
        parents.add("custom:tweepolig");
        SymbolEntity edited = SymbolMapper.toEntity(new SymbolDto(general.key(), general.name(), general.category(), parents, general.placeable(), general.shapes(),
                general.socket(), general.version(), true, true, general.details()));
        edited.setBuiltin(true);
        edited.setModified(true);
        edited.setStandardVersion(StandardSymbols.VERSION);
        symbols.save(edited);
        mvc.perform(post("/api/symbols/stopcontact_alg/standard").with(as(user))).andExpect(status().isOk());
        // a database from before the number of sockets was stored: the double socket does not know it has two
        SymbolEntity twice = symbols.findById("stopcontact2").orElseThrow();
        twice.setSocketCount(null);
        twice.setModified(true);
        symbols.save(twice);
        mvc.perform(post("/api/symbols/stopcontact2/standard").with(as(user))).andExpect(status().isOk());

        List<SymbolDto> catalog = download();
        SymbolDto socket = catalog.stream().filter(symbol -> symbol.key().equals("stopcontact_alg")).findFirst().orElseThrow();
        assertFalse(socket.parents().contains("custom:tweepolig"));
        assertEquals(general.parents(), socket.parents());
        SymbolDto doubleSocket = catalog.stream().filter(symbol -> symbol.key().equals("stopcontact2")).findFirst().orElseThrow();
        assertEquals(2, ((Number) doubleSocket.socket().get("n")).intValue());
        // the build would accept it
        mvc.perform(get("/api/admin/symbols/catalog/problems").with(as(admin))).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        assertEquals(List.of(), com.pleysje.plugged.catalog.CatalogRules.problems(StandardSymbols.asStandardsForTest(catalog)));
    }

    @Test
    void aStandardThatWouldStopTheBuildIsReportedBeforeTheDownload() throws Exception {
        // a lamp that no longer touches the line y = 12
        draw("lichtpunt", "Lamp", "{\"t\":\"circle\",\"cx\":12,\"cy\":4,\"r\":2}");
        mvc.perform(post("/api/symbols/lichtpunt/standard").with(as(user))).andExpect(status().isOk());
        mvc.perform(get("/api/admin/symbols/catalog/problems").with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].key", is("lichtpunt")))
                .andExpect(jsonPath("$[0].rule", is("notOnLine")));
        mvc.perform(get("/api/admin/symbols/catalog/problems").with(as(user))).andExpect(status().isForbidden());
    }
}
