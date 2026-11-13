// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import com.pleysje.plugged.i18n.LocalizedStatusException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The checks the server makes on a project document before it stores it. The frontend owns the format, so the server only makes sure that
 * what it hands to the other members of a group is a project the editor can open:
 * <ul>
 *   <li>it is valid JSON and a JSON object;</li>
 *   <li>the parts the editor reads have the right kind: {@code een}, {@code sit}, {@code custom} and {@code symbols} are lists (of objects),
 *       {@code footer} and {@code plan} objects, {@code tree} a list, {@code name} a text;</li>
 *   <li>every page of {@code een} has a {@code tree} list and every page of {@code sit} has {@code walls} and {@code items} lists, when they are given.</li>
 * </ul>
 * Older formats (one {@code tree} and one {@code plan} instead of pages) pass too: the editor converts them.
 */
public final class ProjectJson {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Map<String, Kind> TOP_LEVEL = Map.of(
            "een", Kind.LIST_OF_OBJECTS, "sit", Kind.LIST_OF_OBJECTS, "custom", Kind.LIST_OF_OBJECTS, "symbols", Kind.LIST_OF_OBJECTS,
            "footer", Kind.OBJECT, "plan", Kind.OBJECT, "tree", Kind.LIST, "name", Kind.TEXT);

    private enum Kind { OBJECT, LIST, LIST_OF_OBJECTS, TEXT }

    private ProjectJson() {
    }

    /** The document, parsed; @throws LocalizedStatusException 400 project.invalidJson / project.invalidStructure */
    public static JsonNode check(String json) {
        JsonNode document;
        try {
            document = JSON.readTree(json == null ? "" : json);
        } catch (JacksonException exception) {
            throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "project.invalidJson");
        }
        if (document == null || !document.isObject()) throw invalid("(document)");
        for (Map.Entry<String, Kind> part : TOP_LEVEL.entrySet()) {
            JsonNode value = document.get(part.getKey());
            if (value != null && !value.isNull() && !hasKind(value, part.getValue())) throw invalid(part.getKey());
        }
        checkPages(document.get("een"), "een", "tree");
        checkPages(document.get("sit"), "sit", "walls", "items");
        return document;
    }

    private static void checkPages(JsonNode pages, String part, String... lists) {
        if (pages == null || !pages.isArray()) return;
        for (int index = 0; index < pages.size(); index++)
            for (String list : lists) {
                JsonNode value = pages.get(index).get(list);
                if (value != null && !value.isArray()) throw invalid(part + "[" + index + "]." + list);
            }
    }

    private static boolean hasKind(JsonNode value, Kind kind) {
        return switch (kind) {
            case OBJECT -> value.isObject();
            case LIST -> value.isArray();
            case TEXT -> value.isString();
            case LIST_OF_OBJECTS -> {
                if (!value.isArray()) yield false;
                for (JsonNode element : value) if (!element.isObject()) yield false;
                yield true;
            }
        };
    }

    private static LocalizedStatusException invalid(String where) {
        return new LocalizedStatusException(HttpStatus.BAD_REQUEST, "project.invalidStructure", where);
    }

    /**
     * True when the document holds no work yet: no circuit ({@code "type": "kring"}) anywhere and nothing drawn on a plan (every
     * {@code walls} and {@code items} list is empty). The same test as isProjectEmpty of the frontend.
     */
    public static boolean isEmpty(JsonNode document) {
        return !hasWork(document);
    }

    private static boolean hasWork(JsonNode node) {
        if (node == null) return false;
        if (node.isObject()) {
            JsonNode type = node.get("type");
            if (type != null && type.isString() && "kring".equals(type.asString())) return true;
            for (String list : new String[] {"walls", "items"}) {
                JsonNode value = node.get(list);
                if (value != null && value.isArray() && !value.isEmpty()) return true;
            }
            for (JsonNode child : node.values()) if (hasWork(child)) return true;
        } else if (node.isArray()) {
            for (JsonNode child : node) if (hasWork(child)) return true;
        }
        return false;
    }
}
