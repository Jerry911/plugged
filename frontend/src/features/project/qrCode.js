// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The QR code itself (the link it holds is made in schemaLink.js). A file of its own: the QR code library is loaded with the QR code dialog,
// not with the first page.
import QRCode from 'qrcode'

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
