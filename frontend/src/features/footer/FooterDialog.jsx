// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Kaderinfo: the fields of the title block at the bottom of every sheet (project.footer), and the measurements for the inspection
// (keuring): earth resistance, insulation resistance and the day they were measured, printed in the title block and at the earth symbol.
// The start of the work on site (a date, a month or a year) decides which rules of Controleer apply (model/installationDate.js).
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {formatDate, parseInstallationDate} from '../../model/installationDate.js'
import {rulesNotApplicable} from '../../model/rules.js'
import Icon from '../../components/Icon.jsx'

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
export const MEASUREMENT_FIELDS = ['aardingsweerstand', 'isolatieweerstand', 'meetdatum', 'netimpedantie']
const NUMBER_FIELDS = new Set(['aardingsweerstand', 'isolatieweerstand', 'netimpedantie'])
/** When the work on site started; not printed. */
export const INSTALLATION_FIELD = 'installatiedatum'

/** What the installation date is read as, and how many rules of Controleer it leaves out. */
const InstallationNote = ({project}) => {
    const {t} = useTranslation()
    const text = (project.footer[INSTALLATION_FIELD] || '').trim()
    if (!text) return <small id="footer-installation-note">{t('footer.installationEmpty')}</small>
    const period = parseInstallationDate(text)
    if (!period) return <small id="footer-installation-note" className="error">{t('footer.installationInvalid')}</small>
    const skipped = rulesNotApplicable(project).length,
        read = period.precision === 'day' ? formatDate(period.from) : t('footer.installationPeriod', {from: formatDate(period.from), to: formatDate(period.to)})
    return (
        <small id="footer-installation-note">
            {t('footer.installationRead', {date: read})} {skipped ? t('footer.installationSkips', {count: skipped}) : t('footer.installationAll')}
        </small>
    )
}

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
            <p className="footer-group" style={{margin: '10px 0 4px'}}>
                <b>{t('footer.installation')}</b> <small>{t('footer.installationHint')}</small>
            </p>
            <div id="footer-installation" className="form">
                {input(INSTALLATION_FIELD)}
                <InstallationNote project={project} />
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
                    <Icon name="close" />
                </button>
            </div>
            <FooterForm project={project} setProject={setProject} focus={focus} />
        </div>
    )
}
