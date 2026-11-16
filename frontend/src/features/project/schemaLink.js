// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The link a QR code on a circuit board holds: this application with ?schema=<project number>&key=<secret of the project's QR code>. The page
// that opens (SchemaPdfPage) sends the key to the server, loads the newest saved version of that project and builds the PDF from it, so the
// printed QR code never goes out of date.
import QRCode from 'qrcode'

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

/** The QR code of `text` as {size, path}: `size` modules per side, `path` one SVG path of all dark modules (1 unit per module). */
export const qrModules = (text) => {
    const {modules} = QRCode.create(text, {errorCorrectionLevel: 'M'}),
        size = modules.size
    let path = ''
    for (let row = 0; row < size; row++)
        for (let column = 0; column < size; column++) if (modules.get(row, column)) path += `M${column} ${row}h1v1h-1z`
    return {size, path}
}

export const QUIET_ZONE = 4 // modules of white around a QR code, the minimum of the standard

/** A standalone SVG file (black on white, with the quiet zone) of the QR code of `text`. */
export const qrSvgFile = (text) => {
    const {size, path} = qrModules(text),
        full = size + 2 * QUIET_ZONE
    return (
        `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" width="${full * 4}mm" height="${full * 4}mm" shape-rendering="crispEdges">` +
        `<rect width="${full}" height="${full}" fill="#fff"/><path transform="translate(${QUIET_ZONE} ${QUIET_ZONE})" d="${path}" fill="#000"/></svg>\n`
    )
}
