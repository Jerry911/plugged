// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SetupKeyTest {
    @Test
    void aConfiguredKeyIsUsedAsItIs() {
        SetupKey key = new SetupKey(" geheime-Sleutel ", null);
        assertTrue(key.matches("geheime-Sleutel"));
        assertFalse(key.matches("GEHEIME-SLEUTEL"));
        assertFalse(key.matches(null));
        assertFalse(key.matches(""));
    }

    @Test
    void aRandomKeyIsNewEveryTimeAndForgivesCaseAndSpaces() throws Exception {
        SetupKey first = new SetupKey("", null), second = new SetupKey("", null);
        java.lang.reflect.Field field = SetupKey.class.getDeclaredField("key");
        field.setAccessible(true);
        String value = (String) field.get(first);
        assertTrue(value.matches("[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){3}"), value);
        assertTrue(first.matches(value));
        assertTrue(first.matches(" " + value.toLowerCase() + " "));
        assertTrue(first.matches(value.replace('-', ' ')));
        assertFalse(second.matches(value));
    }
}
