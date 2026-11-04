// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.i18n;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static com.pleysje.plugged.SignedInRequests.get;
import static com.pleysje.plugged.SignedInRequests.post;
import static com.pleysje.plugged.SignedInRequests.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** The error messages of the API are written in the language of the request: Dutch (also for any other language), French or English. */
@SpringBootTest
@AutoConfigureMockMvc
class LocalizedMessagesTest {
    static final String EN_NAME_REQUIRED = "Give the symbol a name";

    private static final String NAMELESS = "{\"k\":\"custom:i18n\",\"name\":\" \",\"shapes\":[{\"t\":\"line\",\"x1\":0,\"y1\":0,\"x2\":1,\"y2\":1}]}";
    private static final String BAD_CIRCLE = "{\"k\":\"custom:i18n\",\"name\":\"Cirkel\",\"shapes\":[{\"t\":\"circle\",\"cx\":1,\"cy\":1,\"r\":0}]}";

    @Autowired
    MockMvc mvc;

    @Test
    void anUnknownSymbolIsReportedInTheLanguageOfTheRequest() throws Exception {
        mvc.perform(get("/api/symbols/nope").header(HttpHeaders.ACCEPT_LANGUAGE, "nl"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("Symbool niet gevonden: nope"))
                .andExpect(jsonPath("$.messageKey").value("symbol.notFound"));
        mvc.perform(get("/api/symbols/nope").header(HttpHeaders.ACCEPT_LANGUAGE, "fr-BE,fr;q=0.9"))
                .andExpect(jsonPath("$.detail").value("Symbole introuvable : nope"));
        mvc.perform(get("/api/symbols/nope").header(HttpHeaders.ACCEPT_LANGUAGE, "en-GB"))
                .andExpect(jsonPath("$.detail").value("Symbol not found: nope"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"de-DE", ""})
    void anotherLanguageOrNoneGetsEnglish(String language) throws Exception {
        mvc.perform(put("/api/symbols/custom:i18n").header(HttpHeaders.ACCEPT_LANGUAGE, language).contentType(MediaType.APPLICATION_JSON).content(NAMELESS))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(EN_NAME_REQUIRED));
    }

    @Test
    void theProblemOfAShapeIsTranslatedToo() throws Exception {
        mvc.perform(put("/api/symbols/custom:i18n").header(HttpHeaders.ACCEPT_LANGUAGE, "nl").contentType(MediaType.APPLICATION_JSON).content(BAD_CIRCLE))
                .andExpect(jsonPath("$.detail").value("Ongeldige vorm: circle: straal moet groter zijn dan 0"));
        mvc.perform(put("/api/symbols/custom:i18n").header(HttpHeaders.ACCEPT_LANGUAGE, "en").contentType(MediaType.APPLICATION_JSON).content(BAD_CIRCLE))
                .andExpect(jsonPath("$.detail").value("Invalid shape: circle: the radius must be larger than 0"));
        mvc.perform(put("/api/symbols/custom:i18n").header(HttpHeaders.ACCEPT_LANGUAGE, "fr").contentType(MediaType.APPLICATION_JSON).content(BAD_CIRCLE))
                .andExpect(jsonPath("$.detail").value("Forme non valable : circle : le rayon doit être supérieur à 0"));
    }

    @Test
    void apostrophesAndConflictsComeThrough() throws Exception {
        mvc.perform(put("/api/symbols/custom:own").contentType(MediaType.APPLICATION_JSON)
                .content("{\"k\":\"custom:own\",\"name\":\"Eigen\",\"shapes\":[{\"t\":\"line\",\"x1\":0,\"y1\":0,\"x2\":1,\"y2\":1}]}")).andExpect(status().isOk());
        mvc.perform(post("/api/symbols/custom:own/restore").header(HttpHeaders.ACCEPT_LANGUAGE, "fr"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Un symbole personnel n'a pas de dessin standard : custom:own"));
        mvc.perform(post("/api/symbols/custom:own/standard").header(HttpHeaders.ACCEPT_LANGUAGE, "en"))
                .andExpect(jsonPath("$.detail").value("Only a standard symbol can become the new standard: custom:own"));
    }

    @Test
    void theExceptionKeepsItsKeyAndArguments() {
        LocalizedStatusException exception = new LocalizedStatusException(HttpStatus.BAD_REQUEST, "symbol.tooManyShapes", 500);
        assertEquals("symbol.tooManyShapes", exception.getMessageKey());
        assertEquals("symbol.tooManyShapes", exception.getCodes()[0]);
        assertEquals(500, exception.getArguments()[0]);
        assertEquals("symbol.tooManyShapes [500]", exception.getReason()); // the log stays the same in every language
        assertEquals("symbol.missing", new LocalizedStatusException(HttpStatus.BAD_REQUEST, "symbol.missing").getReason());
    }

    /** Every message exists in every language, with the same arguments. */
    @Test
    void theMessageFilesHaveTheSameKeysAndArguments() throws IOException {
        Properties dutch = load(""), french = load("_fr"), english = load("_en");
        assertFalse(dutch.isEmpty());
        for (Properties other : new Properties[] {french, english}) {
            assertEquals(dutch.stringPropertyNames(), other.stringPropertyNames());
            for (String key : dutch.stringPropertyNames()) {
                assertEquals(arguments(dutch.getProperty(key)), arguments(other.getProperty(key)), key);
            }
        }
    }

    private static Properties load(String suffix) throws IOException {
        Properties properties = new Properties();
        try (InputStream input = LocalizedMessagesTest.class.getResourceAsStream("/i18n/messages" + suffix + ".properties")) {
            properties.load(new java.io.InputStreamReader(input, StandardCharsets.UTF_8));
        }
        return properties;
    }

    private static String arguments(String message) {
        return message.replaceAll("[^{}0-9]|\\d(?![^{]*})", "").replaceAll("[^{}0-9]", "");
    }
}
