// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The accounts, for the administrator: approve a registration (the account can sign in from then on) or remove an account.
import {useCallback, useEffect, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {approveUser, deleteUser, fetchUsers} from '../../api/authApi.js'

const fullName = (user) => `${user.name} ${user.surname}`

/** `currentUser` = the administrator; `onChange(users)` is told the list after every change (the top bar counts the waiting accounts). */
export default function UsersPage({currentUser, onChange}) {
    const {t, locale} = useTranslation()
    const [users, setUsers] = useState(null),
        [failed, setFailed] = useState(false),
        [message, setMessage] = useState({kind: '', text: ''}),
        [busyId, setBusyId] = useState(null)
    const load = useCallback(async () => {
        try {
            const list = await fetchUsers()
            setUsers(list)
            setFailed(false)
            onChange?.(list)
        } catch {
            setFailed(true)
        }
    }, [onChange])
    useEffect(() => {
        load()
    }, [load])
    const act = async (user, action, done) => {
        setBusyId(user.id)
        const result = await action(user.id)
        setBusyId(null)
        setMessage(result.ok ? {kind: 'ok', text: t(done, {name: fullName(user)})} : {kind: 'error', text: result.error})
        await load()
    }
    const approve = (user) => act(user, approveUser, 'users.approved')
    const remove = (user) => {
        if (window.confirm(t(user.approved ? 'users.confirmDelete' : 'users.confirmReject', {name: fullName(user), email: user.email})))
            act(user, deleteUser, user.approved ? 'users.deleted' : 'users.rejected')
    }
    const date = (iso) => (iso ? new Date(iso).toLocaleDateString(locale) : '')
    const pending = users ? users.filter((user) => !user.approved).length : 0
    return (
        <div id="users-page" className="userspage">
            <div className="usershead">
                <h1>{t('users.title')}</h1>
                <button id="users-reload" onClick={load}>
                    ↻ {t('users.reload')}
                </button>
            </div>
            <p>{t('users.intro')}</p>
            {message.text && (
                <p id="users-message" className={'authmsg ' + (message.kind === 'ok' ? 'info' : 'error')} role="status">
                    {message.text}
                </p>
            )}
            {failed && (
                <p id="users-failed" className="authmsg error">
                    {t('users.loadFailed')}
                </p>
            )}
            {users && (
                <>
                    <p id="users-pending" className="userspending">
                        {pending ? t('users.pending', {count: pending}) : t('users.nonePending')}
                    </p>
                    <table className="userstable">
                        <thead>
                            <tr>
                                <th>{t('users.name')}</th>
                                <th>{t('users.email')}</th>
                                <th>{t('users.registered')}</th>
                                <th>{t('users.status')}</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id} id={'users-row-' + user.id} className={user.approved ? '' : 'waiting'}>
                                    <td>
                                        {fullName(user)}
                                        {user.id === currentUser.id && <span className="usersyou"> {t('users.you')}</span>}
                                    </td>
                                    <td>{user.email}</td>
                                    <td>{date(user.created)}</td>
                                    <td>
                                        <span id={'users-status-' + user.id} className={'userstag ' + (user.admin ? 'admin' : user.approved ? 'approved' : 'waiting')}>
                                            {t(user.admin ? 'users.statusAdmin' : user.approved ? 'users.statusApproved' : 'users.statusWaiting')}
                                        </span>
                                    </td>
                                    <td className="usersactions">
                                        {!user.approved && (
                                            <button id={'users-approve-' + user.id} className="accent" disabled={busyId === user.id} onClick={() => approve(user)}>
                                                ✓ {t('users.approve')}
                                            </button>
                                        )}
                                        {!user.admin && (
                                            <button id={'users-delete-' + user.id} className="danger" disabled={busyId === user.id} onClick={() => remove(user)}>
                                                {t(user.approved ? 'users.delete' : 'users.reject')}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </div>
    )
}
