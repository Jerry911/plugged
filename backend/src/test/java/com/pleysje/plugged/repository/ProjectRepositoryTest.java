// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.entity.ProjectDoc;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest(showSql = false) // no SQL on the console: the output of mvn install stays readable
class ProjectRepositoryTest {
    @Autowired
    ProjectRepository repository;

    @Test
    void saveFindOverwriteDelete() {
        long id = repository.saveAndFlush(new ProjectDoc("{\"v\":1}")).getId();
        ProjectDoc stored = repository.findById(id).orElseThrow();
        assertEquals("{\"v\":1}", stored.getJson());
        long version = stored.getVersion();
        stored.update("{\"v\":2}", null);
        repository.saveAndFlush(stored);
        assertEquals(1, repository.count());
        assertEquals("{\"v\":2}", repository.findById(id).orElseThrow().getJson());
        assertEquals(version + 1, repository.findById(id).orElseThrow().getVersion()); // every save is a new version
        repository.deleteById(id);
        assertTrue(repository.findById(id).isEmpty());
    }

    @Test
    void newProjectsGetDifferentNumbersFromTheDatabase() {
        long first = repository.saveAndFlush(new ProjectDoc("{}")).getId();
        long second = repository.saveAndFlush(new ProjectDoc("{}")).getId();
        assertTrue(second > first);
    }

    @Test
    void storesLargeDocuments() {
        String big = "{\"x\":\"" + "a".repeat(500_000) + "\"}";
        long id = repository.saveAndFlush(new ProjectDoc(big)).getId();
        assertEquals(big.length(), repository.findById(id).orElseThrow().getJson().length());
    }
}
