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

/** The measurements as short texts for the title block, e.g. ["Ra 25 Ω", "Riso 200 MΩ", "gemeten 13/11/2026"]; empty when none is filled in. */
export const measurementParts = (footer = {}) => {
    const parts = []
    if (String(footer.aardingsweerstand ?? '').trim()) parts.push(t('sheet.earthResistance', {value: shown(footer.aardingsweerstand)}))
    if (String(footer.isolatieweerstand ?? '').trim()) parts.push(t('sheet.insulationResistance', {value: shown(footer.isolatieweerstand)}))
    if (parts.length && String(footer.meetdatum ?? '').trim()) parts.push(t('sheet.measuredOn', {date: footer.meetdatum.trim()}))
    return parts
}

/** The text at the earth symbol, e.g. "Ra = 25 Ω"; null without an earth resistance. */
export const earthLabel = (footer = {}) =>
    String(footer.aardingsweerstand ?? '').trim() ? t('sheet.earthLabel', {value: shown(footer.aardingsweerstand)}) : null
