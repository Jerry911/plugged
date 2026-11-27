// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The link a QR code on a circuit board holds: this application with ?schema=<project number>&key=<secret of the project's QR code>. The page
// that opens (SchemaPdfPage) sends the key to the server, loads the newest saved version of that project and builds the PDF from it, so the
// printed QR code never goes out of date.
export const SCHEMA_PARAM = 'schema'
export const KEY_PARAM = 'key'

/** The link to the PDF page of project `id` with its QR code `key`, on the address this application is served from (no other query or hash). */
export const schemaUrl = (id, key, location = window.location) => {
    const url = new URL(location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set(SCHEMA_PARAM, String(id))
    url.searchParams.set(KEY_PARAM, key)
    return url.toString()
}

/**
 * What a query string (?schema=42&key=...) asks for: {id, key}, or null when there is no project number (or it is not a positive whole
 * number). A missing or malformed key gives key '': the server then answers that there is no such schema.
 */
export const schemaRequestFromSearch = (search = window.location.search) => {
    const params = new URLSearchParams(search),
        id = params.get(SCHEMA_PARAM),
        key = params.get(KEY_PARAM) || ''
    if (!/^[1-9]\d{0,17}$/.test(id || '')) return null
    return {id: Number(id), key: /^[A-Za-z0-9_-]{16,128}$/.test(key) ? key : ''}
}
