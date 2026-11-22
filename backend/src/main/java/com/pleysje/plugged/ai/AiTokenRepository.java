// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** The keys of the AI link (only their hashes). */
public interface AiTokenRepository extends JpaRepository<AiToken, Long> {
    Optional<AiToken> findByHash(String hash);

    List<AiToken> findByUserIdOrderByCreatedDesc(long userId);

    @Modifying
    @Query("delete from AiToken t where t.grant = :grant")
    int deleteByGrant(@Param("grant") String grant);

    @Modifying
    @Query("delete from AiToken t where t.userId = :userId")
    int deleteByUserId(@Param("userId") long userId);

    @Modifying
    @Query("delete from AiToken t where t.expires is not null and t.expires < :now")
    int deleteExpired(@Param("now") String now);
}
