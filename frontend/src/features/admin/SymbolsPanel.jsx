// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Beheer → Symbolen: the standard symbols for the next release. The catalog that ships with the application is the file
// backend/src/main/resources/catalog/standard-symbols.json; this panel downloads it as this installation has it (with the drawings
// chosen with "make standard" in the Componenten tab) and shows what it would change.
import {useCallback, useEffect, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {fetchCatalogChanges, fetchCatalogFile} from '../../api/authApi.js'
import {symbolName} from '../../symbols/symbolLibrary.js'

export const CATALOG_FILE = 'standard-symbols.json'
export const CATALOG_PATH = 'backend/src/main/resources/catalog/' + CATALOG_FILE

/** Starts the download of `content` as the catalog file. */
const saveFile = (content) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], {type: 'application/json'}))
    link.download = CATALOG_FILE
    link.click()
}

export default function SymbolsPanel() {
    const {t} = useTranslation()
    const [changes, setChanges] = useState(null),
        [failed, setFailed] = useState(false),
        [busy, setBusy] = useState(false),
        [message, setMessage] = useState({kind: '', text: ''})
    const load = useCallback(async () => {
        try {
            setChanges(await fetchCatalogChanges())
            setFailed(false)
        } catch {
            setFailed(true)
        }
    }, [])
    useEffect(() => {
        load()
    }, [load])
    const download = async () => {
        setBusy(true)
        const content = await fetchCatalogFile()
        setBusy(false)
        if (content === null) return setMessage({kind: 'error', text: t('catalog.downloadFailed')})
        saveFile(content)
        setMessage({kind: 'ok', text: t('catalog.downloaded', {file: CATALOG_FILE})})
    }
    return (
        <section id="admin-symbols" className="adminsection">
            <p>{t('catalog.intro')}</p>
            {failed && (
                <p id="catalog-failed" className="authmsg error">
                    {t('catalog.loadFailed')}
                </p>
            )}
            {changes &&
                (changes.length ? (
                    <div id="catalog-changes" className="catalogchanges">
                        <b>{t('catalog.changes', {count: changes.length})}</b>
                        <ul>
                            {changes.map((symbol) => (
                                <li key={symbol.k} id={'catalog-change-' + symbol.k}>
                                    {symbolName(symbol)} <small>({symbol.k})</small>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p id="catalog-no-changes" className="groupempty">
                        {t('catalog.noChanges')}
                    </p>
                ))}
            <ol className="catalogsteps">
                <li>
                    {t('catalog.step1')}{' '}
                    <button id="catalog-download" className="accent" disabled={busy} onClick={download}>
                        ⭳ {t('catalog.download')}
                    </button>
                </li>
                <li>
                    {t('catalog.step2')} <code>{CATALOG_PATH}</code>
                </li>
                <li>{t('catalog.step3')}</li>
            </ol>
            <p className="catalognote">{t('catalog.note')}</p>
            {message.text && (
                <p id="catalog-message" className={'authmsg ' + (message.kind === 'ok' ? 'info' : 'error')} role="status">
                    {message.text}
                </p>
            )}
        </section>
    )
}
