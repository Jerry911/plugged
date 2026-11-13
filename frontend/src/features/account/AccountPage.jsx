// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Account page (the Account button of the top bar), for every user: Mijn account (password, download the data, remove the account;
// AccountPanel.jsx). An administrator also manages here the accounts of everyone (approve a registration, make an account administrator
// or an ordinary user again, unlock it, give a temporary password, remove it), the groups of coworkers (create, rename, remove, choose the
// members) and the standard symbols for the next release (SymbolsPanel.jsx). Those tabs, and the requests behind them, only exist for an
// administrator. A project shared with a group can be opened and saved by its members (see ProjectMenu.jsx).
import {useCallback, useEffect, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {
    addGroupMember,
    approveUser,
    unlockUser,
    resetUserPassword,
    createGroup,
    deleteGroup,
    deleteUser,
    fetchGroups,
    fetchUsers,
    removeGroupMember,
    renameGroup,
    setGroupEducational,
    setGroupOwner,
    setUserAdmin,
} from '../../api/authApi.js'
import UsersPanel from '../admin/UsersPanel.jsx'
import GroupsPanel from '../admin/GroupsPanel.jsx'
import SymbolsPanel from '../admin/SymbolsPanel.jsx'
import {fullName} from '../admin/names.js'
import AccountPanel from './AccountPanel.jsx'

/**
 * `currentUser` = the signed-in user; `onDeleted()` after he removed his own account. For an administrator `onUsersChange(users)` is told
 * the accounts after every change (the top bar counts the waiting ones) and `initialSection` chooses the first tab ('users' when someone waits).
 */
export default function AccountPage({currentUser, onDeleted, onUsersChange, initialSection = 'account'}) {
    const {t} = useTranslation()
    const admin = !!currentUser.admin
    const [section, setSection] = useState(admin ? initialSection : 'account'),
        [users, setUsers] = useState(null),
        [groups, setGroups] = useState(null),
        [failed, setFailed] = useState(false),
        [message, setMessage] = useState({kind: '', text: ''}),
        [busy, setBusy] = useState(false)
    const load = useCallback(async () => {
        if (!admin) return
        try {
            const [userList, groupList] = await Promise.all([fetchUsers(), fetchGroups()])
            setUsers(userList)
            setGroups(groupList)
            setFailed(false)
            onUsersChange?.(userList)
        } catch {
            setFailed(true)
        }
    }, [admin, onUsersChange])
    useEffect(() => {
        load()
    }, [load])
    /** Runs a change ({ok, error}); on success says `done` (a key with its parameters), then reloads both lists. */
    const run = async (action, done, params) => {
        setBusy(true)
        const result = await action()
        setBusy(false)
        setMessage(result.ok ? {kind: 'ok', text: t(done, params)} : {kind: 'error', text: result.error})
        await load()
        return result.ok
    }
    const waiting = users ? users.filter((user) => !user.approved).length : 0
    const actions = {
        approve: (user) => run(() => approveUser(user.id), 'users.approved', {name: fullName(user)}),
        unlock: (user) => run(() => unlockUser(user.id), 'users.unlocked', {name: fullName(user)}),
        // the temporary password is shown once, in the message, for the administrator to pass on
        resetPassword: async (user) => {
            if (!window.confirm(t('users.confirmReset', {name: fullName(user)}))) return false
            setBusy(true)
            const result = await resetUserPassword(user.id)
            setBusy(false)
            setMessage(result.ok ? {kind: 'ok', text: t('users.temporaryPassword', {name: fullName(user), password: result.user.password})} : {kind: 'error', text: result.error})
            await load()
            return result.ok
        },
        setAdmin: (user, admin) => run(() => setUserAdmin(user.id, admin), admin ? 'users.madeAdmin' : 'users.madeUser', {name: fullName(user)}),
        remove: (user) => {
            if (window.confirm(t(user.approved ? 'users.confirmDelete' : 'users.confirmReject', {name: fullName(user), email: user.email})))
                return run(() => deleteUser(user.id), user.approved ? 'users.deleted' : 'users.rejected', {name: fullName(user)})
        },
        createGroup: (name) => run(() => createGroup(name), 'groups.created', {name: name.trim()}),
        renameGroup: (group) => {
            const name = window.prompt(t('groups.renamePrompt'), group.name)
            if (name !== null && name.trim() !== group.name) return run(() => renameGroup(group.id, name), 'groups.renamed', {name: name.trim()})
        },
        deleteGroup: (group) => {
            if (window.confirm(t('groups.confirmDelete', {name: group.name}))) return run(() => deleteGroup(group.id), 'groups.deleted', {name: group.name})
        },
        addMember: (group, user) => run(() => addGroupMember(group.id, user.id), 'groups.memberAdded', {name: fullName(user), group: group.name}),
        removeMember: (group, user) => run(() => removeGroupMember(group.id, user.id), 'groups.memberRemoved', {name: fullName(user), group: group.name}),
        setOwner: (group, user, owner) => run(() => setGroupOwner(group.id, user.id, owner), owner ? 'groups.ownerAdded' : 'groups.ownerRemoved', {name: fullName(user), group: group.name}),
        setEducational: (group, on) => run(() => setGroupEducational(group.id, on), on ? 'educational.switchedOn' : 'educational.switchedOff', {group: group.name}),
    }
    return (
        <div id="account-page" className="adminpage">
            <div className="adminhead">
                <h1>{t(admin ? 'account.pageAdmin' : 'account.title')}</h1>
                {admin && section !== 'account' && (
                    <button id="admin-reload" onClick={load}>
                        ↻ {t('admin.reload')}
                    </button>
                )}
            </div>
            {admin && (
                <nav className="admintabs" role="tablist" aria-label={t('account.pageAdmin')}>
                    <button id="account-tab-account" role="tab" aria-selected={section === 'account'} className={section === 'account' ? 'on' : ''} onClick={() => setSection('account')}>
                        {t('account.title')}
                    </button>
                    <button id="admin-tab-users" role="tab" aria-selected={section === 'users'} className={section === 'users' ? 'on' : ''} onClick={() => setSection('users')}>
                        {t('admin.users')}
                        {waiting > 0 && <span className="badge">{waiting}</span>}
                    </button>
                    <button id="admin-tab-groups" role="tab" aria-selected={section === 'groups'} className={section === 'groups' ? 'on' : ''} onClick={() => setSection('groups')}>
                        {t('admin.groups')}
                        {groups && <span className="admincount">{groups.length}</span>}
                    </button>
                    <button id="admin-tab-symbols" role="tab" aria-selected={section === 'symbols'} className={section === 'symbols' ? 'on' : ''} onClick={() => setSection('symbols')}>
                        {t('admin.symbols')}
                    </button>
                </nav>
            )}
            {section === 'account' && <AccountPanel user={currentUser} onDeleted={onDeleted} />}
            {admin && section !== 'account' && message.text && (
                <p id="admin-message" className={'authmsg ' + (message.kind === 'ok' ? 'info' : 'error')} role="status">
                    {message.text}
                </p>
            )}
            {admin && section !== 'account' && failed && (
                <p id="admin-failed" className="authmsg error">
                    {t('admin.loadFailed')}
                </p>
            )}
            {users && groups && section === 'users' && <UsersPanel users={users} groups={groups} currentUser={currentUser} busy={busy} actions={actions} />}
            {users && groups && section === 'groups' && <GroupsPanel users={users} groups={groups} busy={busy} actions={actions} />}
            {admin && section === 'symbols' && <SymbolsPanel />}
        </div>
    )
}
