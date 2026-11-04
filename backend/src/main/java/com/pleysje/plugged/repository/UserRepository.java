// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.repository;

import com.pleysje.plugged.entity.AppUser;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** The user accounts. Email addresses are stored in lower case: look them up in lower case. */
public interface UserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByEmail(String email);

    boolean existsByEmail(String email);

    /** True once the administrator account has been created (the first start is over). */
    boolean existsByAdminTrue();

    /** The accounts waiting for approval first, then the others; within each group the oldest first. */
    List<AppUser> findAllByOrderByApprovedAscIdAsc();
}
