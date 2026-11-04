// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

/** A stored project without its document (what the project list is built from). */
public record ProjectRow(Long id, String name, String updated, Long ownerId) {
}
