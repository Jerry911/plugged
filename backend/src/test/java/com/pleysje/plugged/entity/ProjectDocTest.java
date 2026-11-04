// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ProjectDocTest {
    @Test
    void constructorAndAccessors() {
        var project = new ProjectDoc(3L, "{}");
        assertEquals(3L, project.getId());
        assertEquals("{}", project.getJson());
        project.setJson("{\"a\":1}");
        assertEquals("{\"a\":1}", project.getJson());
    }

    @Test
    void defaultConstructorIsEmpty() {
        var project = new ProjectDoc();
        assertNull(project.getId());
        assertNull(project.getJson());
    }
}
