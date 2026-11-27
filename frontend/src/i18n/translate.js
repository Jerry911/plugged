// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Translations of the user interface. Plain modules (the verification rules, the board layout, the EDS import) and React components
// share one active language: modules call t() directly, components use the useTranslation() hook (see I18nProvider.jsx), which
// re-renders the editor when the language changes.
import nl from './locales/nl.js'

// Dutch is always there (the texts are written in it first, the other languages fall back on it); French and English are loaded when they
// are needed (each about 150 kB: the first page opens faster without the two languages it does not show). main.jsx loads the language of the
// visitor before the first render; switching to another language loads it first.
const LOADERS = {fr: () => import('./locales/fr.js'), en: () => import('./locales/en.js')}
export const DICTIONARIES = {nl, fr: null, en: null}
export const LANGUAGES = [
    {code: 'nl', label: 'Nederlands', short: 'NL'},
    {code: 'fr', label: 'Français', short: 'FR'},
    {code: 'en', label: 'English', short: 'EN'},
]
// the language when neither a stored choice nor a language of the browser is one of ours
export const DEFAULT_LANGUAGE = 'en'
// the language the texts are written in first (always complete): a text missing in another language falls back on it
export const SOURCE_LANGUAGE = 'nl'
export const LANGUAGE_STORAGE_KEY = 'plugged.language'
// the locale used to format dates and numbers in each language (Belgian variants: the AREI is a Belgian regulation)
export const LOCALES = {nl: 'nl-BE', fr: 'fr-BE', en: 'en-GB'}

const isSupported = (code) => Object.hasOwn(DICTIONARIES, code)

const remember = (code) => {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    } catch {
        // storage blocked: the choice lasts until the page is reloaded
    }
}

/** Loads the texts of a language (once); resolves when they are there. */
export const loadLanguage = async (code) => {
    if (isSupported(code) && !DICTIONARIES[code]) DICTIONARIES[code] = (await LOADERS[code]()).default
    return DICTIONARIES[code]
}
/** Loads every language (what needs all of them, e.g. recognising a default text in any language). */
export const loadAllLanguages = () => Promise.all(Object.keys(DICTIONARIES).map(loadLanguage))

/** The language chosen earlier in this browser, else the first supported language of the browser (nl, fr, en), else English. */
export const detectLanguage = () => {
    try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
        if (isSupported(stored)) return stored
    } catch {
        // storage blocked (private mode): fall back on the browser languages
    }
    const browserLanguages = typeof navigator === 'undefined' ? [] : [...(navigator.languages || []), navigator.language]
    const match = browserLanguages
        .filter(Boolean)
        .map((code) => code.slice(0, 2).toLowerCase())
        .find(isSupported)
    return match || DEFAULT_LANGUAGE
}

let currentLanguage = detectLanguage()
const listeners = new Set()

export const getLanguage = () => currentLanguage
export const getLocale = () => LOCALES[currentLanguage]

/**
 * Switches the language of the whole application and remembers the choice in this browser. A language whose texts are not loaded yet is
 * loaded first: then the switch follows, and only then a promise is returned (that resolves after it); otherwise the switch is immediate.
 */
export const setLanguage = (code) => {
    if (!isSupported(code) || code === currentLanguage) return
    if (!DICTIONARIES[code]) {
        // remembered at once: a reload while the texts load opens in the chosen language
        remember(code)
        return loadLanguage(code).then(() => setLanguage(code))
    }
    currentLanguage = code
    remember(code)
    if (typeof document !== 'undefined') document.documentElement.lang = code
    listeners.forEach((listener) => listener(code))
}

/** Calls `listener(code)` whenever the language changes; returns the function that stops listening. */
export const onLanguageChange = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

const lookup = (dictionary, key) => key.split('.').reduce((value, part) => (value == null ? undefined : value[part]), dictionary)

/** The raw entry of a key (a string, a list or a group of entries) in the active language, falling back on Dutch. */
export const translation = (key, language = currentLanguage) => lookup(DICTIONARIES[language], key) ?? lookup(DICTIONARIES[SOURCE_LANGUAGE], key)

/** Fills in the {placeholders} of a text. */
export const interpolate = (text, params = {}) =>
    String(text).replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined || params[name] === null ? whole : String(params[name])))

/**
 * The text of a key in the active language with its {placeholders} filled in. An unknown key returns the key itself, so a missing
 * translation is visible instead of breaking the page.
 */
export const t = (key, params) => {
    const value = translation(key)
    return typeof value === 'string' ? interpolate(value, params) : key
}

/** The same text in every language: used to recognise a default text (e.g. a label nobody changed) whatever language it was made in. */
export const allTranslations = (key) =>
    Object.keys(DICTIONARIES)
        .map((language) => lookup(DICTIONARIES[language], key))
        .filter((value) => typeof value === 'string')
