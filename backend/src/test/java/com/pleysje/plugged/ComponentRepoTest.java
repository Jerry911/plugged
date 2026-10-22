// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest
class ComponentRepoTest {
    @Autowired
    ComponentRepo repo;

    @Test
    void saveFindOverwriteDelete() {
        repo.saveAndFlush(new ComponentDoc("oven", "{\"name\":\"Oven\"}"));
        assertEquals("{\"name\":\"Oven\"}", repo.findById("oven").orElseThrow().getJson());
        repo.saveAndFlush(new ComponentDoc("oven", "{\"name\":\"Oven 2\"}"));
        assertEquals(1, repo.count());
        assertEquals("{\"name\":\"Oven 2\"}", repo.findById("oven").orElseThrow().getJson());
        repo.deleteById("oven");
        assertTrue(repo.findById("oven").isEmpty());
    }

    @Test
    void settersAndKeysWithColon() {
        ComponentDoc d = new ComponentDoc();
        d.setComponentKey("custom:abc");
        d.setJson("{}");
        repo.saveAndFlush(d);
        assertEquals("custom:abc", repo.findById("custom:abc").orElseThrow().getComponentKey());
    }

    @Test
    void storesLargeDocuments() {
        String big = "{\"shapes\":\"" + "a".repeat(200_000) + "\"}";
        repo.saveAndFlush(new ComponentDoc("big", big));
        assertEquals(big.length(), repo.findById("big").orElseThrow().getJson().length());
    }
}
