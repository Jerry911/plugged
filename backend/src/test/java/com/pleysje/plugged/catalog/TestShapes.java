// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Builds the drawing primitives of a symbol for the tests, in the JSON format of the frontend (the application itself reads them from the
 * catalog and from the editor, see {@link SymbolShapes}).
 */
public final class TestShapes {
    private TestShapes() {
    }

    /** a shape of this kind with its fields, given as name, value, name, value, ... */
    private static Map<String, Object> shape(String kind, Object... namesAndValues) {
        Map<String, Object> shape = new LinkedHashMap<>();
        shape.put("t", kind);
        for (int index = 0; index < namesAndValues.length; index += 2) shape.put((String) namesAndValues[index], namesAndValues[index + 1]);
        return shape;
    }

    public static Map<String, Object> line(double x1, double y1, double x2, double y2) {
        return shape("line", "x1", x1, "y1", y1, "x2", x2, "y2", y2);
    }

    public static Map<String, Object> circle(double centerX, double centerY, double radius) {
        return shape("circle", "cx", centerX, "cy", centerY, "r", radius);
    }

    public static Map<String, Object> dot(double centerX, double centerY, double radius) {
        return shape("circle", "cx", centerX, "cy", centerY, "r", radius, "f", 1);
    }

    public static Map<String, Object> rect(double x, double y, double width, double height) {
        return shape("rect", "x", x, "y", y, "w", width, "h", height);
    }

    public static Map<String, Object> text(double x, double y, String content) {
        return shape("text", "x", x, "y", y, "s", content);
    }

    public static Map<String, Object> text(double x, double y, String content, double fontSize) {
        return shape("text", "x", x, "y", y, "s", content, "fs", fontSize);
    }

    public static Map<String, Object> arc(double centerX, double centerY, double radius, double startAngle, double endAngle) {
        return shape("arc", "cx", centerX, "cy", centerY, "r", radius, "a1", startAngle, "a2", endAngle);
    }

    /** @param data SVG path data (M L H V C S Q T A Z, absolute or relative) */
    public static Map<String, Object> path(String data) {
        return shape("path", "d", data);
    }

    /** the shape filled in the colour of the drawing (a path is not filled unless it says so) */
    public static Map<String, Object> filled(Map<String, Object> shape) {
        shape.put("f", 1);
        return shape;
    }

    /** the shape filled in the colour of the paper: it hides the lines behind it */
    public static Map<String, Object> paper(Map<String, Object> shape) {
        shape.put("f", 2);
        return shape;
    }

    /** the shape drawn with a line weight relative to the one of the drawing */
    public static Map<String, Object> weight(Map<String, Object> shape, double weight) {
        shape.put("sw", weight);
        return shape;
    }

    public static Map<String, Object> bold(Map<String, Object> shape) {
        shape.put("b", 1);
        return shape;
    }
}
