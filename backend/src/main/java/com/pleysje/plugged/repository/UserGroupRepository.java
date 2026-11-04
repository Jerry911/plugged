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

    /** A removed account is no member (nor owner) of any group any more. */
    @Modifying
    @Transactional
    @Query(value = "delete from group_members where user_id = :userId", nativeQuery = true)
    int removeMemberEverywhere(@Param("userId") long userId);

    @Modifying
    @Transactional
    @Query(value = "delete from group_owners where user_id = :userId", nativeQuery = true)
    int removeOwnerEverywhere(@Param("userId") long userId);

    /** The groups this user owns. */
    List<UserGroup> findByOwners_IdOrderByNameAsc(long userId);

    /** True when the user is a member, but no owner, of a group in educational mode: a student. */
    @Query("select count(g) > 0 from UserGroup g join g.members m where g.educational = true and m.id = :userId"
            + " and not exists (select o from UserGroup g2 join g2.owners o where g2 = g and o.id = :userId)")
    boolean isStudent(@Param("userId") long userId);
}
