// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SymbolRepo extends JpaRepository<SymbolEntity, String> {
}
