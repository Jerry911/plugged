// Copyright 2026 Pleysier Jeroen
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
class SymbolControllerTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    SymbolRepo repo;
    @Autowired
    SymbolService service;

    private static final String BOX = "{\"t\":\"rect\",\"x\":2,\"y\":2,\"w\":10,\"h\":8}";

    @BeforeEach
    void reset() {
        repo.deleteAll();
        service.seed();
    }

    private static String symbol(String k, String name, String shapes) {
        return "{\"k\":\"" + k + "\",\"name\":\"" + name + "\",\"cat\":\"Eigen\",\"parents\":[\"kring\"],\"place\":true,\"shapes\":[" + shapes + "]}";
    }

    @Test
    void listHasTheStandardSymbolsInCatalogOrder() throws Exception {
        mvc.perform(get("/api/symbols")).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(StandardSymbols.all().size())))
                .andExpect(jsonPath("$[0].k").value("aansluiting"))
                .andExpect(jsonPath("$[0].builtin").value(true))
                .andExpect(jsonPath("$[0].modified").value(false))
                .andExpect(jsonPath("$[0].v").value(StandardSymbols.VERSION));
    }

    @Test
    void getReturnsTheSymbolWithItsShapesAndSocketSettings() throws Exception {
        mvc.perform(get("/api/symbols/stopcontact3")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Drievoudig stopcontact"))
                .andExpect(jsonPath("$.sock.n").value(3))
                .andExpect(jsonPath("$.sock.pe").value(true))
                .andExpect(jsonPath("$.shapes[0].t").value("line"))
                .andExpect(jsonPath("$.shapes[?(@.t=='arc')]", hasSize(3)));
        mvc.perform(get("/api/symbols/lichtpunt")).andExpect(jsonPath("$.sock").doesNotExist());
        mvc.perform(get("/api/symbols/nope")).andExpect(status().isNotFound());
    }

    @Test
    void templateGivesAFreshKeyAndTheDefaultParents() throws Exception {
        mvc.perform(get("/api/symbols/template")).andExpect(status().isOk())
                .andExpect(jsonPath("$.k", startsWith("custom:")))
                .andExpect(jsonPath("$.cat").value("Eigen"))
                .andExpect(jsonPath("$.parents", hasItems("kring", "stopcontact")))
                .andExpect(jsonPath("$.shapes", hasSize(0)));
    }

    @Test
    void createUpdateAndDeleteASymbolOfTheUser() throws Exception {
        mvc.perform(put("/api/symbols/custom:a1").contentType(MediaType.APPLICATION_JSON).content(symbol("custom:a1", "Mijn ding", BOX)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.builtin").value(false))
                .andExpect(jsonPath("$.modified").value(false))
                .andExpect(jsonPath("$.shapes[0].w").value(10.0));
        mvc.perform(get("/api/symbols")).andExpect(jsonPath("$[-1:].k").value("custom:a1"));
        mvc.perform(put("/api/symbols/custom:a1").contentType(MediaType.APPLICATION_JSON).content(symbol("custom:a1", "Ander", BOX)))
                .andExpect(jsonPath("$.name").value("Ander"));
        mvc.perform(get("/api/symbols")).andExpect(jsonPath("$", hasSize(StandardSymbols.all().size() + 1)));
        mvc.perform(delete("/api/symbols/custom:a1")).andExpect(status().isNoContent());
        mvc.perform(get("/api/symbols/custom:a1")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/symbols/custom:a1")).andExpect(status().isNotFound());
    }

    @Test
    void missingPartsGetDefaultsAndFilledShapesSurvive() throws Exception {
        mvc.perform(put("/api/symbols/custom:d").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Punt\",\"shapes\":[{\"t\":\"circle\",\"cx\":12,\"cy\":12,\"r\":2,\"f\":1},{\"t\":\"text\",\"x\":3,\"y\":4,\"s\":\"x\",\"fs\":6}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cat").value("Eigen"))
                .andExpect(jsonPath("$.place").value(true))
                .andExpect(jsonPath("$.parents", hasItem("kring")))
                .andExpect(jsonPath("$.shapes[0].f").value(1))
                .andExpect(jsonPath("$.shapes[1].fs").value(6.0));
    }

    @Test
    void editingAStandardSymbolMarksItModifiedAndRestoreBringsItBack() throws Exception {
        mvc.perform(put("/api/symbols/lichtpunt").contentType(MediaType.APPLICATION_JSON).content(symbol("lichtpunt", "Lamp", BOX)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.builtin").value(true))
                .andExpect(jsonPath("$.modified").value(true))
                .andExpect(jsonPath("$.name").value("Lamp"));
        mvc.perform(post("/api/symbols/lichtpunt/restore")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Lichtpunt"))
                .andExpect(jsonPath("$.modified").value(false))
                .andExpect(jsonPath("$.shapes", hasSize(StandardSymbols.find("lichtpunt").shapes().size())));
    }

    @Test
    void makingASymbolStandardChangesWhatRestoreGoesBackTo() throws Exception {
        mvc.perform(put("/api/symbols/lichtpunt").contentType(MediaType.APPLICATION_JSON).content(symbol("lichtpunt", "Lamp", BOX)))
                .andExpect(jsonPath("$.modified").value(true));
        mvc.perform(post("/api/symbols/lichtpunt/standard")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Lamp"))
                .andExpect(jsonPath("$.builtin").value(true))
                .andExpect(jsonPath("$.modified").value(false));
        mvc.perform(put("/api/symbols/lichtpunt").contentType(MediaType.APPLICATION_JSON).content(symbol("lichtpunt", "Nog een lamp", BOX)))
                .andExpect(jsonPath("$.modified").value(true));
        mvc.perform(post("/api/symbols/lichtpunt/restore")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Lamp"))
                .andExpect(jsonPath("$.modified").value(false));
        mvc.perform(post("/api/symbols/restore")).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(StandardSymbols.all().size())))
                .andExpect(jsonPath("$[?(@.k=='lichtpunt')].name").value("Lamp"));
        // the hidden row of the chosen standard is not part of the catalog and cannot be reached
        mvc.perform(get("/api/symbols/std:lichtpunt")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/symbols/std:lichtpunt")).andExpect(status().isNotFound());
    }

    @Test
    void onlyStandardSymbolsCanBecomeTheNewStandard() throws Exception {
        mvc.perform(put("/api/symbols/custom:s").contentType(MediaType.APPLICATION_JSON).content(symbol("custom:s", "S", BOX))).andExpect(status().isOk());
        mvc.perform(post("/api/symbols/custom:s/standard")).andExpect(status().isConflict());
        mvc.perform(post("/api/symbols/nope/standard")).andExpect(status().isNotFound());
    }

    @Test
    void savingTheStandardDrawingAgainIsNotAModification() throws Exception {
        String json = mvc.perform(get("/api/symbols/zekering")).andReturn().getResponse().getContentAsString();
        mvc.perform(put("/api/symbols/zekering").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk()).andExpect(jsonPath("$.modified").value(false));
    }

    @Test
    void restoreAllBringsBackEditedAndMissingStandardSymbolsButKeepsOwnOnes() throws Exception {
        mvc.perform(put("/api/symbols/custom:keep").contentType(MediaType.APPLICATION_JSON).content(symbol("custom:keep", "Blijft", BOX))).andExpect(status().isOk());
        mvc.perform(put("/api/symbols/tl").contentType(MediaType.APPLICATION_JSON).content(symbol("tl", "Buis", BOX))).andExpect(status().isOk());
        repo.deleteById("klok");
        mvc.perform(post("/api/symbols/restore")).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(StandardSymbols.all().size() + 1)))
                .andExpect(jsonPath("$[?(@.k=='tl')].name").value("TL-armatuur"))
                .andExpect(jsonPath("$[?(@.k=='klok')].name").value("Horloge"))
                .andExpect(jsonPath("$[?(@.k=='custom:keep')].name").value("Blijft"));
    }

    @Test
    void ownSymbolsCannotBeRestored() throws Exception {
        mvc.perform(put("/api/symbols/custom:z").contentType(MediaType.APPLICATION_JSON).content(symbol("custom:z", "Z", BOX))).andExpect(status().isOk());
        mvc.perform(post("/api/symbols/custom:z/restore")).andExpect(status().isConflict());
        mvc.perform(post("/api/symbols/nope/restore")).andExpect(status().isNotFound());
    }

    @Test
    void aDeletedStandardSymbolStaysAwayAfterSeedingUntilItIsRestored() throws Exception {
        mvc.perform(delete("/api/symbols/aansluiting")).andExpect(status().isNoContent());
        mvc.perform(get("/api/symbols/aansluiting")).andExpect(status().isNotFound());
        mvc.perform(get("/api/symbols")).andExpect(jsonPath("$", hasSize(StandardSymbols.all().size() - 1)))
                .andExpect(jsonPath("$[?(@.k=='aansluiting')]").isEmpty())
                .andExpect(jsonPath("$[?(@.k=='del:aansluiting')]").isEmpty());
        // the marker is not a symbol of its own
        mvc.perform(get("/api/symbols/del:aansluiting")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/symbols/del:aansluiting")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/symbols/aansluiting")).andExpect(status().isNotFound());
        // a restart (seeding) does not bring it back
        service.seed();
        mvc.perform(get("/api/symbols/aansluiting")).andExpect(status().isNotFound());
        // restoring one symbol brings it back, and so does restoring all
        mvc.perform(post("/api/symbols/aansluiting/restore")).andExpect(status().isOk());
        mvc.perform(get("/api/symbols/aansluiting")).andExpect(status().isOk());
        mvc.perform(delete("/api/symbols/stopcontact")).andExpect(status().isNoContent());
        mvc.perform(delete("/api/symbols/klok")).andExpect(status().isNoContent());
        mvc.perform(post("/api/symbols/restore")).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(StandardSymbols.all().size())))
                .andExpect(jsonPath("$[?(@.k=='stopcontact')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.k=='klok')]").isNotEmpty());
        service.seed();
        mvc.perform(get("/api/symbols")).andExpect(jsonPath("$", hasSize(StandardSymbols.all().size())));
    }

    @Test
    void invalidSymbolsAreRejected() throws Exception {
        String ok = symbol("custom:v", "V", BOX);
        mvc.perform(put("/api/symbols/custom:v").contentType(MediaType.APPLICATION_JSON).content(symbol("custom:v", " ", BOX))).andExpect(status().isBadRequest());
        mvc.perform(put("/api/symbols/custom:v").contentType(MediaType.APPLICATION_JSON).content(symbol("custom:v", "V", ""))).andExpect(status().isBadRequest());
        mvc.perform(put("/api/symbols/custom:v").contentType(MediaType.APPLICATION_JSON).content(symbol("custom:v", "V", "{\"t\":\"blob\"}"))).andExpect(status().isBadRequest());
        mvc.perform(put("/api/symbols/custom:v").contentType(MediaType.APPLICATION_JSON).content(symbol("custom:v", "V", "{\"t\":\"circle\",\"cx\":1,\"cy\":1,\"r\":0}"))).andExpect(status().isBadRequest());
        mvc.perform(put("/api/symbols/custom:other").contentType(MediaType.APPLICATION_JSON).content(ok)).andExpect(status().isBadRequest());
        mvc.perform(put("/api/symbols/template").contentType(MediaType.APPLICATION_JSON).content(symbol("template", "T", BOX))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/symbols")).andExpect(jsonPath("$", hasSize(StandardSymbols.all().size())));
    }
}