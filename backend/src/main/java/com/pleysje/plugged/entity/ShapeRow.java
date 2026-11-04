// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import com.pleysje.plugged.catalog.SymbolShapes;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/** One drawing primitive of a symbol, stored as a row of the table symbol_shapes (columns that do not apply to the kind stay empty). */
@Embeddable
public class ShapeRow {
    @Column(name = "kind", nullable = false, length = 10)
    private String kind;
    private Double x1, y1, x2, y2, cx, cy, radius, x, y, width, height, a1, a2;
    @Column(name = "font_size")
    private Double fontSize;
    @Column(name = "content", length = 60)
    private String content;
    private Boolean filled;
    /** filled in the colour of the paper (f = 2) */
    private Boolean paper;
    /** line weight relative to the weight of the drawing (sw), empty is 1 */
    @Column(name = "stroke_weight")
    private Double strokeWeight;
    /** bold text (b) */
    private Boolean bold;
    /** SVG path data of a path */
    @Column(name = "path_data", length = SymbolShapes.PATH_MAX)
    private String pathData;

    public ShapeRow() {
    }

    /** @param shape a valid shape (see {@link SymbolShapes#problem(Map)}) */
    public static ShapeRow of(Map<String, Object> shape) {
        ShapeRow row = new ShapeRow();
        row.kind = (String) shape.get("t");
        switch (row.kind) {
            case "line" -> {
                row.x1 = number(shape, "x1");
                row.y1 = number(shape, "y1");
                row.x2 = number(shape, "x2");
                row.y2 = number(shape, "y2");
            }
            case "circle" -> {
                row.cx = number(shape, "cx");
                row.cy = number(shape, "cy");
                row.radius = number(shape, "r");
                row.setFill(shape.get("f"));
            }
            case "rect" -> {
                row.x = number(shape, "x");
                row.y = number(shape, "y");
                row.width = number(shape, "w");
                row.height = number(shape, "h");
                row.setFill(shape.get("f"));
            }
            case "arc" -> {
                row.cx = number(shape, "cx");
                row.cy = number(shape, "cy");
                row.radius = number(shape, "r");
                row.a1 = number(shape, "a1");
                row.a2 = number(shape, "a2");
            }
            case "path" -> {
                row.pathData = (String) shape.get("d");
                row.setFill(shape.get("f"));
            }
            default -> {
                row.x = number(shape, "x");
                row.y = number(shape, "y");
                row.content = (String) shape.get("s");
                row.fontSize = shape.get("fs") instanceof Number ? number(shape, "fs") : null;
                row.bold = flag(shape.get("b"));
            }
        }
        row.strokeWeight = shape.get("sw") instanceof Number ? number(shape, "sw") : null;
        return row;
    }

    /** f: 1 (or true) is filled in the colour of the drawing, 2 in the colour of the paper */
    private void setFill(Object fill) {
        boolean paperFill = fill instanceof Number number && number.doubleValue() == 2;
        filled = paperFill ? null : flag(fill);
        paper = paperFill ? Boolean.TRUE : null;
    }

    private void putFill(Map<String, Object> shape) {
        if (filled != null) shape.put("f", 1);
        else if (paper != null) shape.put("f", 2);
    }

    private static Double number(Map<String, Object> shape, String field) {
        return ((Number) shape.get(field)).doubleValue();
    }

    private static Boolean flag(Object value) {
        boolean set = value instanceof Number number ? number.doubleValue() != 0 : Boolean.TRUE.equals(value);
        return set ? Boolean.TRUE : null;
    }

    /** The shape in the JSON format of the frontend. */
    public Map<String, Object> toMap() {
        Map<String, Object> shape = new LinkedHashMap<>();
        shape.put("t", kind);
        switch (kind) {
            case "line" -> {
                shape.put("x1", x1);
                shape.put("y1", y1);
                shape.put("x2", x2);
                shape.put("y2", y2);
            }
            case "circle" -> {
                shape.put("cx", cx);
                shape.put("cy", cy);
                shape.put("r", radius);
                putFill(shape);
            }
            case "rect" -> {
                shape.put("x", x);
                shape.put("y", y);
                shape.put("w", width);
                shape.put("h", height);
                putFill(shape);
            }
            case "arc" -> {
                shape.put("cx", cx);
                shape.put("cy", cy);
                shape.put("r", radius);
                shape.put("a1", a1);
                shape.put("a2", a2);
            }
            case "path" -> {
                shape.put("d", pathData);
                putFill(shape);
            }
            default -> {
                shape.put("x", x);
                shape.put("y", y);
                shape.put("s", content);
                if (fontSize != null) shape.put("fs", fontSize);
                if (bold != null) shape.put("b", 1);
            }
        }
        if (strokeWeight != null) shape.put("sw", strokeWeight);
        return shape;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof ShapeRow row && toMap().equals(row.toMap());
    }

    @Override
    public int hashCode() {
        return Objects.hash(toMap());
    }
}
