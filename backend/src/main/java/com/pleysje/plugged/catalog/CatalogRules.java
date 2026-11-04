// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.service.SymbolService;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.web.server.ResponseStatusException;

/**
 * The rules a catalog of standard symbols must follow before it can ship (see StandardSymbols). StandardSymbolsTest checks the catalog in
 * the jar with them; Beheer → Symbolen checks the catalog it is about to download, so a problem shows before the build.
 */
public final class CatalogRules {
    /**
     * One problem: the symbol, the rule it breaks (the frontend shows the text catalog.problems.&lt;rule&gt;) and the details for that text.
     */
    public record Problem(String key, String rule, Map<String, Object> details) {
        @Override
        public String toString() {
            return key + ": " + rule + " " + details;
        }
    }

    private CatalogRules() {
    }

    public static List<Problem> problems(List<SymbolDto> catalog) {
        List<Problem> problems = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        for (SymbolDto symbol : catalog) {
            if (!keys.add(symbol.key())) problems.add(new Problem(symbol.key(), "duplicateKey", Map.of()));
            if (!SymbolService.isValidKey(symbol.key())) problems.add(new Problem(symbol.key(), "invalidKey", Map.of()));
        }
        for (SymbolDto symbol : catalog) {
            String key = symbol.key();
            if (symbol.name() == null || symbol.name().isBlank()) problems.add(new Problem(key, "noName", Map.of()));
            List<Map<String, Object>> shapes = symbol.shapes() == null ? List.of() : symbol.shapes();
            if (shapes.isEmpty()) problems.add(new Problem(key, "noShapes", Map.of()));
            for (Map<String, Object> shape : shapes) {
                org.springframework.context.MessageSourceResolvable problem = SymbolShapes.problem(shape);
                if (problem != null)
                    problems.add(new Problem(key, "invalidShape", Map.of("problem", problem.getCodes()[0] + " " + java.util.Arrays.toString(problem.getArguments()))));
            }
            for (String parent : symbol.parents() == null ? List.<String>of() : symbol.parents())
                if (!keys.contains(parent)) problems.add(new Problem(key, "unknownParent", Map.of("parent", parent)));
            if (symbol.parents() != null && symbol.parents().contains("kring") && shapes.stream().noneMatch(CatalogRules::touchesLine))
                problems.add(new Problem(key, "notOnLine", Map.of()));
            if (symbol.socket() != null) {
                long arches = shapes.stream().filter(shape -> "arc".equals(shape.get("t"))).count();
                long sockets = symbol.socket().get("n") instanceof Number number ? number.longValue() : 1;
                if (arches != sockets) problems.add(new Problem(key, "socketCount", Map.of("arches", arches, "sockets", sockets)));
            }
            if (problems.stream().noneMatch(problem -> problem.key().equals(key))) {
                try {
                    SymbolService.validate(key, symbol);
                } catch (ResponseStatusException exception) {
                    problems.add(new Problem(key, "invalid", Map.of("problem", String.valueOf(exception.getReason()))));
                }
            }
        }
        for (String key : StandardSymbols.ELEMENT_KEYS)
            if (!keys.contains(key)) problems.add(new Problem(key, "missingElement", Map.of()));
        return problems;
    }

    private static double number(Map<String, Object> shape, String field) {
        return shape.get(field) instanceof Number number ? number.doubleValue() : Double.NaN;
    }

    /** The eendraadschema chains the symbols along y = 12: a symbol in a circuit touches that line. A path is assumed to. */
    static boolean touchesLine(Map<String, Object> shape) {
        double[] range = switch (String.valueOf(shape.get("t"))) {
            case "line" -> new double[]{number(shape, "y1"), number(shape, "y2")};
            case "circle", "arc" -> new double[]{number(shape, "cy") - number(shape, "r"), number(shape, "cy") + number(shape, "r")};
            case "rect" -> new double[]{number(shape, "y"), number(shape, "y") + number(shape, "h")};
            case "path" -> new double[]{0, 24};
            default -> new double[]{1000, 1000};
        };
        return Math.min(range[0], range[1]) <= 12 && Math.max(range[0], range[1]) >= 12;
    }
}
