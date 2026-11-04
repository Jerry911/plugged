// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.config;

import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Logs at start-up which database the application uses. A relative H2 file (the default ./data/plugged) depends on the folder the
 * application is started from: started from the IDE and from backend/ it opens two different databases.
 */
@Component
public class DatabaseLocationLogger {
    private static final Logger log = LoggerFactory.getLogger(DatabaseLocationLogger.class);
    private static final String H2_FILE = "jdbc:h2:file:";

    private final String url;

    public DatabaseLocationLogger(@Value("${spring.datasource.url:}") String url) {
        this.url = url;
    }

    /** The database as a person recognises it: the absolute file of an H2 file database, else the URL without its settings. */
    public static String describe(String url) {
        if (url == null || url.isBlank()) return "(not configured)";
        String withoutSettings = url.split(";", 2)[0];
        if (!withoutSettings.startsWith(H2_FILE)) return withoutSettings;
        return "H2 file " + Path.of(withoutSettings.substring(H2_FILE.length())).toAbsolutePath().normalize() + ".mv.db";
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logLocation() {
        log.info("Database: {}", describe(url));
    }
}
