// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

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
        for (SymbolDto d : StandardSymbols.all()) {
            assertTrue(keys.add(d.k()), "duplicate key " + d.k());
            assertTrue(SymbolService.validKey(d.k()), "invalid key " + d.k());
            assertTrue(d.builtin());
            assertFalse(d.modified());
            assertEquals(StandardSymbols.VERSION, d.v());
        }
        assertSame(StandardSymbols.all().get(3), StandardSymbols.find(StandardSymbols.all().get(3).k()));
        assertNull(StandardSymbols.find("custom:x"));
        assertEquals(-1, StandardSymbols.orderOf("custom:x"));
        assertEquals(0, StandardSymbols.orderOf("aansluiting"));
    }

    @Test
    void everySymbolIsDrawnAndReferencesKnownParents() {
        Set<String> keys = new HashSet<>();
        StandardSymbols.all().forEach(d -> keys.add(d.k()));
        for (SymbolDto d : StandardSymbols.all()) {
            assertFalse(d.shapes().isEmpty(), d.k() + " has no shapes");
            for (Map<String, Object> s : d.shapes()) assertNull(SymbolShapes.problem(s), d.k() + ": " + s);
            for (String p : d.parents()) assertTrue(keys.contains(p), d.k() + " has an unknown parent " + p);
            assertDoesNotThrow(() -> SymbolService.validate(d.k(), d), d.k());
        }
        for (String k : StandardSymbols.ELEMENT_KEYS) assertTrue(keys.contains(k), "unknown element key " + k);
    }

    /** The eendraadschema chains the symbols along y = 12: every symbol that is placed in a circuit touches that line at its left. */
    @Test
    void symbolsInACircuitConnectOnTheLineFromTheLeft() {
        for (SymbolDto d : StandardSymbols.all()) {
            if (!d.parents().contains("kring")) continue;
            boolean touches = false;
            for (Map<String, Object> s : d.shapes()) touches |= touchesLine(s);
            assertTrue(touches, d.k() + " does not touch the line y = 12");
        }
    }

    private static boolean touchesLine(Map<String, Object> s) {
        double[] y = switch ((String) s.get("t")) {
            case "line" -> new double[]{(Double) s.get("y1"), (Double) s.get("y2")};
            case "circle", "arc" -> new double[]{(Double) s.get("cy") - (Double) s.get("r"), (Double) s.get("cy") + (Double) s.get("r")};
            case "rect" -> new double[]{(Double) s.get("y"), (Double) s.get("y") + (Double) s.get("h")};
            default -> new double[]{1000, 1000};
        };
        return Math.min(y[0], y[1]) <= 12 && Math.max(y[0], y[1]) >= 12;
    }

    @Test
    void socketsPointAwayFromTheSupplyAndStack() {
        List<Map<String, Object>> one = StandardSymbols.find("stopcontact").shapes();
        assertEquals(StandardSymbols.socket(true, false, false, 1), one);
        Map<String, Object> arc = one.stream().filter(s -> "arc".equals(s.get("t"))).findFirst().orElseThrow();
        // the supply (x = 1..4 on the line y = 12) meets the apex of an arch that opens to the right: the left half of a circle
        assertEquals(90.0, arc.get("a1"));
        assertEquals(270.0, arc.get("a2"));
        assertEquals(1, StandardSymbols.socket(true, false, false, 1).stream().filter(s -> "arc".equals(s.get("t"))).count());
        assertEquals(3, StandardSymbols.find("stopcontact3").shapes().stream().filter(s -> "arc".equals(s.get("t"))).count());
        assertEquals(Map.of("pe", true, "n", 3), StandardSymbols.find("stopcontact3").sock());
    }

    /** The symbols that have a counterpart in the online eendraadschema are drawn like it (see UpstreamSymbols). */
    @Test
    void symbolsOfTheEendraadschemaAreDrawnLikeIt() {
        assertNotSame(UpstreamSymbols.lichtpunt(), UpstreamSymbols.lichtpunt()); // every call hands out a fresh list
        assertEquals(UpstreamSymbols.lichtpunt(), StandardSymbols.find("lichtpunt").shapes());
        assertEquals(UpstreamSymbols.motor(), StandardSymbols.find("motor").shapes());
        // thick strokes, fills and the sine wave of the original come back as weights, paper fill and paths
        List<Map<String, Object>> motor = StandardSymbols.find("motor").shapes();
        assertTrue(motor.stream().anyMatch(s -> "text".equals(s.get("t")) && Integer.valueOf(1).equals(s.get("b"))));
        assertTrue(StandardSymbols.find("schakelaar").shapes().stream().anyMatch(s -> "circle".equals(s.get("t")) && Integer.valueOf(2).equals(s.get("f"))));
        assertTrue(StandardSymbols.find("omvormer").shapes().stream().anyMatch(s -> "path".equals(s.get("t"))));
        assertTrue(StandardSymbols.find("dimmer").shapes().stream().anyMatch(s -> "path".equals(s.get("t")) && Integer.valueOf(1).equals(s.get("f"))));
        // the arch of a socket is as heavy as in the original, and no socket sticks out of the grid however many are stacked
        assertEquals(UpstreamSymbols.W2, StandardSymbols.socket(true, false, false, 1).stream().filter(s -> "arc".equals(s.get("t"))).findFirst().orElseThrow().get("sw"));
        for (int n = 1; n <= 6; n++)
            for (Map<String, Object> s : StandardSymbols.socket(true, true, false, n))
                if ("arc".equals(s.get("t"))) assertTrue((Double) s.get("cx") <= 23.4, n + " sockets");
    }

    /** The frontend tests use the standard symbols as their library; keep that file in step with the catalog. */
    @Test
    void frontendFixtureMatchesTheCatalog() throws IOException {
        Path p = Path.of(StandardSymbolsJson.FIXTURE);
        assumeTrue(Files.isDirectory(p.getParent().getParent()), "no frontend next to the backend");
        assertTrue(Files.exists(p), "missing " + p + ": run StandardSymbolsJson");
        // compare the content, not the file's line endings (git autocrlf on Windows) or a missing final newline (editors)
        assertEquals(normalized(StandardSymbolsJson.json(StandardSymbols.all())), normalized(Files.readString(p, StandardCharsets.UTF_8)),
                p + " is out of date: run StandardSymbolsJson");
    }

    private static String normalized(String s) {
        return s.replace("\r\n", "\n").stripTrailing();
    }
}