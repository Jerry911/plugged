// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.dto.ProjectSummary;
import com.pleysje.plugged.entity.ProjectDoc;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** The stored projects, by project number. */
public interface ProjectRepository extends JpaRepository<ProjectDoc, Long> {
    /** The list of stored projects without reading the (large) documents themselves. */
    @Query("select new com.pleysje.plugged.dto.ProjectSummary(p.id, p.name, p.updated) from ProjectDoc p order by p.id")
    List<ProjectSummary> summaries();
}
