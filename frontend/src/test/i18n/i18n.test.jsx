// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, fireEvent, render} from '@testing-library/react'
import {
    allTranslations,
    detectLanguage,
    DICTIONARIES,
    getLanguage,
    getLocale,
    interpolate,
    LANGUAGE_STORAGE_KEY,
    LANGUAGES,
    onLanguageChange,
    setLanguage,
    t,
    translation,
} from '../../i18n/translate.js'
import {I18nProvider, useTranslation} from '../../i18n/I18nProvider.jsx'
import LanguageSelect from '../../i18n/LanguageSelect.jsx'
import RichText, {renderInline} from '../../i18n/RichText.jsx'
import {apiFetch, fetchOk} from '../../api/http.js'
import {getById} from '../utils.jsx'

// every key of a dictionary, with the type of its value
const shapeOf = (value, prefix = '') =>
    Array.isArray(value)
        ? [[prefix, 'list:' + value.length], ...value.flatMap((entry, index) => shapeOf(entry, `${prefix}[${index}]`))]
        : value && typeof value === 'object'
          ? Object.entries(value).flatMap(([key, entry]) => shapeOf(entry, prefix ? prefix + '.' + key : key))
          : [[prefix, typeof value]]
const placeholdersOf = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('the dictionaries', () => {
    test('Dutch, French and English are offered', () => {
        expect(LANGUAGES.map((language) => language.code)).toEqual(['nl', 'fr', 'en'])
        expect(Object.keys(DICTIONARIES)).toEqual(['nl', 'fr', 'en'])
    })
    test.each(['fr', 'en'])('%s has exactly the keys, lists and placeholders of Dutch', (language) => {
        const dutch = shapeOf(DICTIONARIES.nl),
            other = shapeOf(DICTIONARIES[language])
        expect(other.map(([key, type]) => key + ' ' + type)).toEqual(dutch.map(([key, type]) => key + ' ' + type))
        const otherTexts = Object.fromEntries(other)
        dutch
            .filter(([, type]) => type === 'string')
            .forEach(([key]) => {
                const dutchText = key.split(/\.|\[|\]/).filter(Boolean).reduce((value, part) => value[part], DICTIONARIES.nl),
                    otherText = key.split(/\.|\[|\]/).filter(Boolean).reduce((value, part) => value[part], DICTIONARIES[language])
                expect(placeholdersOf(otherText), `${language} ${key}`).toEqual(placeholdersOf(dutchText))
                expect(otherTexts[key]).toBe('string')
            })
    })
    test('no text is empty', () => {
        for (const language of Object.keys(DICTIONARIES))
            shapeOf(DICTIONARIES[language])
                .filter(([, type]) => type === 'string')
                .forEach(([key]) => {
                    const text = key.split(/\.|\[|\]/).filter(Boolean).reduce((value, part) => value[part], DICTIONARIES[language])
                    expect(text.trim().length, `${language} ${key}`).toBeGreaterThan(0)
                })
    })
})

describe('translating', () => {
    test('t fills in placeholders and leaves unknown ones; an unknown key shows itself', () => {
        expect(t('sheet.pageOf', {number: 2, total: 5})).toBe('Blad 2/5')
        expect(t('sheet.pageOf', {number: 2})).toBe('Blad 2/{total}')
        expect(t('does.not.exist')).toBe('does.not.exist')
        expect(t('tour.steps')).toBe('tour.steps') // a group of entries is not a text
        expect(interpolate('{a}-{b}-{a}', {a: 1, b: null})).toBe('1-{b}-1')
    })
    test('switching the language changes every text, the locale and the html lang; the choice is remembered', () => {
        const heard = []
        const stop = onLanguageChange((code) => heard.push(code))
        setLanguage('fr')
        expect(getLanguage()).toBe('fr')
        expect(getLocale()).toBe('fr-BE')
        expect(t('common.close')).toBe('Fermer')
        expect(document.documentElement.lang).toBe('fr')
        expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr')
        setLanguage('fr') // no change: nobody is told
        setLanguage('xx') // not supported: ignored
        setLanguage('en')
        stop()
        setLanguage('nl')
        expect(heard).toEqual(['fr', 'en'])
    })
    test('a text missing in a language falls back on Dutch', () => {
        const english = DICTIONARIES.en.common.close
        delete DICTIONARIES.en.common.close
        try {
            setLanguage('en')
            expect(t('common.close')).toBe('Sluiten')
        } finally {
            DICTIONARIES.en.common.close = english
        }
    })
    test('translation gives lists and groups, also of another language; allTranslations gives a text in every language', () => {
        expect(translation('info.faq.questions')).toHaveLength(DICTIONARIES.nl.info.faq.questions.length)
        expect(translation('common.close', 'en')).toBe('Close')
        expect(allTranslations('board.boardLabel')).toEqual(['Verdeelbord', 'Tableau de distribution', 'Distribution board'])
    })
    test('the language is taken from this browser: the stored choice first, then the browser languages, else Dutch', () => {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
        expect(detectLanguage()).toBe('en')
        localStorage.removeItem(LANGUAGE_STORAGE_KEY)
        const languages = vi.spyOn(navigator, 'languages', 'get')
        languages.mockReturnValue(['de-DE', 'fr-BE'])
        expect(detectLanguage()).toBe('fr')
        languages.mockReturnValue(['de-DE'])
        vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES')
        expect(detectLanguage()).toBe('nl')
        // a browser that blocks the storage still gets a language
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        languages.mockReturnValue(['en-US'])
        expect(detectLanguage()).toBe('en')
    })
    test('a blocked storage does not stop the switch', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        setLanguage('en')
        expect(t('common.close')).toBe('Close')
    })
})

describe('in React', () => {
    const Probe = () => {
        const {t: translate, language, locale} = useTranslation()
        return (
            <p id="probe">
                {language} {locale} {translate('common.close')}
            </p>
        )
    }
    test('the provider renders again when the language changes; the picker changes it', () => {
        render(
            <I18nProvider>
                <LanguageSelect />
                <Probe />
            </I18nProvider>,
        )
        expect(getById('probe')).toHaveTextContent('nl nl-BE Sluiten')
        expect(getById('language-select')).toHaveValue('nl')
        expect([...getById('language-select').options].map((option) => option.value)).toEqual(['nl', 'fr', 'en'])
        fireEvent.change(getById('language-select'), {target: {value: 'en'}})
        expect(getById('probe')).toHaveTextContent('en en-GB Close')
        act(() => setLanguage('fr'))
        expect(getById('probe')).toHaveTextContent('fr fr-BE Fermer')
        expect(getById('language-select')).toHaveValue('fr')
    })
    test('without a provider the hook still translates', () => {
        render(<Probe />)
        expect(getById('probe')).toHaveTextContent('nl nl-BE Sluiten')
    })
    test('RichText renders paragraphs, bold, keys and line breaks', () => {
        const {container} = render(<RichText text={['Klik **hier**', 'Druk [[Ctrl]]+[[S]]\nklaar']} />)
        const paragraphs = container.querySelectorAll('p')
        expect(paragraphs).toHaveLength(2)
        expect(paragraphs[0].querySelector('b')).toHaveTextContent('hier')
        expect([...paragraphs[1].querySelectorAll('kbd')].map((key) => key.textContent)).toEqual(['Ctrl', 'S'])
        expect(paragraphs[1].querySelector('br')).toBeTruthy()
        render(<RichText text="Eén alinea" />)
        expect(renderInline('plain')).toEqual(['plain'])
    })
})

describe('requests to the backend carry the language', () => {
    test('apiFetch adds Accept-Language and keeps the other headers; fetchOk answers null when it fails', async () => {
        global.fetch = vi.fn(async () => ({ok: true}))
        setLanguage('fr')
        await apiFetch('/api/x', {method: 'PUT', headers: {'Content-Type': 'application/json'}})
        expect(global.fetch).toHaveBeenLastCalledWith('/api/x', {method: 'PUT', headers: {'Accept-Language': 'fr', 'Content-Type': 'application/json'}})
        expect(await fetchOk('/api/y')).toEqual({ok: true})
        global.fetch = vi.fn(async () => ({ok: false}))
        expect(await fetchOk('/api/y')).toBeNull()
        global.fetch = vi.fn(async () => Promise.reject(new Error('down')))
        expect(await fetchOk('/api/y')).toBeNull()
    })
})
