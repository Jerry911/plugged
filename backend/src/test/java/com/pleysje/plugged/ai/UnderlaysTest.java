// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

/** The plan behind a page is not shown to an AI (get_project) and comes back from the stored project when it saves (save_project). */
class UnderlaysTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String IMAGE = "data:image/jpeg;base64,QUJD";

    private static JsonNode read(String json) {
        return JSON.readTree(json.replace('\'', '"'));
    }

    @Test
    void theImageIsLeftOutForTheAiAndPutBackWhenItSaves() {
        JsonNode stored = read("{'sit': [{'id': 'a', 'underlay': {'src': '" + IMAGE + "', 'x': 1, 'opacity': 0.5}}, {'id': 'b', 'items': []}]}");
        JsonNode shown = Underlays.strip(stored.deepCopy());
        assertEquals(Underlays.KEPT, shown.at("/sit/0/underlay/src").asString());
        assertEquals(1, shown.at("/sit/0/underlay/x").asInt());
        assertFalse(shown.toString().contains("base64"));

        // the AI moved the plan and kept the placeholder: the image comes back, its change stays
        JsonNode saved = read("{'sit': [{'id': 'a', 'underlay': {'src': '" + Underlays.KEPT + "', 'x': 9, 'opacity': 0.5}}, {'id': 'b', 'items': []}]}");
        Underlays.restore(saved, stored);
        assertEquals(IMAGE, saved.at("/sit/0/underlay/src").asString());
        assertEquals(9, saved.at("/sit/0/underlay/x").asInt());

        // the AI removed the plan: it stays removed
        JsonNode removed = read("{'sit': [{'id': 'a'}]}");
        Underlays.restore(removed, stored);
        assertTrue(removed.at("/sit/0/underlay").isMissingNode());

        // an underlay on a page the stored project does not know gets no image (nothing to take it from)
        JsonNode unknown = read("{'sit': [{'id': 'new', 'underlay': {'src': 'whatever', 'x': 1}}]}");
        Underlays.restore(unknown, stored);
        assertTrue(unknown.at("/sit/0/underlay/src").isMissingNode());
    }
}
