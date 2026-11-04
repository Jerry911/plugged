// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;

/**
 * Puts the standard symbols in the database when the application starts, before the web server accepts requests: a new installation
 * (where inserting the catalog takes a few seconds) never serves an empty or half symbol library. An ApplicationRunner would run only
 * after the web server is already answering.
 */
@Component
public class SymbolSeeder implements SmartInitializingSingleton {
    private final SymbolService service;
    private final LegacySocketColumns legacySocketColumns;

    public SymbolSeeder(SymbolService service, LegacySocketColumns legacySocketColumns) {
        this.service = service;
        this.legacySocketColumns = legacySocketColumns;
    }

    @Override
    public void afterSingletonsInstantiated() {
        // first the socket values of an older database, so seeding compares the stored symbols as they really are
        legacySocketColumns.migrate();
        service.seed();
    }
}
