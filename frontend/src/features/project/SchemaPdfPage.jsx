// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The page a QR code on a circuit board opens (/?schema=<project number>), for anybody, without signing in: it fetches the newest saved
// version of the project (and the standard symbols to draw it with) and shows its sheets, with a button that builds the PDF from them on the
// spot (and one to print). The project is only read, never changed.
import {useEffect, useRef, useState} from 'react'
import {fetchPublicSchema, fetchPublicSymbols} from '../../api/publicApi.js'
import {setLibrary} from '../../symbols/symbolLibrary.js'
import {normalizeProject} from '../../app/projectDocument.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {AllSheets, makePdf} from './pdfExport.jsx'

export default function SchemaPdfPage({id, secret}) {
    const {t} = useTranslation()
    const [state, setState] = useState({status: 'loading'}), // loading | ready | notfound | error
        [busy, setBusy] = useState(false),
        [failure, setFailure] = useState(''),
        sheets = useRef()
    const load = () => {
        let live = true
        setState({status: 'loading'})
        Promise.all([fetchPublicSchema(id, secret), fetchPublicSymbols()])
            .then(([document, symbols]) => {
                if (!live) return
                setLibrary(symbols)
                setState(document ? {status: 'ready', project: normalizeProject(document)} : {status: 'notfound'})
            })
            .catch(() => live && setState({status: 'error'}))
        return () => {
            live = false
        }
    }
    useEffect(load, [id, secret])
    const title = state.project?.footer?.titel || state.project?.name || ''
    useEffect(() => {
        if (title) document.title = title
    }, [title])
    const pdf = async () => {
        setBusy(true)
        setFailure('')
        try {
            await makePdf(state.project, sheets.current)
        } catch (error) {
            setFailure(t('app.exportFailed', {reason: error.message}))
        } finally {
            setBusy(false)
        }
    }
    const toEditor = () => window.location.assign(window.location.pathname)
    if (state.status !== 'ready')
        return (
            <div id="schema-page" className="schema-page ui">
                <p id={'schema-' + state.status}>{t('schema.' + state.status, {number: id})}</p>
                {state.status === 'error' && (
                    <button id="schema-retry" onClick={load}>
                        {t('app.retry')}
                    </button>
                )}
                <button id="schema-editor" onClick={toEditor}>
                    {t('schema.toEditor')}
                </button>
            </div>
        )
    return (
        <div id="schema-page" className="schema-page">
            <div className="schema-bar ui">
                <b id="schema-title">{title || t('projects.defaultName', {number: id})}</b>
                <span className="bar-spacer" />
                <button id="schema-pdf" className="accent" disabled={busy} onClick={pdf}>
                    {t('app.pdf')}
                </button>
                <button id="schema-print" onClick={() => window.print()}>
                    {t('app.print')}
                </button>
                <button id="schema-editor" onClick={toEditor}>
                    {t('schema.toEditor')}
                </button>
            </div>
            {failure && (
                <p id="schema-failed" className="schema-note ui" role="alert">
                    {failure}
                </p>
            )}
            <p className="schema-note ui">{t('schema.latest', {number: id})}</p>
            <div ref={sheets}>
                <AllSheets project={state.project} className="schema-sheets" />
            </div>
        </div>
    )
}
