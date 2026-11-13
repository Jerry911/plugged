// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.entity.SymbolEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

/** The symbol catalog, by symbol key. */
public interface SymbolRepository extends JpaRepository<SymbolEntity, String> {
    /**
     * Symbols of the users made before symbols had an owner go to this user (the primary administrator). Standard symbols and the hidden
     * rows ("std:" and "del:") have no owner.
     */
    @Modifying
    @Transactional
    @Query("update SymbolEntity s set s.ownerUserId = :userId where s.builtin = false and s.ownerUserId is null"
            + " and s.key not like 'std:%' and s.key not like 'del:%'")
    int assignOwnerless(@Param("userId") long userId);

    /** The personal symbols of a removed account go to another one. */
    @Modifying
    @Transactional
    @Query("update SymbolEntity s set s.ownerUserId = :to where s.ownerUserId = :from")
    int changeOwner(@Param("from") long from, @Param("to") long to);

    /** A removed group: no symbol is shared with it any more (the symbols stay with their owners). */
    @Modifying
    @Transactional
    @Query(value = "delete from symbol_groups where group_id = :groupId", nativeQuery = true)
    int unshareGroup(@Param("groupId") long groupId);

    /** Symbols of a test version that belonged to one group (see SymbolEntity#getLegacyOwnerGroupId). */
    List<SymbolEntity> findByLegacyOwnerGroupIdNotNull();
}
