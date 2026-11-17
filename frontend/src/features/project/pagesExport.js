// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Export of all pages as a zip file: one CSV file per page (the elements of an eendraadschema page, the walls and placed items of a
// situatieschema page), or one PNG image per sheet (what the PDF has on a page, as a picture). The CSV files use ";" and a byte order mark,
// like the materiaallijst, so Excel in a Belgian locale opens them in columns; numbers are written with the decimal separator of the language.
import {zipSync, strToU8} from 'fflate'
import {getLocale, t} from '../../i18n/translate.js'
import {circuitMarks} from '../../model/project.js'
import {sheetPlan} from '../../model/boardLayout.js'
import {fromSheet, scaleOf} from '../../model/geometry.js'
import {symbolName, typeOf} from '../../symbols/symbolLibrary.js'
import {csvText} from './materialsExport.js'

export const PAGE_EXPORT_TYPES = ['csv', 'png']

// a number in the active language (3,5 in Dutch and French, 3.5 in English), without thousands separators
const number = (value, digits = 2) =>
    value == null || value === '' || Number.isNaN(Number(value))
        ? ''
        : Number(value).toLocaleString(getLocale(), {maximumFractionDigits: digits, useGrouping: false})
const twoDigits = (index) => String(index).padStart(2, '0')

/** A file name without characters that a file system or zip tool does not like. */
export const safeFileName = (text) =>
    String(text || '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || '-'

// ---- CSV ------------------------------------------------------------------------------------------------------------------------

/**
 * The rows of an eendraadschema page: a header row, then every element of its tree from top to bottom (a parent before what hangs under it),
 * with its level, its marking (A, A1, ...), what it is and its properties.
 */
export function oneWireRows(project, page) {
    const marks = circuitMarks(project),
        rows = [['level', 'marking', 'element', 'label', 'protection', 'poles', 'current', 'curve', 'sensitivity', 'diffType', 'cable', 'text', 'info'].map((column) => t('pagesExport.oneWire.' + column))]
    const walk = (nodes, level) =>
        nodes.forEach((node) => {
            const p = node.p || {}
            rows.push([
                level,
                node.type === 'kring' ? node.label || '' : marks.get(node.id) || '',
                symbolName(typeOf(project, node.type)),
                node.type === 'kring' ? '' : node.label || '',
                node.type === 'kring' && p.bescherming
                    ? p.bescherming === 'differentieelautomaat'
                        ? t('pagesExport.rcbo')
                        : t('oneWire.protections.' + p.bescherming)
                    : '',
                p.polen ?? '',
                p.amp ?? '',
                p.curve ?? '',
                p.delta ?? '',
                p.diffType ?? '',
                p.kabel ?? '',
                p.tekst ?? '',
                node.info || '',
            ])
            walk(node.children || [], level + 1)
        })
    walk(page.tree || [], 1)
    return rows
}

/**
 * The rows of a situatieschema page: a header row, every wall (begin, end and real length at the scale of the kader), then every door,
 * window, symbol and text (place on the sheet in mm, turn, size, and for a symbol the element of the eendraadschema and its marking).
 */
export function situationRows(project, page) {
    const marks = circuitMarks(project),
        scale = scaleOf(project.footer),
        nodes = new Map(project.een.flatMap((oneWirePage) => flattenTree(oneWirePage.tree)).map((node) => [node.id, node])),
        rows = [['kind', 'element', 'marking', 'x', 'y', 'x2', 'y2', 'length', 'rotation', 'size', 'text'].map((column) => t('pagesExport.situation.' + column))]
    ;(page.walls || []).forEach((wall) =>
        rows.push([
            t('pagesExport.kinds.wall'),
            '',
            '',
            number(wall.x1),
            number(wall.y1),
            number(wall.x2),
            number(wall.y2),
            number(fromSheet(Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1), scale)),
            '',
            '',
            '',
        ]),
    )
    ;(page.items || []).forEach((item) => {
        const node = item.kind === 'sym' && item.node ? nodes.get(item.node) : null,
            element = node ? symbolName(typeOf(project, node.type)) : item.kind === 'sym' && item.type ? symbolName(typeOf(project, item.type)) : ''
        rows.push([
            t('pagesExport.kinds.' + (['sym', 'door', 'window', 'text'].includes(item.kind) ? item.kind : 'other')),
            element,
            item.kind === 'sym' ? (item.mark ?? (node ? marks.get(node.id) || '' : '')) : '',
            number(item.x),
            number(item.y),
            '',
            '',
            '',
            number(item.r || 0, 1),
            number(item.s ?? item.w ?? ''),
            item.kind === 'text' ? item.txt || '' : node?.label || '',
        ])
    })
    return rows
}

const flattenTree = (nodes = []) => nodes.flatMap((node) => [node, ...flattenTree(node.children)])

/** The CSV files of all pages: {name: text}, eendraadschema pages first, numbered in the order of the sheets. */
export function pagesCsvFiles(project) {
    const files = {}
    let index = 0
    project.een.forEach((page) => {
        index++
        files[`${twoDigits(index)} ${t('pagesExport.oneWireFile')} - ${safeFileName(page.name)}.csv`] = csvText(oneWireRows(project, page))
    })
    project.sit.forEach((page) => {
        index++
        files[`${twoDigits(index)} ${t('pagesExport.situationFile')} - ${safeFileName(page.name)}.csv`] = csvText(situationRows(project, page))
    })
    return files
}

/** A zip (bytes) of `files` ({name: text or bytes}). */
export const zipFiles = (files) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, typeof content === 'string' ? strToU8(content) : [content, {level: 0}]])))

/** The zip of the CSV files of all pages. */
export const pagesCsvZip = (project) => zipFiles(pagesCsvFiles(project))

// ---- PNG ------------------------------------------------------------------------------------------------------------------------

/** Pixels per millimetre of a PNG: 150 dpi, an A4 sheet becomes 1754 × 1240 pixels. */
export const PNG_DPI = 150
export const pngSize = (dpi = PNG_DPI) => ({width: Math.round((297 / 25.4) * dpi), height: Math.round((210 / 25.4) * dpi)})

/** The names of the PNG files: one per sheet in the order of the PDF; a page that takes several sheets gets (1), (2), ... */
export function sheetFileNames(project) {
    const plan = sheetPlan(project),
        perPage = new Map()
    plan.forEach((sheet) => perPage.set(sheet.page, (perPage.get(sheet.page) || 0) + 1))
    const seen = new Map()
    return plan.map((sheet) => {
        const count = perPage.get(sheet.page),
            part = (seen.get(sheet.page) || 0) + 1
        seen.set(sheet.page, part)
        const kind = t(sheet.kind === 'een' ? 'pagesExport.oneWireFile' : 'pagesExport.situationFile')
        return `${twoDigits(sheet.number)} ${kind} - ${safeFileName(sheet.page.name)}${count > 1 ? ` (${part})` : ''}.png`
    })
}

// the styles that the stylesheets give the drawing (e.g. the transparent click areas of the kader): written on the copy, which is drawn
// as a picture without the stylesheets of the page
const COPIED_STYLES = ['display', 'visibility', 'opacity', 'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'font-style']

/** A standalone copy of a rendered sheet (svg) with the computed styles written on its elements, at `width` × `height` pixels. */
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

/** The zip of the PNG images of all sheets rendered under `container` (see AllSheets). `toPng` can be replaced in tests. */
export async function sheetsPngZip(project, container, toPng = sheetToPng) {
    const sheets = [...container.querySelectorAll('svg.sheet')],
        names = sheetFileNames(project),
        files = {}
    for (let index = 0; index < sheets.length; index++) files[names[index] || `${twoDigits(index + 1)}.png`] = await toPng(sheets[index])
    return zipFiles(files)
}

/** The name of the zip file: "<title of the kader>-<csv|png>.zip", like the other exports. */
export const pagesZipName = (project, type) => `${safeFileName(project.footer?.titel || 'schema')}-${type}.zip`
