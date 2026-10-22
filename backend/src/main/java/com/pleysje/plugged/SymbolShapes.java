// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builders and checks for the drawing primitives of a symbol: line, circle, rect (both optionally filled), arc
 * (degrees, clockwise on screen) and text. A shape is a map in the JSON format of the frontend.
 */
public final class SymbolShapes {
    public static final List<String> KINDS = List.of("line", "circle", "rect", "arc", "text");
    public static final double LIMIT = 1000;

    private SymbolShapes() {
    }

    /** Rounds to two decimals, like the drawing code does. */
    public static double rd(double v) {
        return Math.round(v * 100) / 100.0;
    }

    private static Map<String, Object> shape(String t, Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("t", t);
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    public static Map<String, Object> line(double x1, double y1, double x2, double y2) {
        return shape("line", "x1", x1, "y1", y1, "x2", x2, "y2", y2);
    }

    public static Map<String, Object> circle(double cx, double cy, double r) {
        return shape("circle", "cx", cx, "cy", cy, "r", r);
    }

    public static Map<String, Object> dot(double cx, double cy, double r) {
        return shape("circle", "cx", cx, "cy", cy, "r", r, "f", 1);
    }

    public static Map<String, Object> rect(double x, double y, double w, double h) {
        return shape("rect", "x", x, "y", y, "w", w, "h", h);
    }

    public static Map<String, Object> block(double x, double y, double w, double h) {
        return shape("rect", "x", x, "y", y, "w", w, "h", h, "f", 1);
    }

    public static Map<String, Object> text(double x, double y, String s) {
        return shape("text", "x", x, "y", y, "s", s);
    }

    public static Map<String, Object> text(double x, double y, String s, double fs) {
        return shape("text", "x", x, "y", y, "s", s, "fs", fs);
    }

    public static Map<String, Object> arc(double cx, double cy, double r, double a1, double a2) {
        return shape("arc", "cx", cx, "cy", cy, "r", r, "a1", a1, "a2", a2);
    }

    /** The required numeric fields per kind of shape. */
    public static List<String> numbers(String kind) {
        return switch (kind) {
            case "line" -> List.of("x1", "y1", "x2", "y2");
            case "circle" -> List.of("cx", "cy", "r");
            case "rect" -> List.of("x", "y", "w", "h");
            case "arc" -> List.of("cx", "cy", "r", "a1", "a2");
            case "text" -> List.of("x", "y");
            default -> List.of();
        };
    }

    /** @return a description of what is wrong with the shape, or null when it is fine */
    public static String problem(Map<String, Object> m) {
        if (m == null) return "lege vorm";
        Object t = m.get("t");
        if (!(t instanceof String kind) || !KINDS.contains(kind)) return "onbekend soort vorm: " + t;
        for (String f : numbers(kind)) {
            if (!(m.get(f) instanceof Number n)) return kind + ": '" + f + "' ontbreekt";
            double d = n.doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d) || Math.abs(d) > LIMIT) return kind + ": '" + f + "' is geen geldig getal";
        }
        if ((kind.equals("circle") || kind.equals("arc")) && ((Number) m.get("r")).doubleValue() <= 0) return kind + ": straal moet groter zijn dan 0";
        if (kind.equals("rect") && (((Number) m.get("w")).doubleValue() < 0 || ((Number) m.get("h")).doubleValue() < 0)) return "rect: breedte en hoogte mogen niet negatief zijn";
        if (kind.equals("text")) {
            if (!(m.get("s") instanceof String s) || s.isEmpty() || s.length() > 60) return "text: tekst ontbreekt of is te lang";
            if (m.get("fs") != null && (!(m.get("fs") instanceof Number fs) || fs.doubleValue() <= 0 || fs.doubleValue() > LIMIT)) return "text: ongeldige lettergrootte";
        }
        return null;
    }
}
