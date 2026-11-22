// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Plugged: draws electrical diagrams (eendraadschema and situatieschema) after the Belgian AREI. The REST API lives in the controller package,
 * the symbol catalog in catalog, the stored data in entity / repository; the React frontend is served from the static resources.
 */
@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
public class PluggedApplication {
    /** With --desktop: Plugged as a program on one computer (see DesktopLauncher), else the server. */
    public static void main(String[] arguments) throws Exception {
        if (java.util.Arrays.asList(arguments).contains(com.pleysje.plugged.desktop.DesktopLauncher.ARGUMENT)) {
            com.pleysje.plugged.desktop.DesktopLauncher.main(arguments);
            return;
        }
        SpringApplication.run(PluggedApplication.class, arguments);
    }
}
