// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useState} from 'react'

// The file types the project can be exported as. Import needs no dialog: the file picker accepts all of them (IMPORT_ACCEPT)
// and importKind() decides from the name (or, failing that, the content) what kind of file was chosen.
export const EXPORT_TYPES = [
    {
        id: 'json',
        label: 'Projectbestand (.json)',
        hint: 'Het hele project: eendraadschema, situatieschema, kaderinfo en je eigen componenten. Te importeren in Plugged.',
    },
    {
        id: 'eds',
        label: 'Eendraadschema (.eds)',
        hint: 'Enkel het eendraadschema en het adres, om te openen in eendraadschema.goethals-jacobs.be. Het situatieschema wordt niet meegenomen.',
    },
]
export const IMPORT_ACCEPT = '.json,.eds'

/** 'eds' or 'json': by extension, and for a file without a known extension by the "EDS" header of the format. */
export const importKind = (name, text) => {
    const n = (name || '').toLowerCase()
    if (n.endsWith('.eds')) return 'eds'
    if (n.endsWith('.json')) return 'json'
    return String(text).startsWith('EDS') ? 'eds' : 'json'
}

export const ExportDialog = ({onExport, onClose}) => {
    const [type, setType] = useState(EXPORT_TYPES[0].id)
    return (
        <div id="export-dialog" className="dlg ui" role="dialog" aria-label="Exporteren" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
            <div className="tb">
                <b>Exporteren</b>
                <button id="export-close" className="sheetInfoBtn" title="Sluiten" onClick={onClose}>
                    ✕
                </button>
            </div>
            <p style={{margin: '6px 0'}}>Kies het bestandstype:</p>
            {EXPORT_TYPES.map((t) => (
                <label key={t.id} className={'exporttype' + (type === t.id ? ' on' : '')}>
                    <input
                        type="radio"
                        name="export-type"
                        id={'export-type-' + t.id}
                        autoFocus={type === t.id}
                        checked={type === t.id}
                        onChange={() => setType(t.id)}
                    />
                    <span>
                        <b>{t.label}</b>
                        <small>{t.hint}</small>
                    </span>
                </label>
            ))}
            <div className="tb" style={{marginTop: 8}}>
                <button id="export-confirm" className="accent" onClick={() => onExport(type)}>
                    Exporteer
                </button>{' '}
                <button id="export-cancel" onClick={onClose}>
                    Annuleer
                </button>
            </div>
        </div>
    )
}
