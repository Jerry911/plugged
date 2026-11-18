// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import com.pleysje.plugged.i18n.LocalizedStatusException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** The structure check of a stored project and the "is it still empty" test, also for the pages of the bedradingsschema (wire). */
class ProjectJsonTest {
    private static final String EMPTY_WIRING = "{\"id\":\"w1\",\"name\":\"Bedrading 1\",\"walls\":[],\"items\":[],\"wires\":[],\"boxes\":[]}";

    private static String project(String wiringPage) {
        return "{\"een\":[{\"id\":\"e1\",\"tree\":[]}],\"sit\":[{\"id\":\"s1\",\"walls\":[],\"items\":[]}],\"wire\":[" + wiringPage + "]}";
    }

    @Test
    void aProjectWithAnEmptyBedradingsschemaIsEmpty() {
        assertTrue(ProjectJson.isEmpty(ProjectJson.check(project(EMPTY_WIRING))));
    }

    @Test
    void aWireOrAFrameIsWork() {
        String wire = "{\"id\":\"w\",\"a\":{\"x\":1,\"y\":1},\"b\":{\"x\":5,\"y\":1},\"points\":[]}";
        assertFalse(ProjectJson.isEmpty(ProjectJson.check(project(EMPTY_WIRING.replace("\"wires\":[]", "\"wires\":[" + wire + "]")))));
        String box = "{\"id\":\"b\",\"x1\":1,\"y1\":1,\"x2\":5,\"y2\":5}";
        assertFalse(ProjectJson.isEmpty(ProjectJson.check(project(EMPTY_WIRING.replace("\"boxes\":[]", "\"boxes\":[" + box + "]")))));
    }

    @Test
    void thePagesOfTheBedradingsschemaMustHaveTheirLists() {
        assertThrows(LocalizedStatusException.class, () -> ProjectJson.check(project(EMPTY_WIRING.replace("\"wires\":[]", "\"wires\":{}"))));
        assertThrows(LocalizedStatusException.class, () -> ProjectJson.check(project(EMPTY_WIRING.replace("\"boxes\":[]", "\"boxes\":3"))));
        assertThrows(LocalizedStatusException.class, () -> ProjectJson.check("{\"wire\":{}}"));
        assertThrows(LocalizedStatusException.class, () -> ProjectJson.check("{\"wire\":[1]}"));
        // a project of before the bedradingsschema has none
        assertDoesNotThrow(() -> ProjectJson.check("{\"een\":[],\"sit\":[]}"));
    }
}
