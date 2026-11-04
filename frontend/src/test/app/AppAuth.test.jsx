// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The signed-in user in the editor: Afmelden in the top bar (no name: everybody knows who he is), Beheer for an administrator.
import {fireEvent, render, waitFor} from '@testing-library/react'
import App from '../../app/App.jsx'
import standard from '../fixtures/standardSymbols.js'
import {t} from '../../i18n/translate.js'
import {byId, clickId, getById} from '../utils.jsx'

vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))

const ADMIN = {id: 1, name: 'Jeroen', surname: 'Pleysier', email: 'admin@example.be', admin: true, approved: true}
const JAN = {id: 2, name: 'Jan', surname: 'Peeters', email: 'jan@example.be', admin: false, approved: false}
const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})
const backend = (user, users = [ADMIN, JAN], usersStatus = 200) => {
    global.fetch = vi.fn(async (url) => {
        if (url === '/api/auth/status') return json({setupRequired: false, adminEmail: ADMIN.email, user})
        if (url === '/api/symbols') return json(standard)
        if (url === '/api/admin/users') return json(users, usersStatus)
        if (url === '/api/admin/groups') return json([], usersStatus)
        if (url === '/api/projects/summaries') return json([])
        if (url === '/api/auth/logout') return {ok: true, status: 204}
        return json(null, 404)
    })
}
const mount = async () => {
    render(<App />)
    await waitFor(() => getById('tab-comp'))
}

test('the administrator sees how many accounts wait for approval and opens Beheer', async () => {
    backend(ADMIN)
    await mount()
    // no name in the top bar; the name is only in the tooltip of Afmelden
    expect(byId('user-name')).toBeNull()
    expect(getById('top-bar')).not.toHaveTextContent('Jeroen Pleysier')
    expect(getById('btn-logout')).toHaveAttribute('title', t('auth.logoutTitle', {name: 'Jeroen Pleysier'}))
    await waitFor(() => expect(getById('tab-admin-waiting')).toHaveTextContent('1'))
    clickId('tab-admin')
    await waitFor(() => getById('users-row-2'))
    expect(getById('tab-admin')).toHaveClass('on')
    getById('admin-tab-groups')
})

test('no badge when nobody waits, or when the list cannot be loaded', async () => {
    backend(ADMIN, [ADMIN], 500)
    await mount()
    getById('tab-admin')
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/admin/users', expect.anything()))
    expect(byId('tab-admin-waiting')).toBeNull()
})

// an unsaved change: the project gets a name
const rename = () => {
    fireEvent.click(getById('tab-project'))
    fireEvent.change(getById('project-name'), {target: {value: 'Woning Jan'}})
}

test('a user has no Beheer tab and signs out at once when everything is saved', async () => {
    backend({...JAN, approved: true})
    await mount()
    expect(byId('tab-admin')).toBeNull()
    expect(global.fetch.mock.calls.some((call) => call[0] === '/api/admin/users')).toBe(false)
    window.confirm = vi.fn(() => true)
    clickId('btn-logout')
    await waitFor(() => getById('login-form'))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(getById('auth-notice')).toHaveTextContent(t('auth.signedOut'))
})

test('signing out with unsaved changes asks first, and can be cancelled', async () => {
    backend({...JAN, approved: true})
    await mount()
    rename()
    window.confirm = vi.fn(() => false)
    clickId('btn-logout')
    expect(window.confirm).toHaveBeenCalledWith(t('app.confirmUnsaved'))
    getById('tab-comp')
    expect(global.fetch.mock.calls.some((call) => call[0] === '/api/auth/logout')).toBe(false)
    window.confirm = vi.fn(() => true)
    clickId('btn-logout')
    await waitFor(() => getById('login-form'))
})
