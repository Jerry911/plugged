// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import java.util.HashMap;
import java.util.Map;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The plan behind a page of the situatieschema (page.underlay, an image of up to about a megabyte in the document) is no use to an AI and
 * would fill its context: get_project shows {@link #KEPT} instead of the image, and save_project puts the stored image back on the page with
 * the same id. A page whose underlay the AI removed stays without it.
 */
final class Underlays {
    static final String KEPT = "(the plan image, kept by Plugged)";

    private Underlays() {}

    /** The document with the image of every underlay replaced by {@link #KEPT} (changes and returns `document`). */
    static JsonNode strip(JsonNode document) {
        for (JsonNode page : document.path("sit"))
            if (page.path("underlay") instanceof ObjectNode underlay && underlay.has("src")) underlay.put("src", KEPT);
        return document;
    }

    /** Puts the stored images (of `stored`) back into the underlays of `document` that do not carry an image of their own. */
    static void restore(JsonNode document, JsonNode stored) {
        Map<String, JsonNode> images = new HashMap<>();
        for (JsonNode page : stored.path("sit")) {
            JsonNode source = page.path("underlay").path("src");
            if (page.path("id").isString() && source.isString()) images.put(page.path("id").asString(), source);
        }
        for (JsonNode page : document.path("sit")) {
            if (!(page.path("underlay") instanceof ObjectNode underlay)) continue;
            JsonNode source = underlay.path("src");
            if (source.isString() && source.asString().startsWith("data:image/")) continue;
            JsonNode image = images.get(page.path("id").asString(""));
            if (image != null) underlay.set("src", image);
            else underlay.remove("src");
        }
    }
}
