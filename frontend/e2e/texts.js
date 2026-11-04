// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The end-to-end tests find elements by id; where they check a text they compare it with the translations of the application, in the
// language the browser starts in (Dutch: playwright.config.js sets the locale nl-BE). `t('app.saved')` = the Dutch text of that key.
import {interpolate, translation} from '../src/i18n/translate.js'

export const LANGUAGE = 'nl'
export const t = (key, params, language = LANGUAGE) => {
    const text = translation(key, language)
    if (typeof text !== 'string') throw new Error('no translation for ' + key)
    return interpolate(text, params)
}
/** a regular expression that matches the text of a key literally */
export const textPattern = (key, params, language) => new RegExp(t(key, params, language).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
