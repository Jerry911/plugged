// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The accounts on the Account page (administrators only): those waiting for approval first.
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {fullName} from './names.js'

export default function UsersPanel({users, groups, currentUser, busy, actions}) {
    const {t, locale} = useTranslation()
    const date = (iso) => (iso ? new Date(iso).toLocaleDateString(locale) : '')
    const moment = (iso) => new Date(iso).toLocaleString(locale, {dateStyle: 'short', timeStyle: 'short'})
    const groupsOf = (user) => groups.filter((group) => group.members.some((member) => member.id === user.id)).map((group) => group.name)
    const waiting = users.filter((user) => !user.approved).length
    return (
        <section id="admin-users" className="adminsection">
            <p>{t('users.intro')}</p>
            <p id="users-pending" className="userspending">
                {waiting ? t('users.pending', {count: waiting}) : t('users.nonePending')}
            </p>
            <table className="userstable">
                <thead>
                    <tr>
                        <th>{t('users.name')}</th>
                        <th>{t('users.email')}</th>
                        <th>{t('users.groups')}</th>
                        <th>{t('users.registered')}</th>
                        <th>{t('users.lastLogin')}</th>
                        <th>{t('users.status')}</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {users.map((user) => {
                        const self = user.id === currentUser.id
                        return (
                            <tr key={user.id} id={'users-row-' + user.id} className={user.approved ? '' : 'waiting'}>
                                <td>
                                    {fullName(user)}
                                    {self && <span className="usersyou"> {t('users.you')}</span>}
                                </td>
                                <td>{user.email}</td>
                                <td id={'users-groups-' + user.id} className="usersgroups">
                                    {groupsOf(user).join(', ') || '—'}
                                </td>
                                <td>{date(user.created)}</td>
                                <td id={'users-login-' + user.id} className="userslogin" title={t('users.loginCount', {count: user.loginCount || 0})}>
                                    {user.lastLogin ? (
                                        <>
                                            {moment(user.lastLogin)}
                                            <small> · {user.loginCount}×</small>
                                        </>
                                    ) : (
                                        <i>{t('users.neverSignedIn')}</i>
                                    )}
                                </td>
                                <td>
                                    <span id={'users-status-' + user.id} className={'userstag ' + (user.admin ? 'admin' : user.approved ? 'approved' : 'waiting')}>
                                        {t(user.admin ? (user.primary ? 'users.statusPrimary' : 'users.statusAdmin') : user.approved ? 'users.statusApproved' : 'users.statusWaiting')}
                                    </span>
                                    {user.lockedUntil && (
                                        <span id={'users-locked-' + user.id} className="userstag waiting" title={t('users.lockedTitle', {time: moment(user.lockedUntil)})}>
                                            {' '}
                                            🔒 {t('users.locked')}
                                        </span>
                                    )}
                                </td>
                                <td className="usersactions">
                                    {user.lockedUntil && (
                                        <button id={'users-unlock-' + user.id} disabled={busy} onClick={() => actions.unlock(user)}>
                                            {t('users.unlock')}
                                        </button>
                                    )}
                                    {!user.approved && (
                                        <button id={'users-approve-' + user.id} className="accent" disabled={busy} onClick={() => actions.approve(user)}>
                                            ✓ {t('users.approve')}
                                        </button>
                                    )}
                                    {user.approved && !self && !user.primary && (
                                        <button id={'users-password-' + user.id} disabled={busy} title={t('users.resetPasswordTitle')} onClick={() => actions.resetPassword(user)}>
                                            🔑 {t('users.resetPassword')}
                                        </button>
                                    )}
                                    {user.approved && !user.admin && (
                                        <button id={'users-promote-' + user.id} disabled={busy} title={t('users.makeAdminTitle')} onClick={() => actions.setAdmin(user, true)}>
                                            {t('users.makeAdmin')}
                                        </button>
                                    )}
                                    {user.admin && !self && !user.primary && (
                                        <button id={'users-demote-' + user.id} disabled={busy} title={t('users.makeUserTitle')} onClick={() => actions.setAdmin(user, false)}>
                                            {t('users.makeUser')}
                                        </button>
                                    )}
                                    {!user.admin && (
                                        <button id={'users-delete-' + user.id} className="danger" disabled={busy} onClick={() => actions.remove(user)}>
                                            {t(user.approved ? 'users.delete' : 'users.reject')}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </section>
    )
}
