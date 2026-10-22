// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Puts the standard symbols in the database when the application starts. */
@Component
public class SymbolSeeder implements ApplicationRunner {
    private final SymbolService service;

    public SymbolSeeder(SymbolService service) {
        this.service = service;
    }

    @Override
    public void run(ApplicationArguments args) {
        service.seed();
    }
}
