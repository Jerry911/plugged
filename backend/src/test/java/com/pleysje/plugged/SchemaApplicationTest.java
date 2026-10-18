// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest
class SchemaApplicationTest {
    @Autowired
    ApplicationContext ctx;

    @Test
    void contextLoadsWithBeans() {
        assertNotNull(ctx.getBean(ProjectController.class));
        assertNotNull(ctx.getBean(ProjectRepo.class));
    }

    @Test
    void mainStartsApplication() {
        assertDoesNotThrow(() -> SchemaApplication.main(new String[]{"--spring.main.web-application-type=none", "--spring.datasource.url=jdbc:h2:mem:mainrun", "--spring.main.register-shutdown-hook=false"}));
    }
}
