// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.entity.UserGroup;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** The groups of coworkers. */
public interface UserGroupRepository extends JpaRepository<UserGroup, Long> {
    List<UserGroup> findAllByOrderByNameAsc();

    /** The groups a user is a member of. */
    List<UserGroup> findByMembers_IdOrderByNameAsc(long userId);

    boolean existsByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndIdNot(String name, long id);

    /** A removed account is no member of any group any more. */
    @Modifying
    @Transactional
    @Query(value = "delete from group_members where user_id = :userId", nativeQuery = true)
    int removeMemberEverywhere(@Param("userId") long userId);
}
