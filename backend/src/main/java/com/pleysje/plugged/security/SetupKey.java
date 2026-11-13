// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * The secret key that is needed to create the administrator account on the first start. As long as there is no administrator, it is printed
 * in the log (the console) at every start, so only somebody who can read the log of the server can become the administrator, not whoever
 * happens to open the page first.
 * <p>
 * The key is new at every start, unless plugged.setup.key (env var PLUGGED_SETUP_KEY) is set: then that one is used (handy for automated
 * installations and the end-to-end tests). Once the administrator exists, the key is no longer used nor printed.
 */
@Component
public class SetupKey {
    private static final Logger log = LoggerFactory.getLogger(SetupKey.class);
    /** without 0/O and 1/I/L: easy to type over */
    private static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private static final int GROUPS = 4, GROUP_LENGTH = 4;

    private final String key;
    private final boolean configured;
    private final UserService userService;

    public SetupKey(@Value("${plugged.setup.key:}") String configuredKey, UserService userService) {
        this.configured = !configuredKey.isBlank();
        this.key = configured ? configuredKey.trim() : random();
        this.userService = userService;
    }

    private static String random() {
        SecureRandom random = new SecureRandom();
        StringBuilder out = new StringBuilder();
        for (int group = 0; group < GROUPS; group++) {
            if (group > 0) out.append('-');
            for (int index = 0; index < GROUP_LENGTH; index++) out.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return out.toString();
    }

    /** Printed when the application is ready, as long as the administrator still has to be created. */
    @EventListener(ApplicationReadyEvent.class)
    public void printWhenSetupIsRequired() {
        if (!userService.setupRequired()) return;
        if (configured) {
            log.warn("No administrator yet: create it in the browser with the setup key of plugged.setup.key (PLUGGED_SETUP_KEY)");
            return;
        }
        log.warn("""

                ************************************************************
                  No administrator yet. Open Plugged in the browser and
                  create the administrator account with this setup key:

                      {}

                  (a new key is made at every start until it is used)
                ************************************************************""", key);
    }

    /** True when {@code given} is the key (compared in constant time; spaces and case do not matter). */
    public boolean matches(String given) {
        if (given == null) return false;
        String clean = configured ? given.trim() : given.trim().toUpperCase(java.util.Locale.ROOT).replace(' ', '-');
        return MessageDigest.isEqual(clean.getBytes(StandardCharsets.UTF_8), key.getBytes(StandardCharsets.UTF_8));
    }
}
