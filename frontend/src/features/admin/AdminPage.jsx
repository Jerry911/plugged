// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Beheer, for administrators: the accounts (approve a registration, make an account administrator or an ordinary user again, remove it)
// and the groups of coworkers (create, rename, remove, choose the members). A project shared with a group can be opened and saved by its
// members (see ProjectMenu.jsx).
import {useCallback, useEffect, useState} from 'react'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {
    addGroupMember,
    approveUser,
    createGroup,
    deleteGroup,
    deleteUser,
    fetchGroups,
    fetchUsers,
    removeGroupMember,
    renameGroup,
    setUserAdmin,
} from '../../api/authApi.js'
import UsersPanel from './UsersPanel.jsx'
import GroupsPanel from './GroupsPanel.jsx'
import {fullName} from './names.js'

/** `currentUser` = the administrator; `onUsersChange(users)` is told the accounts after every change (the top bar counts the waiting ones). */
export default function AdminPage({currentUser, onUsersChange}) {
    const {t} = useTranslation()
    const [section, setSection] = useState('users'),
        [users, setUsers] = useState(null),
        [groups, setGroups] = useState(null),
        [failed, setFailed] = useState(false),
        [message, setMessage] = useState({kind: '', text: ''}),
        [busy, setBusy] = useState(false)
    const load = useCallback(async () => {
        try {
            const [userList, groupList] = await Promise.all([fetchUsers(), fetchGroups()])
            setUsers(userList)
            setGroups(groupList)
            setFailed(false)
            onUsersChange?.(userList)
        } catch {
            setFailed(true)
        }
    }, [onUsersChange])
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
    }
    return (
        <div id="admin-page" className="adminpage">
            <div className="adminhead">
                <h1>{t('admin.title')}</h1>
                <button id="admin-reload" onClick={load}>
                    ↻ {t('admin.reload')}
                </button>
            </div>
            <nav className="admintabs" role="tablist" aria-label={t('admin.title')}>
                <button id="admin-tab-users" role="tab" aria-selected={section === 'users'} className={section === 'users' ? 'on' : ''} onClick={() => setSection('users')}>
                    {t('admin.users')}
                    {waiting > 0 && <span className="badge">{waiting}</span>}
                </button>
                <button id="admin-tab-groups" role="tab" aria-selected={section === 'groups'} className={section === 'groups' ? 'on' : ''} onClick={() => setSection('groups')}>
                    {t('admin.groups')}
                    {groups && <span className="admincount">{groups.length}</span>}
                </button>
            </nav>
            {message.text && (
                <p id="admin-message" className={'authmsg ' + (message.kind === 'ok' ? 'info' : 'error')} role="status">
                    {message.text}
                </p>
            )}
            {failed && (
                <p id="admin-failed" className="authmsg error">
                    {t('admin.loadFailed')}
                </p>
            )}
            {users && groups && section === 'users' && <UsersPanel users={users} groups={groups} currentUser={currentUser} busy={busy} actions={actions} />}
            {users && groups && section === 'groups' && <GroupsPanel users={users} groups={groups} busy={busy} actions={actions} />}
        </div>
    )
}
