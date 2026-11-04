// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Kaderinfo: the fields of the title block at the bottom of every sheet (project.footer).
import {useTranslation} from '../../i18n/I18nProvider.jsx'

/** The footer fields in the order of the form; the labels are in the translations (footer.fields.<key>). */
export const FOOTER_FIELDS = [
    'titel',
    'straat',
    'nr',
    'postcode',
    'gemeente',
    'eigenaar',
    'ean',
    'tekenaar',
    'datum',
    'schaal',
    'rev',
    'dossier',
    'stelsel',
    'keurder',
]

export const FooterForm = ({project, setProject, focus}) => {
    const {t} = useTranslation()
    return (
        <div className="form">
            {FOOTER_FIELDS.map((field) => (
                <div key={field}>
                    <label htmlFor={'footer-' + field}>{t('footer.fields.' + field)}</label>
                    <input
                        id={'footer-' + field}
                        autoFocus={focus === field}
                        data-tour={'footer-' + field}
                        value={project.footer[field] || ''}
                        onChange={(event) => setProject({...project, footer: {...project.footer, [field]: event.target.value}})}
                    />
                </div>
            ))}
        </div>
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
