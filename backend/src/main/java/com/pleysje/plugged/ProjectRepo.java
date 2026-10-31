// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ProjectRepo extends JpaRepository<ProjectDoc, Long> {
    /** The list of stored projects without reading the (large) documents themselves. */
    @Query("select new com.pleysje.plugged.ProjectSummary(p.id, p.name, p.updated) from ProjectDoc p order by p.id")
    List<ProjectSummary> summaries();
}
