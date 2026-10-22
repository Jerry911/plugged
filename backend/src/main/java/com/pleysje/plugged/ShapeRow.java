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
                s.filled = flag(m.get("f"));
            }
            case "rect" -> {
                s.x = num(m, "x");
                s.y = num(m, "y");
                s.width = num(m, "w");
                s.height = num(m, "h");
                s.filled = flag(m.get("f"));
            }
            case "arc" -> {
                s.cx = num(m, "cx");
                s.cy = num(m, "cy");
                s.radius = num(m, "r");
                s.a1 = num(m, "a1");
                s.a2 = num(m, "a2");
            }
            default -> {
                s.x = num(m, "x");
                s.y = num(m, "y");
                s.content = (String) m.get("s");
                s.fontSize = m.get("fs") instanceof Number ? num(m, "fs") : null;
            }
        }
        return s;
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
                if (filled != null) m.put("f", 1);
            }
            case "rect" -> {
                m.put("x", x);
                m.put("y", y);
                m.put("w", width);
                m.put("h", height);
                if (filled != null) m.put("f", 1);
            }
            case "arc" -> {
                m.put("cx", cx);
                m.put("cy", cy);
                m.put("r", radius);
                m.put("a1", a1);
                m.put("a2", a2);
            }
            default -> {
                m.put("x", x);
                m.put("y", y);
                m.put("s", content);
                if (fontSize != null) m.put("fs", fontSize);
            }
        }
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
