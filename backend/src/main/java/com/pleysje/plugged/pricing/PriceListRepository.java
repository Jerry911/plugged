// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.pricing;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** The price lists. */
public interface PriceListRepository extends JpaRepository<PriceListEntity, Long> {
    /** His own price lists and those shared with a group he is a member of. */
    @Query("select distinct p from PriceListEntity p left join p.groups g left join g.members m where p.ownerUserId = :userId or m.id = :userId order by p.name")
    List<PriceListEntity> visibleTo(@Param("userId") long userId);

    List<PriceListEntity> findByOwnerUserId(long ownerUserId);

    @Modifying
    @Transactional
    @Query(value = "delete from price_list_groups where group_id = :groupId", nativeQuery = true)
    int unshareGroup(@Param("groupId") long groupId);
}
