// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.dto.ProjectRow;
import com.pleysje.plugged.entity.ProjectDoc;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** The stored projects, by project number. The queries leave the (large) documents themselves alone. */
public interface ProjectRepository extends JpaRepository<ProjectDoc, Long> {
    /** Every project (for an administrator). */
    @Query("select new com.pleysje.plugged.dto.ProjectRow(p.id, p.name, p.updated, p.ownerId) from ProjectDoc p where p.deletedAt is null order by p.id")
    List<ProjectRow> rows();

    /** The projects in the trash: of everyone (ownerId null, for the primary administrator) or of one owner. */
    @Query("select new com.pleysje.plugged.dto.ProjectRow(p.id, p.name, p.deletedAt, p.ownerId) from ProjectDoc p where p.deletedAt is not null"
            + " and (:ownerId is null or p.ownerId = :ownerId) order by p.deletedAt desc")
    List<ProjectRow> trashOf(@Param("ownerId") Long ownerId);

    /** The numbers of the projects that went into the trash before this moment (ISO-8601), to be removed for good. */
    @Query("select p.id from ProjectDoc p where p.deletedAt is not null and p.deletedAt < :before")
    List<Long> trashedBefore(@Param("before") String before);

    /** The numbers of the projects of a user (in the trash or not). */
    @Query("select p.id from ProjectDoc p where p.ownerId = :ownerId")
    List<Long> idsOwnedBy(@Param("ownerId") long ownerId);

    /** The projects a user owns or that are shared with one of the user's groups. */
    @Query("select distinct new com.pleysje.plugged.dto.ProjectRow(p.id, p.name, p.updated, p.ownerId) from ProjectDoc p"
            + " left join p.groups g left join g.members m where p.deletedAt is null and (p.ownerId = :userId or m.id = :userId) order by p.id")
    List<ProjectRow> rowsVisibleTo(@Param("userId") long userId);

    /** [project id, group id, group name] of the groups these projects are shared with. */
    @Query("select p.id, g.id, g.name from ProjectDoc p join p.groups g where p.id in :ids order by g.name")
    List<Object[]> groupsOf(@Param("ids") Collection<Long> ids);

    /** How many projects a user owns, the trash included (for plugged.max-projects-per-user). */
    long countByOwnerId(Long ownerId);

    /** Projects saved before accounts existed get an owner. */
    @Modifying
    @Transactional
    @Query("update ProjectDoc p set p.ownerId = :ownerId where p.ownerId is null")
    int assignOwnerless(@Param("ownerId") long ownerId);

    /** The projects of a removed account go to another one. */
    @Modifying
    @Transactional
    @Query("update ProjectDoc p set p.ownerId = :to where p.ownerId = :from")
    int changeOwner(@Param("from") long from, @Param("to") long to);

    /** A removed group: no project is shared with it any more. */
    @Modifying
    @Transactional
    @Query(value = "delete from project_groups where group_id = :groupId", nativeQuery = true)
    int unshareGroup(@Param("groupId") long groupId);
}
