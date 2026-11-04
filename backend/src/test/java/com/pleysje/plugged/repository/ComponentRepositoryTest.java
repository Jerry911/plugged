// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.entity.ComponentDoc;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest
class ComponentRepositoryTest {
    @Autowired
    ComponentRepository repository;

    @Test
    void saveFindOverwriteDelete() {
        repository.saveAndFlush(new ComponentDoc("oven", "{\"name\":\"Oven\"}"));
        assertEquals("{\"name\":\"Oven\"}", repository.findById("oven").orElseThrow().getJson());
        repository.saveAndFlush(new ComponentDoc("oven", "{\"name\":\"Oven 2\"}"));
        assertEquals(1, repository.count());
        assertEquals("{\"name\":\"Oven 2\"}", repository.findById("oven").orElseThrow().getJson());
        repository.deleteById("oven");
        assertTrue(repository.findById("oven").isEmpty());
    }

    @Test
    void settersAndKeysWithColon() {
        ComponentDoc d = new ComponentDoc();
        d.setComponentKey("custom:abc");
        d.setJson("{}");
        repository.saveAndFlush(d);
        assertEquals("custom:abc", repository.findById("custom:abc").orElseThrow().getComponentKey());
    }

    @Test
    void storesLargeDocuments() {
        String big = "{\"shapes\":\"" + "a".repeat(200_000) + "\"}";
        repository.saveAndFlush(new ComponentDoc("big", big));
        assertEquals(big.length(), repository.findById("big").orElseThrow().getJson().length());
    }
}
