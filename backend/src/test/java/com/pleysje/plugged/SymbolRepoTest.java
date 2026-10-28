// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
class SymbolRepoTest {
    @Autowired
    SymbolRepo repo;
    @Autowired
    EntityManager em;

    @Test
    void everyStandardSymbolSurvivesAStoreAndReload() {
        for (SymbolDto std : StandardSymbols.all()) {
            SymbolEntity e = SymbolMapper.toEntity(std);
            e.setBuiltin(true);
            e.setStdVersion(StandardSymbols.VERSION);
            repo.save(e);
        }
        em.flush();
        em.clear();
        assertEquals(StandardSymbols.all().size(), repo.count());
        for (SymbolDto std : StandardSymbols.all()) {
            SymbolDto back = SymbolMapper.toDto(repo.findById(std.k()).orElseThrow());
            assertEquals(std.name(), back.name());
            assertEquals(std.parents(), back.parents(), std.k());
            assertEquals(std.shapes(), back.shapes(), std.k());
            assertEquals(std.sock(), back.sock(), std.k());
            assertEquals(std.place(), back.place());
        }
    }

    @Test
    void seedingRemovesAStandardSymbolThatLeftTheCatalogUnlessTheUserChangedIt() {
        // the waterproof socket was a standard symbol of an older catalog: it is a property of the socket now
        SymbolEntity old = SymbolMapper.toEntity(new SymbolDto("stopcontact_h", "Waterdicht stopcontact", "Stopcontacten", List.of("kring"), true,
                List.of(SymbolShapes.line(1, 12, 5, 12)), null, 0, false, false, null));
        old.setBuiltin(true);
        SymbolEntity edited = SymbolMapper.toEntity(new SymbolDto("stopcontact_x", "Mijn stopcontact", "Stopcontacten", List.of("kring"), true,
                List.of(SymbolShapes.line(1, 12, 5, 12)), null, 0, false, false, null));
        edited.setBuiltin(true);
        edited.setModified(true);
        SymbolEntity mine = SymbolMapper.toEntity(new SymbolDto("custom:m", "Eigen", "Eigen", List.of("kring"), true,
                List.of(SymbolShapes.line(1, 12, 5, 12)), null, 0, false, false, null));
        repo.saveAll(List.of(old, edited, mine));
        em.flush();
        em.clear();
        new SymbolService(repo).seed();
        em.flush();
        em.clear();
        assertFalse(repo.existsById("stopcontact_h"));
        assertTrue(repo.existsById("stopcontact_x")); // changed by the user: stays
        assertTrue(repo.existsById("custom:m")); // a symbol of the user: stays
        assertTrue(repo.existsById("stopcontact")); // the catalog itself is seeded
    }

    @Test
    void replacingAShapeListReplacesTheRows() {
        SymbolEntity e = SymbolMapper.toEntity(new SymbolDto("custom:r", "R", null, List.of("kring", "bord"), true,
                List.of(SymbolShapes.rect(1, 1, 4, 4), SymbolShapes.dot(5, 5, 1), SymbolShapes.text(2, 2, "t", 6)), Map.of("n", 2), 0, false, false, null));
        repo.saveAndFlush(e);
        em.clear();
        SymbolEntity again = SymbolMapper.toEntity(new SymbolDto("custom:r", "R2", "Eigen", List.of("kring"), false, List.of(SymbolShapes.line(0, 0, 3, 3)), null, 0, false, false, null));
        repo.saveAndFlush(again);
        em.clear();
        SymbolDto back = SymbolMapper.toDto(repo.findById("custom:r").orElseThrow());
        assertEquals("R2", back.name());
        assertEquals(List.of("kring"), back.parents());
        assertEquals(1, back.shapes().size());
        assertFalse(back.place());
        assertNull(back.sock());
        assertEquals(1, repo.count());
    }

    @Test
    void sameDefinitionIgnoresFlagsButNotTheDrawing() {
        SymbolEntity a = SymbolMapper.toEntity(StandardSymbols.find("stopcontact")), b = SymbolMapper.toEntity(StandardSymbols.find("stopcontact"));
        b.setModified(true);
        b.setStdVersion(1);
        assertTrue(a.sameDefinition(b));
        b.getShapes().remove(0);
        assertFalse(a.sameDefinition(b));
    }
}
