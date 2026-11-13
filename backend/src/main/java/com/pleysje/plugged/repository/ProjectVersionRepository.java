// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.entity.ProjectVersion;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** The history of the projects. The list queries leave the documents alone. */
public interface ProjectVersionRepository extends JpaRepository<ProjectVersion, Long> {
    /** One version without its document: for the history list. */
    record Row(long version, String name, String savedAt, Long savedBy, int size) {
    }

    @Query("select new com.pleysje.plugged.repository.ProjectVersionRepository$Row(v.version, v.name, v.savedAt, v.savedBy, cast(length(v.json) as integer))"
            + " from ProjectVersion v where v.projectId = :projectId order by v.version desc")
    List<Row> rowsOf(@Param("projectId") long projectId);

    @Query("select v.id from ProjectVersion v where v.projectId = :projectId order by v.version desc")
    List<Long> idsNewestFirst(@Param("projectId") long projectId);

    Optional<ProjectVersion> findByProjectIdAndVersion(long projectId, long version);

    /** Who saved the newest version (for the others who have the project open). */
    Optional<ProjectVersion> findFirstByProjectIdOrderByVersionDesc(long projectId);

    @Modifying
    @Transactional
    @Query("delete from ProjectVersion v where v.projectId in :projectIds")
    int deleteByProjectIds(@Param("projectIds") Collection<Long> projectIds);
}
