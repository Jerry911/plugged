// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.entity.ProjectDoc;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest
class ProjectRepositoryTest {
    @Autowired
    ProjectRepository repository;

    @Test
    void saveFindOverwriteDelete() {
        repository.saveAndFlush(new ProjectDoc(1L, "{\"v\":1}"));
        assertEquals("{\"v\":1}", repository.findById(1L).orElseThrow().getJson());
        repository.saveAndFlush(new ProjectDoc(1L, "{\"v\":2}"));
        assertEquals(1, repository.count());
        assertEquals("{\"v\":2}", repository.findById(1L).orElseThrow().getJson());
        repository.deleteById(1L);
        assertTrue(repository.findById(1L).isEmpty());
    }

    @Test
    void storesLargeDocuments() {
        String big = "{\"x\":\"" + "a".repeat(500_000) + "\"}";
        repository.saveAndFlush(new ProjectDoc(2L, big));
        repository.flush();
        assertEquals(big.length(), repository.findById(2L).orElseThrow().getJson().length());
    }
}
