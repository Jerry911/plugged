// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

/**
 * What the project list shows: no project document, only its id, name and the moment it was last saved.
 */
public record ProjectSummary(Long id, String name, String updated) {
}
