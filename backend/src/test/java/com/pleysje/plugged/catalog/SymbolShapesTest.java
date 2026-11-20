// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.catalog;

import com.pleysje.plugged.entity.ShapeRow;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SymbolShapesTest {
    private static Map<String, Object> shape(Object... namesAndValues) {
        Map<String, Object> shape = new LinkedHashMap<>();
        for (int index = 0; index < namesAndValues.length; index += 2) shape.put((String) namesAndValues[index], namesAndValues[index + 1]);
        return shape;
    }

    @Test
    void aPathMayOnlyContainPathData() {
        assertNull(SymbolShapes.problem(TestShapes.path("M0,0 C2,-5 8,-5 10,0 S18,5 20,0")));
        assertNull(SymbolShapes.problem(TestShapes.path("M1 1 L5 1 L5 5 Z")));
        assertNull(SymbolShapes.problem(TestShapes.path("M3 4 A5 5 0 0 1 8 9")));
        assertNull(SymbolShapes.problem(TestShapes.path("M1e-3 -2.5e2 L-3 4")));
        // markup, urls, quotes, entities and unknown commands never reach the page
        for (String bad : List.of("", "  ", "M0 0 <script>", "M0 0 url(#x)", "M0 0; alert(1)", "M0 0 \"onload=", "M0 0 L1 1'", "M0 0 &amp;", "M0 0 x1 y1", "N1 2"))
            assertNotNull(SymbolShapes.problem(TestShapes.path(bad)), bad);
        assertNotNull(SymbolShapes.problem(TestShapes.path("M0 0 " + "L1 1 ".repeat(300))), "too long");
        assertNotNull(SymbolShapes.problem(shape("t", "path")), "no data");
        assertNotNull(SymbolShapes.problem(shape("t", "path", "d", 5)), "data is not text");
    }

    @Test
    void aLineWeightIsPositiveAndBounded() {
        assertNull(SymbolShapes.problem(TestShapes.weight(TestShapes.line(0, 0, 1, 1), 1.5)));
        assertNull(SymbolShapes.problem(TestShapes.weight(TestShapes.circle(5, 5, 2), SymbolShapes.WEIGHT_MAX)));
        for (Object weight : new Object[]{0.0, -1.0, SymbolShapes.WEIGHT_MAX + 1, "2", Double.NaN})
            assertNotNull(SymbolShapes.problem(shape("t", "line", "x1", 0.0, "y1", 0.0, "x2", 1.0, "y2", 1.0, "sw", weight)), String.valueOf(weight));
    }

    @Test
    void theNewShapesSurviveAStorageRow() {
        for (Map<String, Object> shape : List.of(
                TestShapes.filled(TestShapes.path("M1 1 L5 1 L5 5 Z")),
                TestShapes.weight(TestShapes.path("M1 1 L5 5"), 2),
                TestShapes.paper(TestShapes.circle(1, 1, 1)),
                TestShapes.weight(TestShapes.paper(TestShapes.rect(0, 0, 2, 2)), 1.5),
                TestShapes.weight(TestShapes.arc(9, 12, 3, 90, 270), 1.5),
                TestShapes.bold(TestShapes.text(5, 5, "M", 4)))) {
            assertEquals(shape, ShapeRow.of(shape).toMap());
            assertEquals(List.copyOf(shape.keySet()), List.copyOf(ShapeRow.of(shape).toMap().keySet()));
        }
        assertFalse(ShapeRow.of(TestShapes.path("M0 0 L1 1")).toMap().containsKey("f"));
        assertEquals(1, ShapeRow.of(shape("t", "rect", "x", 1.0, "y", 1.0, "w", 1.0, "h", 1.0, "f", true)).toMap().get("f"), "the old boolean fill still means filled");
    }
}
