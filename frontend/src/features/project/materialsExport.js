// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The bill of materials as a file: an Excel workbook (.xlsx, written here: a zip of a few XML files, see ECMA-376) or a CSV file (";" as
// separator and a byte order mark, so Excel in a Belgian locale opens it in columns). Both have the same rows (materialsRows).
import {zipSync, strToU8} from 'fflate'
import {t} from '../../i18n/translate.js'

/**
 * The rows of the list: a title, the project, then per section a heading, a header row and the articles. Every row is {style, cells}:
 * style 'title' | 'section' | 'header' | undefined; cells are strings or numbers. Empty sections are left out.
 */
export function materialsRows(bom, project) {
    const footer = project.footer || {},
        address = [[footer.straat, footer.nr].filter(Boolean).join(' '), [footer.postcode, footer.gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    const rows = [{style: 'title', cells: [t('materials.title') + (project.name ? ' - ' + project.name : '')]}]
    if (footer.eigenaar) rows.push({cells: [t('sheet.cells.owner'), footer.eigenaar]})
    if (address) rows.push({cells: [t('sheet.cells.address'), address]})
    rows.push({cells: [t('materials.circuits'), bom.circuits]})
    const section = (key, header, items, cells) => {
        if (!items.length) return
        rows.push({cells: []}, {style: 'section', cells: [t('materials.sections.' + key)]}, {style: 'header', cells: header.map((column) => t('materials.columns.' + column))})
        items.forEach((item) => rows.push({cells: cells(item)}))
    }
    section('protection', ['article', 'count', 'circuits'], bom.protection, (row) => [row.description, row.count, row.marks])
    section('cables', ['cable', 'count', 'circuits', 'length'], bom.cables, (row) => [row.cable, row.count, row.marks, ''])
    section('elements', ['element', 'count', 'outlets'], bom.elements, (row) => [row.name, row.count, row.outlets || ''])
    if (bom.outlets) rows.push({style: 'header', cells: [t('materials.totalOutlets'), '', bom.outlets]})
    section('boards', ['element', 'count'], bom.boards, (row) => [row.name, row.count])
    return rows
}

const csvCell = (value) => {
    const text = value == null ? '' : String(value)
    return /[;"\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

/** The list as CSV text (with a byte order mark). */
export const materialsCsv = (bom, project) => '﻿' + materialsRows(bom, project).map((row) => row.cells.map(csvCell).join(';')).join('\r\n') + '\r\n'

const xml = (text) =>
    String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        // characters XML 1.0 does not allow
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
const column = (index) => {
    let name = ''
    for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) name = String.fromCharCode(65 + ((number - 1) % 26)) + name
    return name
}
// styles of styles.xml: 0 normal, 1 bold (header), 2 bold and larger (title), 3 bold on a grey fill (section)
const STYLE = {title: 2, section: 3, header: 1}

/** The list as an Excel workbook (.xlsx), as bytes. */
export function materialsXlsx(bom, project) {
    const rows = materialsRows(bom, project)
    const sheetRows = rows
        .map((row, rowIndex) => {
            const style = STYLE[row.style] || 0
            const cells = row.cells
                .map((value, columnIndex) => {
                    const reference = column(columnIndex) + (rowIndex + 1),
                        styled = style ? ` s="${style}"` : ''
                    if (typeof value === 'number') return `<c r="${reference}"${styled}><v>${value}</v></c>`
                    if (value === '' || value == null) return style ? `<c r="${reference}"${styled}/>` : ''
                    return `<c r="${reference}"${styled} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
                })
                .join('')
            return `<row r="${rowIndex + 1}">${cells}</row>`
        })
        .join('')
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="48" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/><col min="3" max="3" width="30" customWidth="1"/><col min="4" max="4" width="14" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><pageSetup orientation="portrait" paperSize="9"/></worksheet>`
    const files = {
        '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
        '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(t('materials.sheetName')).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
        'xl/worksheets/sheet1.xml': sheet,
    }
    return zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])))
}

/** Lets the browser download `content` (bytes or text) as `fileName`. */
export function download(content, fileName, mimeType) {
    const url = URL.createObjectURL(new Blob([content], {type: mimeType})),
        link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A file name from the project: "materiaallijst-<name or number>.<extension>". */
export const materialsFileName = (project, projectId, extension) =>
    (t('materials.fileName') + '-' + (project.name || project.footer?.titel || (projectId ? String(projectId) : 'project')))
        .replace(/[^\p{L}\p{N}._-]+/gu, '-')
        .replace(/-+/g, '-')
        .replace(/-$/, '') +
    '.' +
    extension
