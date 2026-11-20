// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Mijn account: the signed-in user chooses the colours of the interface (the theme), changes his password, downloads everything that is
// stored about and by him (GDPR) and removes his account. The first tab of the Account page (AccountPage.jsx), for every user.
import {useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {deleteMyAccount, exportMyData, saveTheme} from '../../api/authApi.js'
import {applyTheme, DEFAULT_THEME, THEMES} from '../../app/theme.js'
import {ChangePasswordForm, Field, Message, useSubmit} from '../auth/AuthScreens.jsx'
import Icon from '../../components/Icon.jsx'

/**
 * `user` the signed-in user ({primary}: the primary administrator cannot remove his account); `onDeleted()` after the account
 * was removed (the editor then signs out).
 */
export default function AccountPanel({user, onDeleted}) {
    const {t} = useTranslation()
    const [exportResult, setExportResult] = useState(null),
        [exporting, setExporting] = useState(false),
        [confirmPassword, setConfirmPassword] = useState(''),
        [confirmed, setConfirmed] = useState(false),
        [theme, setTheme] = useState(() => document.documentElement.dataset.theme || DEFAULT_THEME),
        [themeError, setThemeError] = useState('')
    const {busy, error, submit} = useSubmit()
    // the new colours show at once; the server keeps them for the next sign-in, on any device
    const chooseTheme = async (name) => {
        setTheme(applyTheme(name))
        const result = await saveTheme(name)
        setThemeError(result.ok ? '' : result.error)
    }
    const download = async () => {
        setExporting(true)
        setExportResult(await exportMyData())
        setExporting(false)
    }
    const remove = (event) =>
        submit(event, async () => {
            const result = await deleteMyAccount(confirmPassword)
            if (result.ok) onDeleted()
            return result
        })
    const initials = ((user.name || '').charAt(0) + (user.surname || '').charAt(0)).toUpperCase() || '?',
        role = user.admin ? (user.primary ? 'users.statusPrimary' : 'users.statusAdmin') : 'account.roleUser'
    return (
        <div id="account-panel" className="accountpanel">
            <div className="accountcard accounthead">
                <span className="accountavatar" aria-hidden="true">
                    {initials}
                </span>
                <div id="account-who" className="accountwho">
                    <b>
                        {user.name} {user.surname}
                    </b>
                    <span className="accountmail"> · {user.email}</span>
                </div>
                <span id="account-role" className={'userstag ' + (user.admin ? 'admin' : 'approved')}>
                    {t(role)}
                </span>
            </div>
            <section id="account-theme" className="accountcard">
                <h3>
                    <Icon name="palette" size={18} /> {t('account.theme.title')}
                </h3>
                <p>{t('account.theme.text')}</p>
                <div className="themechoices" role="radiogroup" aria-label={t('account.theme.title')}>
                    {THEMES.map((name) => (
                        <label key={name} className={'themechoice' + (theme === name ? ' on' : '')}>
                            <input type="radio" id={'account-theme-' + name} name="theme" value={name} checked={theme === name} onChange={() => chooseTheme(name)} />
                            <span className={'themepreview preview-' + name} aria-hidden="true">
                                <span className="tp-bar">
                                    <span className="tp-tab" />
                                    <span className="tp-tab on" />
                                    <span className="tp-tab" />
                                </span>
                                <span className="tp-body">
                                    <span className="tp-panel" />
                                    <span className="tp-sheet" />
                                </span>
                            </span>
                            <span className="themename">
                                <b>{t('account.theme.names.' + name)}</b>
                                <small>{t('account.theme.descriptions.' + name)}</small>
                            </span>
                        </label>
                    ))}
                </div>
                <Message id="account-theme-error" kind="error" text={themeError} />
            </section>
            <div className="accountgrid">
                <section className="accountcard">
                    <h3>
                        <Icon name="key" size={18} /> {t('account.changePassword')}
                    </h3>
                    <ChangePasswordForm />
                </section>
                <div className="accountcolumn">
                    <section className="accountcard">
                        <h3>
                            <Icon name="download" size={18} /> {t('account.exportTitle')}
                        </h3>
                        <p>{t('account.exportText')}</p>
                        <button id="account-export" className="accent" disabled={exporting} onClick={download}>
                            {t('account.export')}
                        </button>
                        <Message id="account-export-error" kind="error" text={exportResult && !exportResult.ok ? exportResult.error : ''} />
                    </section>
                    <section className="accountcard danger-zone">
                        <h3>
                            <Icon name="delete" size={18} /> {t('account.deleteTitle')}
                        </h3>
                    {user.primary ? (
                        <p id="account-delete-primary">{t('account.deletePrimary')}</p>
                    ) : (
                        <form id="account-delete-form" className="passwordform" onSubmit={remove} noValidate>
                            <p>{t('account.deleteText')}</p>
                            <label className="pm-check">
                                <input id="account-delete-confirm" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{' '}
                                {t('account.deleteConfirm')}
                            </label>
                            <Field id="account-delete-password" type="password" label={t('auth.password')} value={confirmPassword} onChange={setConfirmPassword} autoComplete="current-password" />
                            <Message id="account-delete-error" kind="error" text={error} />
                            <button id="account-delete" type="submit" className="accent" disabled={busy || !confirmed || !confirmPassword}>
                                {t('account.delete')}
                            </button>
                        </form>
                    )}
                    </section>
                </div>
            </div>
        </div>
    )
}
