// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.service.SymbolService;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

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
        assertEquals(0, StandardSymbols.orderOf("teller"));
    }

    @Test
    void everySymbolIsDrawnAndReferencesKnownParents() {
        Set<String> keys = new HashSet<>();
        StandardSymbols.all().forEach(symbol -> keys.add(symbol.key()));
        for (SymbolDto symbol : StandardSymbols.all()) {
            assertFalse(symbol.shapes().isEmpty(), symbol.key() + " has no shapes");
            for (Map<String, Object> shape : symbol.shapes()) assertNull(SymbolShapes.problem(shape), symbol.key() + ": " + shape);
            for (String parent : symbol.parents()) assertTrue(keys.contains(parent), symbol.key() + " has an unknown parent " + parent);
            assertDoesNotThrow(() -> SymbolService.validate(symbol.key(), symbol), symbol.key());
        }
        for (String key : StandardSymbols.ELEMENT_KEYS) assertTrue(keys.contains(key), "unknown element key " + key);
    }

    /** The eendraadschema chains the symbols along y = 12: every symbol that is placed in a circuit touches that line at its left. */
    @Test
    void symbolsInACircuitConnectOnTheLineFromTheLeft() {
        for (SymbolDto symbol : StandardSymbols.all()) {
            if (!symbol.parents().contains("kring")) continue;
            boolean touches = false;
            for (Map<String, Object> shape : symbol.shapes()) touches |= touchesLine(shape);
            assertTrue(touches, symbol.key() + " does not touch the line y = 12");
        }
    }

    private static boolean touchesLine(Map<String, Object> shape) {
        double[] verticalRange = switch ((String) shape.get("t")) {
            case "line" -> new double[]{(Double) shape.get("y1"), (Double) shape.get("y2")};
            case "circle", "arc" -> new double[]{(Double) shape.get("cy") - (Double) shape.get("r"), (Double) shape.get("cy") + (Double) shape.get("r")};
            case "rect" -> new double[]{(Double) shape.get("y"), (Double) shape.get("y") + (Double) shape.get("h")};
            default -> new double[]{1000, 1000};
        };
        return Math.min(verticalRange[0], verticalRange[1]) <= 12 && Math.max(verticalRange[0], verticalRange[1]) >= 12;
    }

    @Test
    void socketsPointAwayFromTheSupplyAndStack() {
        List<Map<String, Object>> one = StandardSymbols.find("stopcontact").shapes();
        assertEquals(StandardSymbols.socket(true, false, false, 1), one);
        Map<String, Object> arc = one.stream().filter(shape -> "arc".equals(shape.get("t"))).findFirst().orElseThrow();
        // the supply (x = 1..4 on the line y = 12) meets the apex of an arch that opens to the right: the left half of a circle
        assertEquals(90.0, arc.get("a1"));
        assertEquals(270.0, arc.get("a2"));
        assertEquals(1, StandardSymbols.socket(true, false, false, 1).stream().filter(shape -> "arc".equals(shape.get("t"))).count());
        assertEquals(3, StandardSymbols.find("stopcontact3").shapes().stream().filter(shape -> "arc".equals(shape.get("t"))).count());
        assertEquals(Map.of("pe", true, "n", 3), StandardSymbols.find("stopcontact3").socket());
    }

    /** The symbols that have a counterpart in the online eendraadschema are drawn like it (see UpstreamSymbols). */
    @Test
    void symbolsOfTheEendraadschemaAreDrawnLikeIt() {
        assertNotSame(UpstreamSymbols.lichtpunt(), UpstreamSymbols.lichtpunt()); // every call hands out a fresh list
        assertEquals(UpstreamSymbols.lichtpunt(), StandardSymbols.find("lichtpunt").shapes());
        assertEquals(UpstreamSymbols.motor(), StandardSymbols.find("motor").shapes());
        // thick strokes, fills and the sine wave of the original come back as weights, paper fill and paths
        List<Map<String, Object>> motor = StandardSymbols.find("motor").shapes();
        assertTrue(motor.stream().anyMatch(shape -> "text".equals(shape.get("t")) && Integer.valueOf(1).equals(shape.get("b"))));
        assertTrue(StandardSymbols.find("schakelaar").shapes().stream().anyMatch(shape -> "circle".equals(shape.get("t")) && Integer.valueOf(2).equals(shape.get("f"))));
        assertTrue(StandardSymbols.find("omvormer").shapes().stream().anyMatch(shape -> "path".equals(shape.get("t"))));
        assertTrue(StandardSymbols.find("dimmer").shapes().stream().anyMatch(shape -> "path".equals(shape.get("t")) && Integer.valueOf(1).equals(shape.get("f"))));
        // the arch of a socket is as heavy as in the original, and no socket sticks out of the grid however many are stacked
        assertEquals(UpstreamSymbols.W2, StandardSymbols.socket(true, false, false, 1).stream().filter(shape -> "arc".equals(shape.get("t"))).findFirst().orElseThrow().get("sw"));
        for (int count = 1; count <= 6; count++)
            for (Map<String, Object> shape : StandardSymbols.socket(true, true, false, count))
                if ("arc".equals(shape.get("t"))) assertTrue((Double) shape.get("cx") <= 23.4, count + " sockets");
    }

    /** The frontend tests use the standard symbols as their library; keep that file in step with the catalog. */
    @Test
    void frontendFixtureMatchesTheCatalog() throws IOException {
        Path fixture = Path.of(StandardSymbolsJson.FIXTURE);
        assumeTrue(Files.isDirectory(fixture.getParent().getParent()), "no frontend next to the backend");
        assertTrue(Files.exists(fixture), "missing " + fixture + ": run StandardSymbolsJson");
        // compare the content, not the file's line endings (git autocrlf on Windows) or a missing final newline (editors)
        assertEquals(normalized(StandardSymbolsJson.json(StandardSymbols.all())), normalized(Files.readString(fixture, StandardCharsets.UTF_8)),
                fixture + " is out of date: run StandardSymbolsJson");
    }

    private static String normalized(String text) {
        return text.replace("\r\n", "\n").stripTrailing();
    }
}