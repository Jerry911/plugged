// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A value (a symbol key such as 'custom:ab12', a category such as 'Verlichting & bediening') as a part of an html id that needs no escaping
 * in a CSS selector: every character other than a letter, digit, '-' or '_' becomes '_'.
 */
export const toDomId = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, '_')
