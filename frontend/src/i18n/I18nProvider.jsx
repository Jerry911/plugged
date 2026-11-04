// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {createContext, useContext, useEffect, useMemo, useState} from 'react'
import {getLanguage, getLocale, onLanguageChange, setLanguage, t} from './translate.js'

const I18nContext = createContext(null)

/** Keeps the active language in React state, so everything below it renders again when the language changes. */
export function I18nProvider({children}) {
    const [language, setLanguageState] = useState(getLanguage)
    useEffect(() => {
        document.documentElement.lang = getLanguage()
        return onLanguageChange(setLanguageState)
    }, [])
    const value = useMemo(() => ({language, locale: getLocale(), setLanguage, t}), [language])
    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * {t, language, locale, setLanguage}. Outside an I18nProvider (a component rendered on its own in a test) it still works, it just
 * does not re-render by itself when the language changes.
 */
export const useTranslation = () => useContext(I18nContext) ?? {language: getLanguage(), locale: getLocale(), setLanguage, t}
