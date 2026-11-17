// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Export of all sheets as a zip file: one SVG drawing (vector, A4 landscape in mm, to edit further in e.g. Inkscape or Illustrator) or one
// PNG image (150 dpi) per sheet, in the order of the PDF. The sheets are the ones rendered off screen for the PDF (AllSheets).
import {zipSync} from 'fflate'
import {t} from '../../i18n/translate.js'
import {sheetPlan} from '../../model/boardLayout.js'

export const PAGE_EXPORT_TYPES = ['svg', 'png']

const twoDigits = (index) => String(index).padStart(2, '0')

/** A file name without characters that a file system or zip tool does not like. */
export const safeFileName = (text) =>
    String(text || '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || '-'

/** A zip (bytes) of `files` ({name: bytes}): a PNG is stored as it is (it is compressed already), an SVG is compressed. */
export const zipFiles = (files) => zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, [content, {level: name.endsWith('.png') ? 0 : 6}]])))

// ---- SVG and PNG --------------------------------------------------------------------------------------------------------------

/** Pixels per millimetre of a PNG: 150 dpi, an A4 sheet becomes 1754 × 1240 pixels. */
export const PNG_DPI = 150
export const pngSize = (dpi = PNG_DPI) => ({width: Math.round((297 / 25.4) * dpi), height: Math.round((210 / 25.4) * dpi)})

/** The names of the files: one per sheet in the order of the PDF; a page that takes several sheets gets (1), (2), ... */
export function sheetFileNames(project, extension = 'png') {
    const plan = sheetPlan(project),
        perPage = new Map()
    plan.forEach((sheet) => perPage.set(sheet.page, (perPage.get(sheet.page) || 0) + 1))
    const seen = new Map()
    return plan.map((sheet) => {
        const count = perPage.get(sheet.page),
            part = (seen.get(sheet.page) || 0) + 1
        seen.set(sheet.page, part)
        const kind = t(sheet.kind === 'een' ? 'pagesExport.oneWireFile' : 'pagesExport.situationFile')
        return `${twoDigits(sheet.number)} ${kind} - ${safeFileName(sheet.page.name)}${count > 1 ? ` (${part})` : ''}.${extension}`
    })
}

// the styles that the stylesheets give the drawing (e.g. the transparent click areas of the kader): written on the copy, which is drawn
// as a picture without the stylesheets of the page
const COPIED_STYLES = ['display', 'visibility', 'opacity', 'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'font-style']

/** A standalone copy of a rendered sheet (svg) with the computed styles written on its elements, `width` × `height` (pixels, or e.g. '297mm'). */
export function standaloneSvg(svg, {width, height} = pngSize()) {
    const copy = svg.cloneNode(true),
        originals = [svg, ...svg.querySelectorAll('*')],
        copies = [copy, ...copy.querySelectorAll('*')]
    originals.forEach((original, index) => {
        const style = window.getComputedStyle?.(original)
        if (!style) return
        const inline = COPIED_STYLES.map((name) => [name, style.getPropertyValue(name)])
            .filter(([, value]) => value)
            .map(([name, value]) => `${name}:${value}`)
            .join(';')
        if (inline) copies[index].setAttribute('style', inline + ';' + (copies[index].getAttribute('style') || ''))
    })
    copy.setAttribute('width', String(width))
    copy.setAttribute('height', String(height))
    copy.removeAttribute('class')
    copy.removeAttribute('id')
    return new XMLSerializer().serializeToString(copy)
}

/** A rendered sheet (svg) as an SVG file of its own: A4 landscape in millimetres, a vector drawing that needs nothing of the page. */
export const sheetToSvg = (svg) => new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?>\n' + standaloneSvg(svg, {width: '297mm', height: '210mm'}) + '\n')

/** Draws a rendered sheet (svg) as a PNG of `size` pixels on a white background; resolves to its bytes. */
export function sheetToPng(svg, size = pngSize()) {
    const source = standaloneSvg(svg, size),
        url = URL.createObjectURL(new Blob([source], {type: 'image/svg+xml'}))
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas')
                canvas.width = size.width
                canvas.height = size.height
                const context = canvas.getContext('2d')
                context.fillStyle = '#fff'
                context.fillRect(0, 0, size.width, size.height)
                context.drawImage(image, 0, 0, size.width, size.height)
                canvas.toBlob((blob) => (blob ? blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject) : reject(new Error('PNG'))), 'image/png')
            } catch (error) {
                reject(error)
            } finally {
                URL.revokeObjectURL(url)
            }
        }
        image.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error(t('pagesExport.pngFailed')))
        }
        image.src = url
    })
}

/** The zip of all sheets rendered under `container` (see AllSheets), each made into a file by `toFile` (sheetToSvg or sheetToPng). */
export async function sheetsZip(project, container, toFile, extension) {
    const sheets = [...container.querySelectorAll('svg.sheet')],
        names = sheetFileNames(project, extension),
        files = {}
    for (let index = 0; index < sheets.length; index++) files[names[index] || `${twoDigits(index + 1)}.${extension}`] = await toFile(sheets[index])
    return zipFiles(files)
}

/** The zip of the PNG images of all sheets. `toPng` can be replaced in tests. */
export const sheetsPngZip = (project, container, toPng = sheetToPng) => sheetsZip(project, container, toPng, 'png')

/** The zip of the SVG drawings of all sheets. */
export const sheetsSvgZip = (project, container) => sheetsZip(project, container, async (svg) => sheetToSvg(svg), 'svg')

/** The name of the zip file: "<title of the kader>-<svg|png>.zip", like the other exports. */
export const pagesZipName = (project, type) => `${safeFileName(project.footer?.titel || 'schema')}-${type}.zip`
