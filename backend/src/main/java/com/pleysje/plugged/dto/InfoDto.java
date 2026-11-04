// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

/**
 * What this installation offers on the Info page: the PayPal donate link and the address the contact form writes to (the address of the
 * administrator, plugged.admin.email; empty = not offered).
 */
public record InfoDto(String donateUrl, String contactEmail) {
}
