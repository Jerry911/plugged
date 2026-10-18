// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
class ProjectDocTest {
  @Test void constructorAndAccessors(){ var d=new ProjectDoc(3L,"{}"); assertEquals(3L,d.getId()); assertEquals("{}",d.getJson()); d.setJson("{\"a\":1}"); assertEquals("{\"a\":1}",d.getJson()); }
  @Test void defaultConstructorIsEmpty(){ var d=new ProjectDoc(); assertNull(d.getId()); assertNull(d.getJson()); }
}
