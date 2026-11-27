// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The plan behind a page of the situatieschema (page.underlay): an existing plan (a PDF page or a picture, e.g. of the architect) to draw the
// electrical points on. {src: a JPEG as data URL, x, y, w, h: where it lies on the sheet (mm), opacity, print: shown when printed (default
// yes), name: the file it came from}. It is part of the project document, so it is made small in the browser (features/situation/
// underlayImage.js) and kept within limits: the project is saved as a whole, and the server takes at most 5 MB in one request.
import {TEMPLATE_AREA} from './planTemplates.js'

/** A file larger than this is not read at all (an architect's PDF of several pages is often a few MB). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024
/** The picture stored for one page: at most this many bytes (made smaller until it fits). */
export const MAX_IMAGE_BYTES = 800 * 1024
/** All the plans of one project together: at most this many bytes (the rest of the project has to fit in the 5 MB of a save too). */
export const MAX_PROJECT_IMAGE_BYTES = 3 * 1024 * 1024
/** The longest side of the stored picture in pixels: sharp enough on an A4 sheet, small enough to keep. */
export const MAX_PIXELS = 2400
export const DEFAULT_OPACITY = 0.5

/** The size in bytes of the picture of a data URL (base64: 4 characters for 3 bytes). */
export const imageBytes = (src) => {
    const data = String(src || '').split(',')[1] || ''
    return Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
}

/** The bytes of all the plans of a project, except the page with id `exceptPageId` (the one being replaced). */
export const projectImageBytes = (project, exceptPageId) =>
    (project.sit || []).filter((page) => page.id !== exceptPageId).reduce((sum, page) => sum + imageBytes(page.underlay?.src), 0)

/** A new plan of `width` x `height` pixels as large as fits in the drawing area of the sheet, centred in it. */
export const fittedUnderlay = (src, width, height, name) => {
    const factor = Math.min(TEMPLATE_AREA.w / width, TEMPLATE_AREA.h / height),
        w = round(width * factor),
        h = round(height * factor)
    return {src, x: round(TEMPLATE_AREA.x + (TEMPLATE_AREA.w - w) / 2), y: round(TEMPLATE_AREA.y + (TEMPLATE_AREA.h - h) / 2), w, h, opacity: DEFAULT_OPACITY, name}
}

/**
 * The plan scaled so that the two points `from` and `to` (sheet mm, clicked on it) lie `metres` apart at the scale of the project: it grows or
 * shrinks around `from`, which stays where it is. Unchanged when the points are (nearly) the same.
 */
export const calibratedUnderlay = (underlay, from, to, metres, scale) => {
    const clicked = Math.hypot(to.x - from.x, to.y - from.y),
        wanted = (metres * 1000) / scale
    if (clicked < 0.5 || !(wanted > 0)) return underlay
    const factor = wanted / clicked
    return {
        ...underlay,
        x: round(from.x + (underlay.x - from.x) * factor),
        y: round(from.y + (underlay.y - from.y) * factor),
        w: round(underlay.w * factor),
        h: round(underlay.h * factor),
    }
}

/** The plan moved `dx`, `dy` mm. */
export const movedUnderlay = (underlay, dx, dy) => ({...underlay, x: round(underlay.x + dx), y: round(underlay.y + dy)})

const round = (value) => Math.round(value * 100) / 100
