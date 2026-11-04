// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {render, waitFor} from '@testing-library/react'
import UsersPage from '../../../features/users/UsersPage.jsx'
import {t} from '../../../i18n/translate.js'
import {byId, clickId, getById} from '../../utils.jsx'

const ADMIN = {id: 1, name: 'Jeroen', surname: 'Pleysier', email: 'admin@example.be', admin: true, approved: true, created: '2026-11-01T10:00:00Z'}
const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})

/** A backend that keeps the accounts: approving and deleting change them. */
const backend = (accounts) => {
    let users = accounts.map((user) => ({...user}))
    global.fetch = vi.fn(async (url, options = {}) => {
        const method = options.method || 'GET'
        if (url === '/api/admin/users') return json(users)
        const id = Number(url.split('/')[4])
        if (url.endsWith('/approve')) {
            users = users.map((user) => (user.id === id ? {...user, approved: true} : user))
            return json(users.find((user) => user.id === id))
        }
        if (method === 'DELETE') {
            if (users.find((user) => user.id === id)?.admin) return json({detail: 'De beheerder kan niet verwijderd worden'}, 409)
            users = users.filter((user) => user.id !== id)
            return {ok: true, status: 204}
        }
        return json(null, 404)
    })
}
const user = (id, name, approved) => ({id, name, surname: 'X', email: name.toLowerCase() + '@example.be', admin: false, approved, created: '2026-11-03T10:00:00Z'})

test('lists the accounts, the ones waiting first, and approves one', async () => {
    backend([user(2, 'Jan', false), ADMIN])
    const onChange = vi.fn()
    render(<UsersPage currentUser={ADMIN} onChange={onChange} />)
    await waitFor(() => getById('users-row-2'))
    expect(getById('users-pending')).toHaveTextContent(t('users.pending', {count: 1}))
    expect(getById('users-status-2')).toHaveTextContent(t('users.statusWaiting'))
    expect(getById('users-status-1')).toHaveTextContent(t('users.statusAdmin'))
    expect(getById('users-row-1')).toHaveTextContent(t('users.you'))
    // the administrator can be neither approved nor removed
    expect(byId('users-approve-1')).toBeNull()
    expect(byId('users-delete-1')).toBeNull()
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({id: 2, approved: false})]))
    clickId('users-approve-2')
    await waitFor(() => expect(getById('users-message')).toHaveTextContent(t('users.approved', {name: 'Jan X'})))
    await waitFor(() => expect(getById('users-status-2')).toHaveTextContent(t('users.statusApproved')))
    expect(byId('users-approve-2')).toBeNull()
    expect(getById('users-pending')).toHaveTextContent(t('users.nonePending'))
    expect(getById('users-delete-2')).toHaveTextContent(t('users.delete'))
})

test('a registration is turned down, an account removed, after confirming', async () => {
    backend([user(2, 'Jan', false), user(3, 'Piet', true), ADMIN])
    render(<UsersPage currentUser={ADMIN} />)
    await waitFor(() => getById('users-row-2'))
    expect(getById('users-delete-2')).toHaveTextContent(t('users.reject'))
    window.confirm = vi.fn(() => false)
    clickId('users-delete-2')
    expect(window.confirm).toHaveBeenCalledWith(t('users.confirmReject', {name: 'Jan X', email: 'jan@example.be'}))
    getById('users-row-2')
    window.confirm = vi.fn(() => true)
    clickId('users-delete-2')
    await waitFor(() => expect(byId('users-row-2')).toBeNull())
    expect(getById('users-message')).toHaveTextContent(t('users.rejected', {name: 'Jan X'}))
    clickId('users-delete-3')
    expect(window.confirm).toHaveBeenLastCalledWith(t('users.confirmDelete', {name: 'Piet X', email: 'piet@example.be'}))
    await waitFor(() => expect(byId('users-row-3')).toBeNull())
    expect(getById('users-message')).toHaveTextContent(t('users.deleted', {name: 'Piet X'}))
})

test('a refusal of the backend is shown', async () => {
    // an account the page shows as an ordinary one, but the backend knows better
    backend([{...user(4, 'Raar', true), admin: true}])
    render(<UsersPage currentUser={ADMIN} />)
    await waitFor(() => getById('users-row-4'))
    global.fetch.mockImplementationOnce(async () => json({detail: 'Gebruiker niet gevonden: 4'}, 404))
    clickId('users-reload')
    await waitFor(() => getById('users-failed'))
    clickId('users-reload')
    await waitFor(() => expect(byId('users-failed')).toBeNull())
})

test('approving that fails shows the message of the backend', async () => {
    backend([user(2, 'Jan', false)])
    render(<UsersPage currentUser={ADMIN} />)
    await waitFor(() => getById('users-row-2'))
    global.fetch.mockImplementationOnce(async () => json({detail: 'Gebruiker niet gevonden: 2'}, 404))
    clickId('users-approve-2')
    await waitFor(() => expect(getById('users-message')).toHaveTextContent('Gebruiker niet gevonden: 2'))
})

test('the list cannot be loaded', async () => {
    global.fetch = vi.fn(async () => json(null, 500))
    render(<UsersPage currentUser={ADMIN} />)
    await waitFor(() => expect(getById('users-failed')).toHaveTextContent(t('users.loadFailed')))
    expect(byId('users-pending')).toBeNull()
})
