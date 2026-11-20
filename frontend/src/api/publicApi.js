// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// What the page of a QR code needs (/api/public, GET only): it works without signing in.
import {apiFetch} from './http.js'

/** The header that carries the secret of the QR code (the server: PublicController#KEY_HEADER). */
const KEY_HEADER = 'X-Schema-Key'

/**
 * The newest saved document of project `id`, shown to whoever knows `key` (the secret of its QR code); null when there is no such project or
 * the key is wrong (the server does not tell which). Throws when the backend cannot be reached.
 */
export const fetchPublicSchema = async (id, key) => {
    const response = await apiFetch('/api/public/schemas/' + id, {headers: key ? {[KEY_HEADER]: key} : {}})
    if (response.status === 404) return null
    if (!response.ok) throw new Error('schema not available')
    return response.json()
}

/** The standard symbols the sheets are drawn with. Throws when they cannot be loaded. */
export const fetchPublicSymbols = async () => {
    const response = await apiFetch('/api/public/symbols')
    if (!response.ok) throw new Error('symbols not available')
    const symbols = await response.json()
    return Array.isArray(symbols) ? symbols : []
}
