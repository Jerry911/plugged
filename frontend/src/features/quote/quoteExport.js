// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The offerte as files: a PDF to send to the client (jsPDF, A4) and an Excel workbook to adjust. Both from the same quote (model/quote.js),
// the details of the offerte (number, date, client, ...: project.quote) and the company of the price list.
import {jsPDF} from 'jspdf'
import {t} from '../../i18n/translate.js'
import {ARTICLE_GROUPS} from '../../model/pricing.js'
import {xlsxOf} from '../project/materialsExport.js'

/** An amount as in the language, e.g. "€ 1.234,50". */
// (the narrow space of some languages is not in the fonts of the PDF: a normal non-breaking one)
export const money = (amount, locale) => new Intl.NumberFormat(locale, {style: 'currency', currency: 'EUR'}).format(amount || 0).replace(/\u202f/g, '\u00a0')

/** The date the offerte is valid until (ISO date + days), as an ISO date. */
export const validUntil = (date, days) => {
    const start = new Date((date || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z')
    start.setUTCDate(start.getUTCDate() + (Number(days) || 30))
    return start.toISOString().slice(0, 10)
}

const dateText = (iso, locale) => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString(locale) : '')
const quantity = (qty, locale) => qty.toLocaleString(locale, {maximumFractionDigits: 2})

/** The lines of the offerte by group, then labour and the extra lines: [{heading} | {text, qty, unit, price, total}]. */
export function quoteRows(quote, locale) {
    const rows = []
    for (const group of [...ARTICLE_GROUPS, 'other']) {
        const lines = quote.lines.filter((line) => (ARTICLE_GROUPS.includes(line.group) ? line.group : 'other') === group)
        if (!lines.length || rows.some((row) => row.heading === t('pricing.groups.' + group))) continue
        rows.push({heading: t('pricing.groups.' + group)})
        for (const line of lines)
            rows.push({text: line.name + (line.code ? ' (' + line.code + ')' : ''), qty: line.qty, unit: t('pricing.units.' + line.unit), price: line.price, total: line.total})
    }
    if (quote.labour.total > 0 || quote.labour.hours > 0) {
        rows.push({heading: t('quote.labour')})
        rows.push({text: t('quote.labourLine'), qty: quote.labour.hours, unit: t('quote.hours'), price: quote.labour.rate, total: quote.labour.total})
    }
    if (quote.extras.length) {
        rows.push({heading: t('quote.extras')})
        for (const extra of quote.extras) rows.push({text: extra.text, qty: extra.qty, unit: '', price: extra.price, total: extra.total})
    }
    return rows.map((row) => (row.heading ? row : {...row, qtyText: quantity(row.qty, locale)}))
}

/** The optional lines, with their quantity as text: [{text, qty, qtyText, unit, price, total}]. */
export const optionalRows = (quote, locale) => (quote.optional?.lines || []).map((line) => ({...line, unit: '', qtyText: quantity(line.qty, locale)}))

/** The number of the offerte with its version from the second one on: "OFF-2026-12 v2". */
export const quoteNumber = (details) => (details.number || '') + ((Number(details.version) || 1) > 1 ? ' v' + Number(details.version) : '')

const vatLabel = (rate) => (rate === 0 ? t('quote.vatShifted') : t('quote.vatOf', {rate}))

/** The offerte as an Excel workbook (bytes). */
export function quoteXlsx(quote, details, company, locale) {
    const rows = [{style: 'title', cells: [t('quote.title') + ' ' + quoteNumber(details)]}]
    if (company.name) rows.push({cells: [company.name, [company.address, company.city].filter(Boolean).join(', ')]})
    if (company.vat) rows.push({cells: [t('pricing.company.vat'), company.vat]})
    rows.push({cells: [t('quote.date'), dateText(details.date, locale)]})
    rows.push({cells: [t('quote.validUntil'), dateText(validUntil(details.date, details.validDays), locale)]})
    if (details.client) rows.push({cells: [t('quote.client'), details.client]})
    if (details.clientAddress) rows.push({cells: [t('quote.clientAddress'), details.clientAddress]})
    if (details.site) rows.push({cells: [t('quote.site'), details.site]})
    rows.push({cells: []})
    rows.push({style: 'header', cells: [t('quote.columns.description'), t('quote.columns.qty'), t('quote.columns.unit'), t('quote.columns.price'), t('quote.columns.total')]})
    for (const row of quoteRows(quote, locale)) {
        if (row.heading) rows.push({style: 'section', cells: [row.heading, '', '', '', '']})
        else rows.push({cells: [row.text, row.qty, row.unit, {money: row.price}, {money: row.total}]})
    }
    rows.push({cells: []})
    rows.push({cells: [t('quote.subtotal'), '', '', '', {money: quote.subtotal}]})
    rows.push({cells: [vatLabel(quote.vat.rate), '', '', '', {money: quote.vat.amount}]})
    rows.push({style: 'total', cells: [t('quote.total'), '', '', '', {money: quote.total}]})
    if (quote.deposit) {
        rows.push({cells: [t('quote.depositLine', {percent: quote.deposit.percent}), '', '', '', {money: quote.deposit.amount}]})
        rows.push({cells: [t('quote.balanceLine'), '', '', '', {money: quote.deposit.balance}]})
    }
    if (quote.vat.rate === 0) rows.push({cells: [t('quote.vatShiftedNote')]})
    if (quote.optional) {
        rows.push({cells: []})
        rows.push({style: 'section', cells: [t('quote.optionalTitle'), '', '', '', '']})
        for (const row of optionalRows(quote, locale)) rows.push({cells: [row.text, row.qty, row.unit, {money: row.price}, {money: row.total}]})
        rows.push({cells: [t('quote.optionalSubtotal'), '', '', '', {money: quote.optional.subtotal}]})
        rows.push({cells: [t('quote.optionalTotal', {vat: vatLabel(quote.vat.rate)}), '', '', '', {money: quote.optional.total}]})
    }
    return xlsxOf(rows, {sheetName: t('quote.title'), widths: [56, 10, 10, 14, 14]})
}

const MARGIN = 15,
    WIDTH = 210,
    BOTTOM = 280

/** The offerte as a PDF (an ArrayBuffer). */
export function quotePdf(quote, details, company, locale) {
    const doc = new jsPDF({unit: 'mm', format: 'a4'})
    let y = MARGIN
    const right = WIDTH - MARGIN
    // the company: logo on the left, details on the right
    if (company.logo) {
        try {
            const properties = doc.getImageProperties(company.logo),
                height = Math.min(22, (properties.height / properties.width) * 50),
                width = (properties.width / properties.height) * height
            doc.addImage(company.logo, 'PNG', MARGIN, y, width, height)
        } catch {
            // a picture jsPDF cannot read: without logo
        }
    }
    doc.setFontSize(10)
    const companyLines = [company.address, company.city, company.vat && t('pricing.company.vat') + ' ' + company.vat, company.iban && 'IBAN ' + company.iban, company.email, company.phone, company.website].filter(Boolean)
    if (company.name) {
        doc.setFont('helvetica', 'bold')
        doc.text(company.name, right, y + 4, {align: 'right'})
        doc.setFont('helvetica', 'normal')
    }
    companyLines.forEach((line, index) => doc.text(line, right, y + 9 + index * 4.5, {align: 'right'}))
    y = Math.max(y + 28, y + 12 + companyLines.length * 4.5)
    // the offerte and the client
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(t('quote.title').toUpperCase(), MARGIN, y)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const facts = [
        [t('quote.number'), quoteNumber(details)],
        [t('quote.date'), dateText(details.date, locale)],
        [t('quote.validUntil'), dateText(validUntil(details.date, details.validDays), locale)],
        ...(details.site ? [[t('quote.site'), details.site]] : []),
    ]
    facts.forEach(([label, value], index) => {
        doc.text(label, MARGIN, y + 7 + index * 5)
        doc.text(String(value), MARGIN + 32, y + 7 + index * 5)
    })
    const client = [details.client, ...(details.clientAddress || '').split(/\n|,\s*/)].filter(Boolean)
    client.forEach((line, index) => {
        if (index === 0) doc.setFont('helvetica', 'bold')
        doc.text(line, 120, y + 7 + index * 5)
        doc.setFont('helvetica', 'normal')
    })
    y += 12 + Math.max(facts.length, client.length) * 5
    const paragraph = (text) => {
        for (const line of doc.splitTextToSize(text, right - MARGIN)) {
            if (y > BOTTOM) newPage()
            doc.text(line, MARGIN, y)
            y += 4.5
        }
        y += 2
    }
    // description | quantity (right aligned) | unit | price (right aligned) | total (right aligned)
    const QTY = 132,
        UNIT = 134,
        PRICE = 166
    const header = () => {
        doc.setFont('helvetica', 'bold')
        doc.setFillColor(232, 238, 245)
        doc.rect(MARGIN, y - 4, right - MARGIN, 6, 'F')
        doc.text(t('quote.columns.description'), MARGIN + 1, y)
        doc.text(t('quote.columns.qty'), QTY, y, {align: 'right'})
        doc.text(t('quote.columns.unit'), UNIT, y)
        doc.text(t('quote.columns.price'), PRICE, y, {align: 'right'})
        doc.text(t('quote.columns.total'), right - 1, y, {align: 'right'})
        doc.setFont('helvetica', 'normal')
        y += 6
    }
    const newPage = () => {
        doc.addPage()
        y = MARGIN + 5
    }
    if (details.intro || company.intro) paragraph(details.intro || company.intro)
    header()
    for (const row of quoteRows(quote, locale)) {
        if (y > BOTTOM - 6) {
            newPage()
            header()
        }
        if (row.heading) {
            doc.setFont('helvetica', 'bold')
            doc.text(row.heading, MARGIN + 1, y + 1)
            doc.setFont('helvetica', 'normal')
            y += 6
            continue
        }
        const text = doc.splitTextToSize(row.text, QTY - MARGIN - 16)
        doc.text(text, MARGIN + 1, y)
        doc.text(row.qtyText, QTY, y, {align: 'right'})
        doc.text(row.unit, UNIT, y)
        doc.text(money(row.price, locale), PRICE, y, {align: 'right'})
        doc.text(money(row.total, locale), right - 1, y, {align: 'right'})
        y += 5 * text.length
    }
    // the totals
    if (y > BOTTOM - 25) newPage()
    y += 3
    doc.line(120, y - 3, right, y - 3)
    const total = (label, amount, bold) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.text(label, 122, y)
        doc.text(money(amount, locale), right - 1, y, {align: 'right'})
        y += 6
    }
    total(t('quote.subtotal'), quote.subtotal)
    total(vatLabel(quote.vat.rate), quote.vat.amount)
    total(t('quote.total'), quote.total, true)
    doc.setFont('helvetica', 'normal')
    if (quote.deposit) {
        y += 1
        total(t('quote.depositLine', {percent: quote.deposit.percent}), quote.deposit.amount)
        total(t('quote.balanceLine'), quote.deposit.balance)
    }
    y += 4
    if (quote.vat.rate === 0) paragraph(t('quote.vatShiftedNote'))
    if (quote.vat.rate === 6) paragraph(t('quote.vatSixNote'))
    // the optional lines: a table of their own, with their own total, not part of the offerte's total
    if (quote.optional) {
        if (y > BOTTOM - 30) newPage()
        y += 2
        doc.setFont('helvetica', 'bold')
        doc.text(t('quote.optionalTitle'), MARGIN, y)
        doc.setFont('helvetica', 'normal')
        y += 6
        header()
        for (const row of optionalRows(quote, locale)) {
            if (y > BOTTOM - 6) {
                newPage()
                header()
            }
            const text = doc.splitTextToSize(row.text, QTY - MARGIN - 16)
            doc.text(text, MARGIN + 1, y)
            doc.text(row.qtyText, QTY, y, {align: 'right'})
            doc.text(money(row.price, locale), PRICE, y, {align: 'right'})
            doc.text(money(row.total, locale), right - 1, y, {align: 'right'})
            y += 5 * text.length
        }
        if (y > BOTTOM - 14) newPage()
        y += 3
        doc.line(120, y - 3, right, y - 3)
        total(t('quote.optionalSubtotal'), quote.optional.subtotal)
        total(t('quote.optionalTotal', {vat: vatLabel(quote.vat.rate)}), quote.optional.total)
        y += 2
    }
    if (details.terms || company.terms) {
        doc.setFontSize(8.5)
        paragraph(details.terms || company.terms)
    }
    // page numbers
    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
        doc.setPage(page)
        doc.setFontSize(8)
        doc.text([company.name, t('quote.title') + ' ' + quoteNumber(details)].filter(Boolean).join(' · '), MARGIN, 290)
        doc.text(t('quote.page', {page, pages}), right, 290, {align: 'right'})
    }
    return doc.output('arraybuffer')
}
