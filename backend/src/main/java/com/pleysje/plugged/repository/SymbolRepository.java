// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.entity.SymbolEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/** The symbol catalog, by symbol key. */
public interface SymbolRepository extends JpaRepository<SymbolEntity, String> {
}
