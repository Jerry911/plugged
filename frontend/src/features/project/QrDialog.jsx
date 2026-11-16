// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The QR code of a project, to print and stick on the circuit board. It holds the link to the PDF page (see schemaLink.js), not the PDF
// itself, so it stays valid when the schema changes: scanning it always shows the newest saved version.
import {useEffect, useMemo, useState} from 'react'
import {fetchQrKey, renewQrKey} from '../../api/projectApi.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {QUIET_ZONE, qrModules, qrSvgFile, schemaUrl} from './schemaLink.js'

/** The QR code of `text` as an inline SVG (black on white, with its quiet zone). */
export function QrCode({text, className, label}) {
    const {size, path} = useMemo(() => qrModules(text), [text]),
        full = size + 2 * QUIET_ZONE
    return (
        <svg className={className} viewBox={`0 0 ${full} ${full}`} role="img" aria-label={label} shapeRendering="crispEdges">
            <rect width={full} height={full} fill="#fff" />
            <path transform={`translate(${QUIET_ZONE} ${QUIET_ZONE})`} d={path} fill="#000" />
        </svg>
    )
}

/** Starts a download of `content` as a file. */
const download = (content, type, fileName) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], {type}))
    link.download = fileName
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
}

/** `projectId`: the stored project the code is for; `title`: what is printed under the code. */
export function QrDialog({projectId, title, onClose}) {
    const {t} = useTranslation()
    const [key, setKey] = useState(null), // the secret of the QR code of this project, from the server
        [error, setError] = useState(''),
        [busy, setBusy] = useState(false)
    const useKey = (result) => {
        if (result.ok && result.key) {
            setKey(result.key)
            setError('')
        } else setError(result.error || t('qr.keyFailed'))
    }
    useEffect(() => {
        let live = true
        setKey(null)
        fetchQrKey(projectId).then((result) => live && useKey(result))
        return () => {
            live = false
        }
    }, [projectId])
    const renew = async () => {
        if (!window.confirm(t('qr.confirmRenew'))) return
        setBusy(true)
        useKey(await renewQrKey(projectId))
        setBusy(false)
    }
    const url = key ? schemaUrl(projectId, key) : null,
        caption = title || t('projects.defaultName', {number: projectId})
    return (
        <>
            <div id="qr-dialog" className="dlg ui" role="dialog" aria-label={t('qr.title')} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
                <div className="tb">
                    <b>{t('qr.title')}</b>
                    <button id="qr-close" className="sheetInfoBtn" title={t('common.close')} onClick={onClose}>
                        ✕
                    </button>
                </div>
                <p style={{margin: '6px 0'}}>{t('qr.intro')}</p>
                {error && (
                    <p id="qr-error" className="pm-note error" role="alert">
                        {error}
                    </p>
                )}
                {!url && !error && (
                    <p id="qr-loading" className="pm-note">
                        {t('qr.loading')}
                    </p>
                )}
                {url && (
                    <>
                        <div className="qr-preview">
                            <QrCode text={url} label={t('qr.codeLabel', {name: caption})} />
                        </div>
                        <p id="qr-url" className="qr-url">
                            {url}
                        </p>
                    </>
                )}
                <p className="pm-note">{t('qr.addressNote')}</p>
                <div className="tb" style={{marginTop: 8}}>
                    <button id="qr-print" className="accent" autoFocus disabled={!url} onClick={() => window.print()}>
                        {t('qr.print')}
                    </button>{' '}
                    <button id="qr-download" disabled={!url} onClick={() => download(qrSvgFile(url), 'image/svg+xml', 'qr-' + projectId + '.svg')}>
                        {t('qr.downloadSvg')}
                    </button>{' '}
                    <button id="qr-renew" disabled={busy || !key} title={t('qr.renewTitle')} onClick={renew}>
                        {t('qr.renew')}
                    </button>{' '}
                    <button id="qr-cancel" onClick={onClose}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
            {/* what the print window prints (everything with class "ui" is hidden there, see print.css): the code with the name and number */}
            {url && (
                <div className="qr-print">
                    <QrCode text={url} />
                    <b>{caption}</b>
                    <span>{t('qr.printNumber', {number: projectId})}</span>
                </div>
            )}
        </>
    )
}
