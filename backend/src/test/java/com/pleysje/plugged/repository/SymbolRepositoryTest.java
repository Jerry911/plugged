// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.catalog.StandardSymbols;
import com.pleysje.plugged.catalog.SymbolShapes;
import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.entity.SymbolEntity;
import com.pleysje.plugged.service.SymbolMapper;
import com.pleysje.plugged.service.SymbolService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(showSql = false) // no SQL on the console: the output of mvn install stays readable
class SymbolRepositoryTest {
    @Autowired
    SymbolRepository repository;
    @Autowired
    EntityManager entityManager;

    @Test
    void everyStandardSymbolSurvivesAStoreAndReload() {
        for (SymbolDto standard : StandardSymbols.all()) {
            SymbolEntity entity = SymbolMapper.toEntity(standard);
            entity.setBuiltin(true);
            entity.setStandardVersion(StandardSymbols.VERSION);
            repository.save(entity);
        }
        entityManager.flush();
        entityManager.clear();
        assertEquals(StandardSymbols.all().size(), repository.count());
        for (SymbolDto standard : StandardSymbols.all()) {
            SymbolDto back = SymbolMapper.toDto(repository.findById(standard.key()).orElseThrow());
            assertEquals(standard.name(), back.name());
            assertEquals(standard.parents(), back.parents(), standard.key());
            assertEquals(standard.shapes(), back.shapes(), standard.key());
            assertEquals(standard.socket(), back.socket(), standard.key());
            assertEquals(standard.placeable(), back.placeable());
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
        repository.saveAll(List.of(old, edited, mine));
        entityManager.flush();
        entityManager.clear();
        new SymbolService(repository, null, null, null).seed();
        entityManager.flush();
        entityManager.clear();
        assertFalse(repository.existsById("stopcontact_h"));
        assertTrue(repository.existsById("stopcontact_x")); // changed by the user: stays
        assertTrue(repository.existsById("custom:m")); // a symbol of the user: stays
        assertTrue(repository.existsById("stopcontact")); // the catalog itself is seeded
    }

    @Test
    void replacingAShapeListReplacesTheRows() {
        SymbolEntity entity = SymbolMapper.toEntity(new SymbolDto("custom:r", "R", null, List.of("kring", "bord"), true,
                List.of(SymbolShapes.rect(1, 1, 4, 4), SymbolShapes.dot(5, 5, 1), SymbolShapes.text(2, 2, "t", 6)), Map.of("n", 2), 0, false, false, null));
        repository.saveAndFlush(entity);
        entityManager.clear();
        SymbolEntity again = SymbolMapper.toEntity(new SymbolDto("custom:r", "R2", "Eigen", List.of("kring"), false, List.of(SymbolShapes.line(0, 0, 3, 3)), null, 0, false, false, null));
        repository.saveAndFlush(again);
        entityManager.clear();
        SymbolDto back = SymbolMapper.toDto(repository.findById("custom:r").orElseThrow());
        assertEquals("R2", back.name());
        assertEquals(List.of("kring"), back.parents());
        assertEquals(1, back.shapes().size());
        assertFalse(back.placeable());
        assertNull(back.socket());
        assertEquals(1, repository.count());
    }

    @Test
    void sameDefinitionIgnoresFlagsButNotTheDrawing() {
        SymbolEntity original = SymbolMapper.toEntity(StandardSymbols.find("stopcontact")), copy = SymbolMapper.toEntity(StandardSymbols.find("stopcontact"));
        copy.setModified(true);
        copy.setStandardVersion(1);
        assertTrue(original.sameDefinition(copy));
        copy.getShapes().remove(0);
        assertFalse(original.sameDefinition(copy));
    }
}
