// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ProjectRepo extends JpaRepository<ProjectDoc, Long> {}
