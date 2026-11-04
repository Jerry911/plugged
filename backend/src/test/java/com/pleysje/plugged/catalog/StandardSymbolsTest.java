// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.service.SymbolService;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The rules the catalog file (backend/src/main/resources/catalog/standard-symbols.json) must follow. The file is made in the application
 * (Beheer → Symbolen); these tests stop a release with a catalog the editor cannot use.
 */
class StandardSymbolsTest {
    @Test
    void keysAreUniqueAndValid() {
        Set<String> keys = new HashSet<>();
        for (SymbolDto symbol : StandardSymbols.all()) {
            assertTrue(keys.add(symbol.key()), "duplicate key " + symbol.key());
            assertTrue(SymbolService.isValidKey(symbol.key()), "invalid key " + symbol.key());
            assertTrue(symbol.builtin());
            assertFalse(symbol.modified());
            assertEquals(StandardSymbols.VERSION, symbol.version());
        }
        assertSame(StandardSymbols.all().get(3), StandardSymbols.find(StandardSymbols.all().get(3).key()));
        assertNull(StandardSymbols.find("custom:x"));
        assertEquals(-1, StandardSymbols.orderOf("custom:x"));
        assertEquals(0, StandardSymbols.orderOf(StandardSymbols.all().get(0).key()));
    }

    /** The catalog in the jar follows every rule of CatalogRules (the ones Beheer → Symbolen checks before a download). */
    @Test
    void theShippedCatalogFollowsTheRules() {
        assertEquals(List.of(), CatalogRules.problems(StandardSymbols.all()));
    }

    @Test
    void everyRuleIsChecked() {
        List<Map<String, Object>> lamp = List.of(Map.of("t", "circle", "cx", 12.0, "cy", 12.0, "r", 5.0));
        List<SymbolDto> catalog = new java.util.ArrayList<>(StandardSymbols.all());
        catalog.add(new SymbolDto("teller", "Dubbel", "Overig", List.of(), true, lamp, null, 1, true, false, false));
        catalog.add(new SymbolDto("Bad Key", "X", "Overig", List.of(), true, lamp, null, 1, true, false, false));
        catalog.add(new SymbolDto("naamloos", " ", "Overig", List.of(), true, lamp, null, 1, true, false, false));
        catalog.add(new SymbolDto("leeg", "Leeg", "Overig", List.of(), true, List.of(), null, 1, true, false, false));
        catalog.add(new SymbolDto("vorm", "Vorm", "Overig", List.of(), true, List.of(Map.of("t", "circle", "cx", 12.0, "cy", 12.0, "r", -1.0)), null, 1, true, false, false));
        catalog.add(new SymbolDto("wees", "Wees", "Overig", List.of("custom:eigen"), true, lamp, null, 1, true, false, false));
        catalog.add(new SymbolDto("zwevend", "Zwevend", "Overig", List.of("kring"), true, List.of(Map.of("t", "line", "x1", 0.0, "y1", 2.0, "x2", 9.0, "y2", 2.0)), null, 1, true, false, false));
        catalog.add(new SymbolDto("dubbel", "Dubbel", "Stopcontacten", List.of("kring"), true,
                List.of(Map.of("t", "arc", "cx", 12.0, "cy", 12.0, "r", 5.0, "a1", 90.0, "a2", 270.0), Map.of("t", "arc", "cx", 16.0, "cy", 12.0, "r", 5.0, "a1", 90.0, "a2", 270.0)),
                Map.of("pe", true), 1, true, false, false));
        catalog.removeIf(symbol -> symbol.key().equals("relais"));
        List<String> found = CatalogRules.problems(catalog).stream().map(problem -> problem.key() + " " + problem.rule()).toList();
        assertTrue(found.containsAll(List.of("teller duplicateKey", "Bad Key invalidKey", "naamloos noName", "leeg noShapes", "vorm invalidShape",
                "wees unknownParent", "zwevend notOnLine", "dubbel socketCount", "relais missingElement")), found.toString());
        assertTrue(CatalogRules.problems(catalog).get(0).toString().contains("teller"));
        // a path and an unknown kind of shape
        assertTrue(CatalogRules.touchesLine(Map.of("t", "path", "d", "M0 0")));
        assertFalse(CatalogRules.touchesLine(Map.of("t", "text", "x", 1.0, "y", 12.0)));
    }

    @Test
    void everySymbolIsDrawnAndReferencesKnownParents() {
        Set<String> keys = new HashSet<>();
        StandardSymbols.all().forEach(symbol -> keys.add(symbol.key()));
        for (SymbolDto symbol : StandardSymbols.all()) {
            assertFalse(symbol.name() == null || symbol.name().isBlank(), symbol.key() + " has no name");
            assertFalse(symbol.shapes().isEmpty(), symbol.key() + " has no shapes");
            for (Map<String, Object> shape : symbol.shapes()) assertNull(SymbolShapes.problem(shape), symbol.key() + ": " + shape);
            for (String parent : symbol.parents()) assertTrue(keys.contains(parent), symbol.key() + " has an unknown parent " + parent);
            assertDoesNotThrow(() -> SymbolService.validate(symbol.key(), symbol), symbol.key());
        }
        for (String key : StandardSymbols.ELEMENT_KEYS) assertTrue(keys.contains(key), "unknown element key " + key);
    }

    /** The eendraadschema chains the symbols along y = 12: every symbol that is placed in a circuit touches that line. */
    @Test
    void symbolsInACircuitTouchTheLine() {
        for (SymbolDto symbol : StandardSymbols.all()) {
            if (!symbol.parents().contains("kring")) continue;
            assertTrue(symbol.shapes().stream().anyMatch(StandardSymbolsTest::touchesLine), symbol.key() + " does not touch the line y = 12");
        }
    }

    private static double number(Map<String, Object> shape, String field) {
        return ((Number) shape.get(field)).doubleValue();
    }

    private static boolean touchesLine(Map<String, Object> shape) {
        double[] range = switch ((String) shape.get("t")) {
            case "line" -> new double[]{number(shape, "y1"), number(shape, "y2")};
            case "circle", "arc" -> new double[]{number(shape, "cy") - number(shape, "r"), number(shape, "cy") + number(shape, "r")};
            case "rect" -> new double[]{number(shape, "y"), number(shape, "y") + number(shape, "h")};
            case "path" -> new double[]{0, 24}; // a path is not taken apart: assume it may cross the line
            default -> new double[]{1000, 1000};
        };
        return Math.min(range[0], range[1]) <= 12 && Math.max(range[0], range[1]) >= 12;
    }

    /** A socket symbol draws one arch per socket and says so in its properties. */
    @Test
    void socketsDrawAnArchPerSocket() {
        int sockets = 0;
        for (SymbolDto symbol : StandardSymbols.all()) {
            if (symbol.socket() == null) continue;
            sockets++;
            long arches = symbol.shapes().stream().filter(shape -> "arc".equals(shape.get("t"))).count();
            // one socket leaves the count out
            assertEquals(((Number) symbol.socket().getOrDefault("n", 1)).longValue(), arches, symbol.key());
        }
        assertTrue(sockets >= 6, "the sockets are in the catalog");
        assertEquals(Map.of("pe", true, "n", 3), StandardSymbols.find("stopcontact3").socket());
    }

    @Test
    void theFileFormatReadsBackTheSameSymbols() {
        List<SymbolDto> written = StandardSymbols.asStandards(CatalogJson.read(new ByteArrayInputStream(CatalogJson.write(StandardSymbols.all()).getBytes(StandardCharsets.UTF_8))));
        assertEquals(StandardSymbols.all(), written);
        // one symbol per line, without the fields that only mean something in a database
        String file = CatalogJson.write(StandardSymbols.all());
        assertEquals(StandardSymbols.all().size() + 2, file.lines().count());
        assertFalse(file.contains("\"builtin\""));
        assertFalse(file.contains("\"v\""));
        assertTrue(file.contains("\"details\":true"));
    }

    @Test
    void fieldsMissingFromTheFileGetDefaults() {
        List<SymbolDto> read = StandardSymbols.asStandards(CatalogJson.read(new ByteArrayInputStream(
                "[{\"k\":\"x\",\"name\":\"X\",\"cat\":\"Overig\",\"shapes\":[{\"t\":\"line\",\"x1\":1,\"y1\":12,\"x2\":5,\"y2\":12}]}]".getBytes(StandardCharsets.UTF_8))));
        assertEquals(1, read.size());
        assertEquals(List.of(), read.get(0).parents());
        assertTrue(read.get(0).placeable());
        assertFalse(read.get(0).details());
        assertEquals(List.of(), StandardSymbols.asStandards(List.of(new SymbolDto("y", "Y", "Overig", null, false, null, null, null, null, null, null))).get(0).shapes());
        assertEquals(List.of(), CatalogJson.read(new ByteArrayInputStream("null".getBytes(StandardCharsets.UTF_8))));
    }
}
