// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builders and checks for the drawing primitives of a symbol: line, circle, rect (both optionally filled), arc
 * (degrees, clockwise on screen), path (SVG path data, optionally filled) and text. A shape is a map in the JSON format of the frontend.
 * Every shape may carry {@code sw} (line weight, relative to the weight of the drawing, default 1); {@code f} is 1 for filled in the
 * colour of the drawing and 2 for filled in the colour of the paper (it hides what lies behind it); text may be {@code b} (bold).
 */
public final class SymbolShapes {
    public static final List<String> KINDS = List.of("line", "circle", "rect", "arc", "text", "path");
    public static final double LIMIT = 1000;
    /** the longest path data of one shape, and the only characters it may contain: commands, numbers and separators */
    public static final int PATH_MAX = 1200;
    public static final java.util.regex.Pattern PATH_DATA = java.util.regex.Pattern.compile("[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\\s-]+");
    public static final double WEIGHT_MAX = 10;

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

    /** @param d SVG path data (M L H V C S Q T A Z, absolute or relative) */
    public static Map<String, Object> path(String d) {
        return shape("path", "d", d);
    }

    /** the shape filled in the colour of the drawing (a path is not filled unless it says so) */
    public static Map<String, Object> filled(Map<String, Object> m) {
        m.put("f", 1);
        return m;
    }

    /** the shape filled in the colour of the paper: it hides the lines behind it */
    public static Map<String, Object> paper(Map<String, Object> m) {
        m.put("f", 2);
        return m;
    }

    /** the shape drawn with a line weight relative to the one of the drawing */
    public static Map<String, Object> weight(Map<String, Object> m, double w) {
        m.put("sw", w);
        return m;
    }

    public static Map<String, Object> bold(Map<String, Object> m) {
        m.put("b", 1);
        return m;
    }

    /** The required numeric fields per kind of shape. */
    public static List<String> numbers(String kind) {
        return switch (kind) {
            case "line" -> List.of("x1", "y1", "x2", "y2");
            case "circle" -> List.of("cx", "cy", "r");
            case "rect" -> List.of("x", "y", "w", "h");
            case "arc" -> List.of("cx", "cy", "r", "a1", "a2");
            case "text" -> List.of("x", "y");
            case "path" -> List.of();
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
        if (kind.equals("path")) {
            if (!(m.get("d") instanceof String d) || d.isBlank() || d.length() > PATH_MAX || !PATH_DATA.matcher(d).matches()) return "path: ongeldige padgegevens";
        }
        if (m.get("sw") != null && (!(m.get("sw") instanceof Number w) || !(w.doubleValue() > 0) || w.doubleValue() > WEIGHT_MAX)) return kind + ": ongeldige lijndikte";
        if (kind.equals("text")) {
            if (!(m.get("s") instanceof String s) || s.isEmpty() || s.length() > 60) return "text: tekst ontbreekt of is te lang";
            if (m.get("fs") != null && (!(m.get("fs") instanceof Number fs) || fs.doubleValue() <= 0 || fs.doubleValue() > LIMIT)) return "text: ongeldige lettergrootte";
        }
        return null;
    }
}
