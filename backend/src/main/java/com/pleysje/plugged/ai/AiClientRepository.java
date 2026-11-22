// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.ai;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** The assistants that registered themselves (OAuth dynamic client registration). */
public interface AiClientRepository extends JpaRepository<AiClient, Long> {
    Optional<AiClient> findByClientId(String clientId);
}
