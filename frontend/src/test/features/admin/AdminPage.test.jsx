// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Beheer: the accounts and the groups, against a backend that keeps them in memory.
import {fireEvent, render, waitFor} from '@testing-library/react'
import AdminPage from '../../../features/admin/AdminPage.jsx'
import {t} from '../../../i18n/translate.js'
import {byId, clickId, getById, typeInto} from '../../utils.jsx'

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})
const account = (id, name, extra = {}) => ({id, name, surname: 'X', email: name.toLowerCase() + '@example.be', admin: false, approved: true, created: '2026-11-03T10:00:00Z', primary: false, ...extra})
const ME = account(1, 'Jeroen', {admin: true, primary: true, lastLogin: '2026-11-04T14:11:00Z', loginCount: 3})

/** A backend with these accounts and groups; approving, roles, removing and the group calls change them. `fail` answers the next change with 409. */
const backend = (accounts, groupList = []) => {
    const state = {users: accounts.map((user) => ({...user})), groups: groupList.map((group) => ({...group})), fail: null, down: false}
    let nextGroupId = 100
    const member = (user) => ({id: user.id, name: user.name, surname: user.surname, email: user.email})
    global.fetch = vi.fn(async (url, options = {}) => {
        const method = options.method || 'GET',
            body = options.body ? JSON.parse(options.body) : null
        if (state.down) return json(null, 500)
        if (method !== 'GET' && state.fail) {
            const detail = state.fail
            state.fail = null
            return json({detail}, 409)
        }
        // copies, like a real server: the page must not share objects with the backend
        if (url === '/api/admin/symbols/catalog/changes') return json([])
        if (url === '/api/admin/users') return json(structuredClone(state.users))
        if (url === '/api/admin/groups' && method === 'GET') return json(structuredClone(state.groups))
        if (url === '/api/admin/groups') {
            const group = {id: nextGroupId++, name: body.name.trim(), created: null, members: []}
            state.groups.push(group)
            return json(group, 201)
        }
        let m = /^\/api\/admin\/users\/(\d+)(\/\w+)?$/.exec(url)
        if (m) {
            const id = Number(m[1]),
                user = state.users.find((candidate) => candidate.id === id)
            if (m[2] === '/approve') user.approved = true
            else if (m[2] === '/admin') Object.assign(user, {admin: body.admin, approved: user.approved || body.admin})
            else if (method === 'DELETE') state.users = state.users.filter((candidate) => candidate.id !== id)
            return method === 'DELETE' ? {ok: true, status: 204} : json(user)
        }
        m = /^\/api\/admin\/groups\/(\d+)(?:\/members\/(\d+))?$/.exec(url)
        if (m) {
            const group = state.groups.find((candidate) => candidate.id === Number(m[1]))
            if (m[2]) {
                const user = state.users.find((candidate) => candidate.id === Number(m[2]))
                group.members = method === 'PUT' ? [...group.members, member(user)] : group.members.filter((candidate) => candidate.id !== user.id)
            } else if (method === 'PUT') group.name = body.name.trim()
            else if (method === 'DELETE') state.groups = state.groups.filter((candidate) => candidate !== group)
            return method === 'DELETE' ? {ok: true, status: 204} : json(group)
        }
        return json(null, 404)
    })
    return state
}
const mount = async (props = {}) => {
    const result = render(<AdminPage currentUser={ME} {...props} />)
    await waitFor(() => getById('admin-users'))
    return result
}
const message = () => getById('admin-message')

describe('users', () => {
    test('waiting accounts first, with their groups; approving one', async () => {
        backend([account(2, 'Jan', {approved: false}), ME, account(3, 'Piet')], [{id: 7, name: 'Team', members: [{id: 3, name: 'Piet', surname: 'X', email: 'piet@example.be'}]}])
        const onUsersChange = vi.fn()
        await mount({onUsersChange})
        expect(getById('users-pending')).toHaveTextContent(t('users.pending', {count: 1}))
        expect(getById('users-status-2')).toHaveTextContent(t('users.statusWaiting'))
        expect(getById('users-status-1')).toHaveTextContent(t('users.statusPrimary'))
        expect(getById('users-groups-3')).toHaveTextContent('Team')
        expect(getById('users-groups-2')).toHaveTextContent('—')
        expect(getById('users-row-1')).toHaveTextContent(t('users.you'))
        // when each account last signed in, and how many times
        expect(getById('users-login-1')).toHaveTextContent('3×')
        expect(getById('users-login-1')).toHaveAttribute('title', t('users.loginCount', {count: 3}))
        expect(getById('users-login-1')).toHaveTextContent(new Date('2026-11-04T14:11:00Z').toLocaleString('nl-BE', {dateStyle: 'short', timeStyle: 'short'}))
        expect(getById('users-login-2')).toHaveTextContent(t('users.neverSignedIn'))
        expect(getById('users-login-2')).toHaveAttribute('title', t('users.loginCount', {count: 0}))
        expect(getById('admin-tab-users').querySelector('.badge')).toHaveTextContent('1')
        // the administrator himself: no buttons at all
        for (const id of ['users-approve-1', 'users-promote-1', 'users-demote-1', 'users-delete-1']) expect(byId(id)).toBeNull()
        // a waiting account is approved before it can become administrator
        expect(byId('users-promote-2')).toBeNull()
        clickId('users-approve-2')
        await waitFor(() => expect(message()).toHaveTextContent(t('users.approved', {name: 'Jan X'})))
        await waitFor(() => expect(getById('users-status-2')).toHaveTextContent(t('users.statusApproved')))
        expect(getById('users-pending')).toHaveTextContent(t('users.nonePending'))
        expect(onUsersChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({id: 2, approved: true})]))
    })

    test('an account becomes administrator and an ordinary user again; another administrator cannot be removed', async () => {
        backend([ME, account(3, 'Piet')])
        await mount()
        clickId('users-promote-3')
        await waitFor(() => expect(message()).toHaveTextContent(t('users.madeAdmin', {name: 'Piet X'})))
        await waitFor(() => expect(getById('users-status-3')).toHaveTextContent(t('users.statusAdmin')))
        expect(byId('users-delete-3')).toBeNull()
        clickId('users-demote-3')
        await waitFor(() => expect(message()).toHaveTextContent(t('users.madeUser', {name: 'Piet X'})))
        await waitFor(() => getById('users-promote-3'))
    })

    test('the primary administrator cannot be made an ordinary user', async () => {
        const other = {...ME, id: 5, name: 'Other', primary: false}
        backend([{...ME, id: 9, name: 'Hoofd'}, other])
        render(<AdminPage currentUser={other} />)
        await waitFor(() => getById('users-row-9'))
        expect(byId('users-demote-9')).toBeNull()
        expect(byId('users-demote-5')).toBeNull() // himself
    })

    test('a registration is turned down, an account removed, after confirming; a refusal is shown', async () => {
        const state = backend([ME, account(2, 'Jan', {approved: false}), account(3, 'Piet')])
        await mount()
        expect(getById('users-delete-2')).toHaveTextContent(t('users.reject'))
        window.confirm = vi.fn(() => false)
        clickId('users-delete-2')
        expect(window.confirm).toHaveBeenCalledWith(t('users.confirmReject', {name: 'Jan X', email: 'jan@example.be'}))
        window.confirm = vi.fn(() => true)
        clickId('users-delete-2')
        await waitFor(() => expect(byId('users-row-2')).toBeNull())
        expect(message()).toHaveTextContent(t('users.rejected', {name: 'Jan X'}))
        clickId('users-delete-3')
        expect(window.confirm).toHaveBeenLastCalledWith(t('users.confirmDelete', {name: 'Piet X', email: 'piet@example.be'}))
        await waitFor(() => expect(byId('users-row-3')).toBeNull())
        expect(message()).toHaveTextContent(t('users.deleted', {name: 'Piet X'}))
        state.fail = 'Nee'
        state.users.push(account(4, 'Joke'))
        clickId('admin-reload')
        await waitFor(() => getById('users-promote-4'))
        clickId('users-promote-4')
        await waitFor(() => expect(message()).toHaveTextContent('Nee'))
        expect(message()).toHaveClass('error')
    })

    test('the lists cannot be loaded; Vernieuwen tries again', async () => {
        const state = backend([ME])
        state.down = true
        render(<AdminPage currentUser={ME} />)
        await waitFor(() => expect(getById('admin-failed')).toHaveTextContent(t('admin.loadFailed')))
        expect(byId('admin-users')).toBeNull()
        state.down = false
        clickId('admin-reload')
        await waitFor(() => getById('admin-users'))
        expect(byId('admin-failed')).toBeNull()
    })
})

describe('groups', () => {
    const openGroups = async () => {
        await mount()
        clickId('admin-tab-groups')
        return getById('admin-groups')
    }

    test('a group is created, renamed and removed', async () => {
        const state = backend([ME])
        await openGroups()
        expect(getById('groups-empty')).toHaveTextContent(t('groups.empty'))
        expect(getById('groups-create')).toBeDisabled()
        typeInto('groups-new-name', ' Team Gent ')
        fireEvent.submit(getById('groups-create-form'))
        await waitFor(() => getById('group-100'))
        expect(message()).toHaveTextContent(t('groups.created', {name: 'Team Gent'}))
        expect(getById('groups-new-name')).toHaveValue('')
        expect(getById('group-100')).toHaveTextContent(t('groups.noMembers'))
        // a name that is taken: the message of the server, the typed name stays
        state.fail = 'Er bestaat al een groep'
        typeInto('groups-new-name', 'team gent')
        fireEvent.submit(getById('groups-create-form'))
        await waitFor(() => expect(message()).toHaveTextContent('Er bestaat al een groep'))
        expect(getById('groups-new-name')).toHaveValue('team gent')
        typeInto('groups-new-name', '  ')
        fireEvent.submit(getById('groups-create-form'))
        // rename: cancelled, unchanged, then changed
        window.prompt = vi.fn(() => null)
        clickId('group-rename-100')
        window.prompt = vi.fn(() => 'Team Gent')
        clickId('group-rename-100')
        window.prompt = vi.fn(() => 'Team Brugge')
        clickId('group-rename-100')
        expect(window.prompt).toHaveBeenCalledWith(t('groups.renamePrompt'), 'Team Gent')
        await waitFor(() => expect(getById('group-100')).toHaveTextContent('Team Brugge'))
        expect(message()).toHaveTextContent(t('groups.renamed', {name: 'Team Brugge'}))
        // remove, after confirming
        window.confirm = vi.fn(() => false)
        clickId('group-delete-100')
        getById('group-100')
        window.confirm = vi.fn(() => true)
        clickId('group-delete-100')
        await waitFor(() => expect(byId('group-100')).toBeNull())
        expect(window.confirm).toHaveBeenCalledWith(t('groups.confirmDelete', {name: 'Team Brugge'}))
        expect(message()).toHaveTextContent(t('groups.deleted', {name: 'Team Brugge'}))
    })

    test('members are added from the approved accounts and removed again', async () => {
        backend([ME, account(2, 'Jan', {approved: false}), account(3, 'Piet'), account(4, 'Joke')], [{id: 7, name: 'Team', created: null, members: []}])
        await openGroups()
        const options = () => [...getById('group-7-candidate').options].map((option) => option.value)
        // waiting accounts cannot be chosen
        expect(options()).toEqual(['', '1', '3', '4'])
        expect(getById('group-7-add')).toBeDisabled()
        fireEvent.change(getById('group-7-candidate'), {target: {value: '3'}})
        clickId('group-7-add')
        await waitFor(() => getById('group-7-remove-3'))
        expect(message()).toHaveTextContent(t('groups.memberAdded', {name: 'Piet X', group: 'Team'}))
        expect(options()).toEqual(['', '1', '4'])
        expect(getById('group-7-candidate')).toHaveValue('')
        clickId('group-7-remove-3')
        await waitFor(() => expect(byId('group-7-remove-3')).toBeNull())
        expect(message()).toHaveTextContent(t('groups.memberRemoved', {name: 'Piet X', group: 'Team'}))
        // the users tab shows the group of a member
        fireEvent.change(getById('group-7-candidate'), {target: {value: '4'}})
        clickId('group-7-add')
        await waitFor(() => getById('group-7-remove-4'))
        clickId('admin-tab-users')
        expect(getById('users-groups-4')).toHaveTextContent('Team')
        expect(getById('admin-tab-groups')).toHaveTextContent('1')
    })

    test('no add field when every approved account is already a member', async () => {
        backend([ME], [{id: 7, name: 'Team', created: null, members: [{id: 1, name: 'Jeroen', surname: 'X', email: 'jeroen@example.be'}]}])
        await openGroups()
        getById('group-7-remove-1')
        expect(byId('group-7-candidate')).toBeNull()
        // choosing nothing adds nothing
    })
})

test('Symbolen: the standard symbols for the next release', async () => {
    backend([ME])
    await mount()
    clickId('admin-tab-symbols')
    expect(getById('admin-tab-symbols')).toHaveClass('on')
    await waitFor(() => getById('catalog-no-changes'))
    expect(byId('admin-users')).toBeNull()
})
