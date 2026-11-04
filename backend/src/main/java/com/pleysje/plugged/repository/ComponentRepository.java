// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.entity.ComponentDoc;
import org.springframework.data.jpa.repository.JpaRepository;

/** The legacy components (see {@link com.pleysje.plugged.controller.ComponentController}). */
public interface ComponentRepository extends JpaRepository<ComponentDoc, String> {
}
