// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import java.security.SecureRandom;

/** Temporary passwords an administrator passes on: 12 characters in three groups, easy to read out and type (no 0/O, 1/l/I). */
final class TemporaryPasswords {
    private static final String ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private TemporaryPasswords() {
    }

    static String next() {
        StringBuilder out = new StringBuilder();
        for (int index = 0; index < 12; index++) {
            if (index > 0 && index % 4 == 0) out.append('-');
            out.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return out.toString();
    }
}
