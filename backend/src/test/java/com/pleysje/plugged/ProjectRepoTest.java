// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
@DataJpaTest
class ProjectRepoTest {
  @Autowired ProjectRepo repo;
  @Test void saveFindOverwriteDelete(){
    repo.saveAndFlush(new ProjectDoc(1L,"{\"v\":1}"));
    assertEquals("{\"v\":1}",repo.findById(1L).orElseThrow().getJson());
    repo.saveAndFlush(new ProjectDoc(1L,"{\"v\":2}"));
    assertEquals(1,repo.count()); assertEquals("{\"v\":2}",repo.findById(1L).orElseThrow().getJson());
    repo.deleteById(1L); assertTrue(repo.findById(1L).isEmpty());
  }
  @Test void storesLargeDocuments(){
    String big="{\"x\":\""+"a".repeat(500_000)+"\"}";
    repo.saveAndFlush(new ProjectDoc(2L,big)); repo.flush();
    assertEquals(big.length(),repo.findById(2L).orElseThrow().getJson().length());
  }
}
