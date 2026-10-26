// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

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

    /** @param m a valid shape (see {@link SymbolShapes#problem(Map)}) */
    public static ShapeRow of(Map<String, Object> m) {
        ShapeRow s = new ShapeRow();
        s.kind = (String) m.get("t");
        switch (s.kind) {
            case "line" -> {
                s.x1 = num(m, "x1");
                s.y1 = num(m, "y1");
                s.x2 = num(m, "x2");
                s.y2 = num(m, "y2");
            }
            case "circle" -> {
                s.cx = num(m, "cx");
                s.cy = num(m, "cy");
                s.radius = num(m, "r");
                s.fill(m.get("f"));
            }
            case "rect" -> {
                s.x = num(m, "x");
                s.y = num(m, "y");
                s.width = num(m, "w");
                s.height = num(m, "h");
                s.fill(m.get("f"));
            }
            case "arc" -> {
                s.cx = num(m, "cx");
                s.cy = num(m, "cy");
                s.radius = num(m, "r");
                s.a1 = num(m, "a1");
                s.a2 = num(m, "a2");
            }
            case "path" -> {
                s.pathData = (String) m.get("d");
                s.fill(m.get("f"));
            }
            default -> {
                s.x = num(m, "x");
                s.y = num(m, "y");
                s.content = (String) m.get("s");
                s.fontSize = m.get("fs") instanceof Number ? num(m, "fs") : null;
                s.bold = flag(m.get("b"));
            }
        }
        s.strokeWeight = m.get("sw") instanceof Number ? num(m, "sw") : null;
        return s;
    }

    /** f: 1 (or true) is filled in the colour of the drawing, 2 in the colour of the paper */
    private void fill(Object f) {
        boolean paperFill = f instanceof Number n && n.doubleValue() == 2;
        filled = paperFill ? null : flag(f);
        paper = paperFill ? Boolean.TRUE : null;
    }

    private void putFill(Map<String, Object> m) {
        if (filled != null) m.put("f", 1);
        else if (paper != null) m.put("f", 2);
    }

    private static Double num(Map<String, Object> m, String f) {
        return ((Number) m.get(f)).doubleValue();
    }

    private static Boolean flag(Object o) {
        boolean f = o instanceof Number n ? n.doubleValue() != 0 : Boolean.TRUE.equals(o);
        return f ? Boolean.TRUE : null;
    }

    /** The shape in the JSON format of the frontend. */
    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("t", kind);
        switch (kind) {
            case "line" -> {
                m.put("x1", x1);
                m.put("y1", y1);
                m.put("x2", x2);
                m.put("y2", y2);
            }
            case "circle" -> {
                m.put("cx", cx);
                m.put("cy", cy);
                m.put("r", radius);
                putFill(m);
            }
            case "rect" -> {
                m.put("x", x);
                m.put("y", y);
                m.put("w", width);
                m.put("h", height);
                putFill(m);
            }
            case "arc" -> {
                m.put("cx", cx);
                m.put("cy", cy);
                m.put("r", radius);
                m.put("a1", a1);
                m.put("a2", a2);
            }
            case "path" -> {
                m.put("d", pathData);
                putFill(m);
            }
            default -> {
                m.put("x", x);
                m.put("y", y);
                m.put("s", content);
                if (fontSize != null) m.put("fs", fontSize);
                if (bold != null) m.put("b", 1);
            }
        }
        if (strokeWeight != null) m.put("sw", strokeWeight);
        return m;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof ShapeRow s && toMap().equals(s.toMap());
    }

    @Override
    public int hashCode() {
        return Objects.hash(toMap());
    }
}
