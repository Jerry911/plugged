// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'

// The file types the project can be exported as (labels and hints: export.types.<id>). Import needs no dialog: the file picker accepts all
// of them (IMPORT_ACCEPT) and importKind() decides from the name (or, failing that, the content) what kind of file was chosen.
export const EXPORT_TYPES = ['json', 'eds']
export const IMPORT_ACCEPT = '.json,.eds'

/** 'eds' or 'json': by extension, and for a file without a known extension by the "EDS" header of the format. */
export const importKind = (fileName, text) => {
    const name = (fileName || '').toLowerCase()
    if (name.endsWith('.eds')) return 'eds'
    if (name.endsWith('.json')) return 'json'
    return String(text).startsWith('EDS') ? 'eds' : 'json'
}

export function ExportDialog({onExport, onClose}) {
    const {t} = useTranslation()
    const [type, setType] = useState(EXPORT_TYPES[0])
    return (
        <div id="export-dialog" className="dlg ui" role="dialog" aria-label={t('export.title')} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
            <div className="tb">
                <b>{t('export.title')}</b>
                <button id="export-close" className="sheetInfoBtn" title={t('common.close')} onClick={onClose}>
                    ✕
                </button>
            </div>
            <p style={{margin: '6px 0'}}>{t('export.chooseType')}</p>
            {EXPORT_TYPES.map((id) => (
                <label key={id} className={'exporttype' + (type === id ? ' on' : '')}>
                    <input type="radio" name="export-type" id={'export-type-' + id} autoFocus={type === id} checked={type === id} onChange={() => setType(id)} />
                    <span>
                        <b>{t(`export.types.${id}.label`)}</b>
                        <small>{t(`export.types.${id}.hint`)}</small>
                    </span>
                </label>
            ))}
            <div className="tb" style={{marginTop: 8}}>
                <button id="export-confirm" className="accent" onClick={() => onExport(type)}>
                    {t('export.confirm')}
                </button>{' '}
                <button id="export-cancel" onClick={onClose}>
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    )
}
