// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Kaderinfo: the fields of the title block at the bottom of every sheet (project.footer), and the measurements for the inspection
// (keuring): earth resistance, insulation resistance and the day they were measured, printed in the title block and at the earth symbol.
import {useTranslation} from '../../i18n/I18nProvider.jsx'

/** The footer fields in the order of the form; the labels are in the translations (footer.fields.<key>). */
export const FOOTER_FIELDS = [
    'ean',
    'straat',
    'nr',
    'postcode',
    'gemeente',
    'eigenaar',
    'tekenaar',
    'datum',
    'schaal',
    'rev',
    'dossier',
    'stelsel',
]
/** The measurements for the inspection, also in project.footer: earth resistance (Ω), insulation resistance (MΩ), measured on. */
export const MEASUREMENT_FIELDS = ['aardingsweerstand', 'isolatieweerstand', 'meetdatum']
const NUMBER_FIELDS = new Set(['aardingsweerstand', 'isolatieweerstand'])

export const FooterForm = ({project, setProject, focus}) => {
    const {t} = useTranslation()
    const input = (field) => (
        <div key={field}>
            <label htmlFor={'footer-' + field}>{t('footer.fields.' + field)}</label>
            <input
                id={'footer-' + field}
                autoFocus={focus === field}
                data-tour={'footer-' + field}
                inputMode={NUMBER_FIELDS.has(field) ? 'decimal' : undefined}
                value={project.footer[field] || ''}
                onChange={(event) => setProject({...project, footer: {...project.footer, [field]: event.target.value}})}
            />
        </div>
    )
    return (
        <>
            <div className="form">{FOOTER_FIELDS.map(input)}</div>
            <p className="footer-group" style={{margin: '10px 0 4px'}}>
                <b>{t('footer.measurements')}</b> <small>{t('footer.measurementsHint')}</small>
            </p>
            <div id="footer-measurements" className="form">
                {MEASUREMENT_FIELDS.map(input)}
            </div>
        </>
    )
}

export const FooterDialog = ({project, setProject, focus, onClose}) => {
    const {t} = useTranslation()
    return (
        <div id="footer-dialog" className="dlg ui" role="dialog" aria-label={t('footer.title')} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
            <div className="tb">
                <b>{t('footer.heading')}</b>{' '}
                <button id="footer-close" className="sheetInfoBtn" title={t('common.close')} onClick={onClose}>
                    ✕
                </button>
            </div>
            <FooterForm project={project} setProject={setProject} focus={focus} />
        </div>
    )
}
