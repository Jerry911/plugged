// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {LANGUAGES} from './translate.js'
import {useTranslation} from './I18nProvider.jsx'

/** The language picker of the top bar. */
export default function LanguageSelect() {
    const {t, language, setLanguage} = useTranslation()
    return (
        <select
            id="language-select"
            className="langsel"
            aria-label={t('language.label')}
            title={t('language.label')}
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
        >
            {LANGUAGES.map((option) => (
                <option key={option.code} id={'language-' + option.code} value={option.code}>
                    {option.short} · {option.label}
                </option>
            ))}
        </select>
    )
}
