// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Mijn account: the theme, a new password, downloading the own data, removing the own account.
import {fireEvent, render, waitFor} from '@testing-library/react'
import AccountPanel from '../../../features/account/AccountPanel.jsx'
import {t} from '../../../i18n/translate.js'
import {byId, clickId, getById, typeInto} from '../../utils.jsx'

const USER = {id: 2, name: 'Jan', surname: 'Peeters', email: 'jan@example.be', primary: false}
const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)])})

const mount = (user = USER) => {
    const onDeleted = vi.fn()
    render(<AccountPanel user={user} onDeleted={onDeleted} />)
    return {onDeleted}
}

test('a new password, with the current one', async () => {
    global.fetch = vi.fn(async (url) => (url === '/api/auth/password' ? json(USER) : json(null, 404)))
    mount()
    expect(getById('account-who')).toHaveTextContent('Jan Peeters · jan@example.be')
    typeInto('password-current', 'geheim123')
    typeInto('password-new', 'nieuwgeheim')
    typeInto('password-repeat', 'nieuwgeheim')
    fireEvent.submit(getById('password-form'))
    await waitFor(() => expect(getById('password-done')).toHaveTextContent(t('account.passwordChanged')))
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({currentPassword: 'geheim123', newPassword: 'nieuwgeheim'})
    expect(global.fetch.mock.calls[0][1].method).toBe('PUT')
    expect(getById('password-current')).toHaveValue('')
})

test('the own data is downloaded as a file', async () => {
    global.fetch = vi.fn(async (url) => (url === '/api/account/export' ? json({account: {email: USER.email}}) : json(null, 404)))
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    mount()
    clickId('account-export')
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(byId('account-export-error')).toBeNull()
})

test('removing the account needs the tick and the password', async () => {
    global.fetch = vi.fn(async (url, options) =>
        url === '/api/account' && options.method === 'DELETE'
            ? JSON.parse(options.body).password === 'geheim123'
                ? {ok: true, status: 204, json: async () => null}
                : json({detail: 'Je huidige wachtwoord klopt niet'}, 403)
            : json(null, 404),
    )
    const {onDeleted} = mount()
    expect(getById('account-delete')).toBeDisabled()
    fireEvent.click(getById('account-delete-confirm'))
    typeInto('account-delete-password', 'fout')
    expect(getById('account-delete')).not.toBeDisabled()
    fireEvent.submit(getById('account-delete-form'))
    await waitFor(() => expect(getById('account-delete-error')).toHaveTextContent('Je huidige wachtwoord klopt niet'))
    expect(onDeleted).not.toHaveBeenCalled()
    typeInto('account-delete-password', 'geheim123')
    fireEvent.submit(getById('account-delete-form'))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
})

test('the primary administrator cannot remove his account', () => {
    mount({...USER, primary: true})
    expect(getById('account-delete-primary')).toHaveTextContent(t('account.deletePrimary'))
    expect(byId('account-delete-form')).toBeNull()
})

test('who is signed in, with his role, and every button in the same style', () => {
    mount()
    expect(getById('account-who')).toHaveTextContent('Jan Peeters · jan@example.be')
    expect(getById('account-role')).toHaveTextContent(t('account.roleUser'))
    for (const id of ['password-submit', 'account-export', 'account-delete']) expect(getById(id)).toHaveClass('accent')
})

test('Thema: three choices; one click shows the colours at once and stores them for every device', async () => {
    document.documentElement.dataset.theme = 'marine'
    global.fetch = vi.fn(async (url, options) => (url === '/api/account/theme' ? json({theme: JSON.parse(options.body).theme}) : json(null, 404)))
    mount()
    expect(getById('account-theme-marine')).toBeChecked()
    expect(getById('account-theme').querySelectorAll('input[type="radio"]')).toHaveLength(3)
    expect(getById('account-theme')).toHaveTextContent(t('account.theme.names.werkbank'))
    fireEvent.click(getById('account-theme-werkbank'))
    expect(document.documentElement.dataset.theme).toBe('werkbank')
    expect(getById('account-theme-werkbank')).toBeChecked()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(global.fetch.mock.calls[0][0]).toBe('/api/account/theme')
    expect(global.fetch.mock.calls[0][1].method).toBe('PUT')
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({theme: 'werkbank'})
    expect(byId('account-theme-error')).toBeNull()
    delete document.documentElement.dataset.theme
    localStorage.clear()
})

test('Thema: when the server cannot store it, the colours still change here and the user is told', async () => {
    global.fetch = vi.fn(async () => json({detail: 'Onbekend thema', messageKey: 'account.invalidTheme'}, 400))
    mount()
    fireEvent.click(getById('account-theme-helder'))
    expect(document.documentElement.dataset.theme).toBe('helder')
    await waitFor(() => expect(getById('account-theme-error')).toHaveTextContent('Onbekend thema'))
    delete document.documentElement.dataset.theme
    localStorage.clear()
})
