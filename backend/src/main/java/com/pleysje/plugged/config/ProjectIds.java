// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.config;

import com.pleysje.plugged.entity.ProjectDoc;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Project numbers come from the sequence {@code project_doc_seq}. Databases of older versions chose the numbers themselves (max + 1), so
 * their projects already use numbers the new sequence would hand out again. At start-up, before the web server accepts requests, the sequence
 * is moved past the highest number in use. Costs one number per start.
 */
@Component
public class ProjectIds implements SmartInitializingSingleton {
    private static final Logger log = LoggerFactory.getLogger(ProjectIds.class);

    private final JdbcTemplate jdbc;

    public ProjectIds(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void afterSingletonsInstantiated() {
        Long highest = jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) FROM project_doc", Long.class);
        Long next = jdbc.queryForObject("SELECT NEXT VALUE FOR " + ProjectDoc.ID_SEQUENCE, Long.class);
        if (highest != null && next != null && next <= highest) {
            jdbc.execute("ALTER SEQUENCE " + ProjectDoc.ID_SEQUENCE + " RESTART WITH " + (highest + 1));
            log.info("Project numbers: the sequence continues after the highest number in use ({})", highest);
        }
    }
}
