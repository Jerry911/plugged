// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Mijn account: the signed-in user changes his password, downloads everything that is stored about and by him (GDPR) and removes his
// account. The first tab of the Account page (AccountPage.jsx), for every user.
import {useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {deleteMyAccount, exportMyData} from '../../api/authApi.js'
import {ChangePasswordForm, Field, Message, useSubmit} from '../auth/AuthScreens.jsx'

/**
 * `user` the signed-in user ({primary}: the primary administrator cannot remove his account); `onDeleted()` after the account
 * was removed (the editor then signs out).
 */
export default function AccountPanel({user, onDeleted}) {
    const {t} = useTranslation()
    const [exportResult, setExportResult] = useState(null),
        [exporting, setExporting] = useState(false),
        [confirmPassword, setConfirmPassword] = useState(''),
        [confirmed, setConfirmed] = useState(false)
    const {busy, error, submit} = useSubmit()
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
    return (
        <div id="account-panel" className="accountpanel">
            <p id="account-who" style={{margin: '6px 0'}}>
                {user.name} {user.surname} · {user.email}
            </p>
            <section>
                <h3>{t('account.changePassword')}</h3>
                <ChangePasswordForm />
            </section>
            <section>
                <h3>{t('account.exportTitle')}</h3>
                <p style={{margin: '4px 0 8px'}}>{t('account.exportText')}</p>
                <button id="account-export" disabled={exporting} onClick={download}>
                    {t('account.export')}
                </button>
                <Message id="account-export-error" kind="error" text={exportResult && !exportResult.ok ? exportResult.error : ''} />
            </section>
            <section className="danger-zone">
                <h3>{t('account.deleteTitle')}</h3>
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
                        <button id="account-delete" type="submit" className="danger" disabled={busy || !confirmed || !confirmPassword}>
                            {t('account.delete')}
                        </button>
                    </form>
                )}
            </section>
        </div>
    )
}
