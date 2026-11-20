// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.context.support.DefaultMessageSourceResolvable;

/**
 * Checks for the drawing primitives of a symbol: line, circle, rect (both optionally filled), arc
 * (degrees, clockwise on screen), path (SVG path data, optionally filled) and text. A shape is a map in the JSON format of the frontend.
 * Every shape may carry {@code sw} (line weight, relative to the weight of the drawing, default 1); {@code f} is 1 for filled in the
 * colour of the drawing and 2 for filled in the colour of the paper (it hides what lies behind it); text may be {@code b} (bold).
 */
public final class SymbolShapes {
    public static final List<String> KINDS = List.of("line", "circle", "rect", "arc", "text", "path");
    /** the largest coordinate, size or font size (in either direction) */
    public static final double LIMIT = 1000;
    /** the longest path data of one shape, and the only characters it may contain: commands, numbers and separators */
    public static final int PATH_MAX = 1200;
    public static final Pattern PATH_DATA = Pattern.compile("[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\\s-]+");
    public static final double WEIGHT_MAX = 10;
    /** the longest text of a text shape */
    public static final int TEXT_MAX = 60;

    private SymbolShapes() {
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

    /**
     * @return what is wrong with the shape, as a key of the message files (shape.*) with its arguments so that it can be written in the language
     *         of the request, or null when the shape is fine
     */
    public static MessageSourceResolvable problem(Map<String, Object> shape) {
        if (shape == null) return problemOf("shape.empty");
        Object kindValue = shape.get("t");
        if (!(kindValue instanceof String kind) || !KINDS.contains(kind)) return problemOf("shape.unknownKind", String.valueOf(kindValue));
        for (String field : numbers(kind)) {
            if (!(shape.get(field) instanceof Number number)) return problemOf("shape.missingNumber", kind, field);
            double value = number.doubleValue();
            if (Double.isNaN(value) || Double.isInfinite(value) || Math.abs(value) > LIMIT) return problemOf("shape.invalidNumber", kind, field);
        }
        if ((kind.equals("circle") || kind.equals("arc")) && numberOf(shape, "r") <= 0) return problemOf("shape.radius", kind);
        if (kind.equals("rect") && (numberOf(shape, "w") < 0 || numberOf(shape, "h") < 0)) return problemOf("shape.negativeSize");
        if (kind.equals("path") && !(shape.get("d") instanceof String data && !data.isBlank() && data.length() <= PATH_MAX && PATH_DATA.matcher(data).matches())) {
            return problemOf("shape.invalidPath");
        }
        Object weight = shape.get("sw");
        if (weight != null && !(weight instanceof Number number && number.doubleValue() > 0 && number.doubleValue() <= WEIGHT_MAX)) return problemOf("shape.invalidWeight", kind);
        if (kind.equals("text")) {
            if (!(shape.get("s") instanceof String content && !content.isEmpty() && content.length() <= TEXT_MAX)) return problemOf("shape.invalidText");
            Object fontSize = shape.get("fs");
            if (fontSize != null && !(fontSize instanceof Number number && number.doubleValue() > 0 && number.doubleValue() <= LIMIT)) return problemOf("shape.invalidFontSize");
        }
        return null;
    }

    private static double numberOf(Map<String, Object> shape, String field) {
        return ((Number) shape.get(field)).doubleValue();
    }

    private static MessageSourceResolvable problemOf(String messageKey, Object... arguments) {
        return new DefaultMessageSourceResolvable(new String[] {messageKey}, arguments);
    }
}
