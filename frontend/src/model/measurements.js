// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The measurements for the inspection (keuring), kept in project.footer: aardingsweerstand (Ω), isolatieweerstand (MΩ) and meetdatum.
// AREI: the earth resistance may be at most 30 Ω, or at most 100 Ω with additional measures (at least two differentials of at most 30 mA
// right after the main differential); see rules.js.
import {t} from '../i18n/translate.js'

export const EARTH_LIMIT = 30
export const EARTH_LIMIT_WITH_MEASURES = 100

/** A number typed as "25", "25,4", "25.4 Ω" or "0,5 MΩ"; null when there is none. */
export const measuredValue = (text) => {
    const match = /(\d+(?:[.,]\d+)?)/.exec(String(text ?? ''))
    return match ? parseFloat(match[1].replace(',', '.')) : null
}

/** A value as it is printed: the number as typed (comma or point), without a unit the user may have typed along. */
const shown = (text) => String(text ?? '').trim().replace(/\s*(m?Ω|M?ohm|MΩ|ohm)\s*$/i, '')

/**
 * The boxes of the measurements in the lower row of the title block (mm on the A4 sheet): the label at x, the value (or a dotted line to
 * write on) from `from` to `to`, the unit after it, and the clickable cell [start, end] that opens Kaderinfo on the field.
 * Ra and Riso share the cell under the address (75-150), the date has the cell under the owner (150-200).
 */
export const MEASUREMENT_BOXES = [
    {field: 'aardingsweerstand', label: 'sheet.measure.earth', x: 76, from: 81, to: 102, unit: 'Ω', cell: [75, 108]},
    {field: 'isolatieweerstand', label: 'sheet.measure.insulation', x: 109, from: 116.5, to: 141, unit: 'MΩ', cell: [108, 150]},
    {field: 'meetdatum', label: 'sheet.measure.date', x: 151, from: 168, to: 198.5, unit: '', cell: [150, 200]},
]

/** A measurement as it is printed: the value as typed, without a unit typed along (the sheet prints the unit itself); '' when empty. */
export const measurementValue = (footer = {}, field) => (field === 'meetdatum' ? String(footer[field] ?? '').trim() : shown(footer[field]).trim())

/** The text at the earth symbol, e.g. "Ra = 25 Ω"; null without an earth resistance. */
export const earthLabel = (footer = {}) =>
    String(footer.aardingsweerstand ?? '').trim() ? t('sheet.earthLabel', {value: shown(footer.aardingsweerstand)}) : null
