// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// When the work on site started (Kaderinfo → Installatie: project.footer.installatiedatum). Several rules of the AREI only apply to
// installations started on or after a date (e.g. 01/06/2023 for at most 8 circuits per 30 mA differential, 6.5.8.1); the field accepts a
// full date, a month or just a year when the exact date is not known.

const pad = (number) => String(number).padStart(2, '0')
const iso = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`
const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate()
const validYear = (year) => year >= 1900 && year <= 2200

/**
 * The period a typed installation date stands for, as ISO dates {from, to, precision: 'day' | 'month' | 'year'}, or null when it is empty
 * or not a date. Accepts 2023, 06/2023, 6-2023, 1/6/2023, 01.06.2023 and 2023-06-01.
 */
export const parseInstallationDate = (text) => {
    const value = String(text ?? '').trim()
    if (!value) return null
    let match = /^(\d{4})$/.exec(value)
    if (match && validYear(+match[1])) return {from: iso(+match[1], 1, 1), to: iso(+match[1], 12, 31), precision: 'year'}
    const monthYear = /^(\d{1,2})[/.-](\d{4})$/.exec(value),
        yearMonth = /^(\d{4})-(\d{1,2})$/.exec(value)
    if (monthYear || yearMonth) {
        const month = +(monthYear ? monthYear[1] : yearMonth[2]),
            year = +(monthYear ? monthYear[2] : yearMonth[1])
        if (month >= 1 && month <= 12 && validYear(year)) return {from: iso(year, month, 1), to: iso(year, month, daysIn(year, month)), precision: 'month'}
        return null
    }
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value)
    const [day, month, year] = match ? [+match[1], +match[2], +match[3]] : (/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value) || []).slice(1).reverse().map(Number)
    if (year && validYear(year) && month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month)) {
        const date = iso(year, month, day)
        return {from: date, to: date, precision: 'day'}
    }
    return null
}

/**
 * Does a rule that applies from `since` (ISO date) apply to an installation started in `period`: 'yes', 'no', or 'maybe' when the period
 * (a year or a month) runs across that date. Without a known date, or without `since`, it applies.
 */
export const appliesTo = (since, period) => {
    if (!since || !period) return 'yes'
    if (period.from >= since) return 'yes'
    if (period.to < since) return 'no'
    return 'maybe'
}

/** An ISO date as the AREI writes it: 01/06/2023. */
export const formatDate = (isoDate) => {
    const [year, month, day] = String(isoDate).split('-')
    return `${day}/${month}/${year}`
}
