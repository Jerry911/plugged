// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// What comes before the editor: the first start, signing in, registering, signing out and a session that ends during the work.
import {act, render, waitFor} from '@testing-library/react'
import AuthGate from '../../../features/auth/AuthGate.jsx'
import {apiFetch} from '../../../api/http.js'
import {t} from '../../../i18n/translate.js'
import {byId, clickId, getById, typeInto} from '../../utils.jsx'
import {fireEvent} from '@testing-library/react'

const ADMIN = {id: 1, name: 'Jeroen', surname: 'Pleysier', email: 'admin@example.be', admin: true, approved: true}
const JAN = {id: 2, name: 'Jan', surname: 'Peeters', email: 'jan@example.be', admin: false, approved: false}
const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})

/** A backend: `status` answers /api/auth/status, `answers[url]` the other requests (a function of the parsed body, or a fixed answer). */
const backend = (status, answers = {}) => {
    global.fetch = vi.fn(async (url, options = {}) => {
        if (url === '/api/auth/status') return typeof status === 'function' ? status() : json(status)
        const answer = answers[url]
        if (!answer) return json(null, 404)
        return typeof answer === 'function' ? answer(options.body ? JSON.parse(options.body) : null) : answer
    })
}
const posted = (url) => global.fetch.mock.calls.filter((call) => call[0] === url).map((call) => JSON.parse(call[1].body || 'null'))
const Editor = ({user, onLogout}) => (
    <div id="editor">
        {user.email}
        <button id="logout" onClick={onLogout} />
    </div>
)
const mount = () => render(<AuthGate>{(props) => <Editor {...props} />}</AuthGate>)
const submit = (id) => fireEvent.submit(getById(id))

beforeEach(() => history.replaceState(null, '', '/'))

test('a backend that does not answer: a message and a retry', async () => {
    let up = false
    backend(() => (up ? json({setupRequired: false, adminEmail: 'admin@example.be', user: ADMIN}) : json(null, 500)))
    mount()
    expect(getById('auth-loading')).toHaveTextContent(t('auth.loading'))
    await waitFor(() => getById('auth-unavailable'))
    up = true
    clickId('auth-retry')
    await waitFor(() => expect(getById('editor')).toHaveTextContent(ADMIN.email))
})

test('first start: the administrator gets the configured address, which cannot be changed', async () => {
    backend({setupRequired: true, adminEmail: 'admin@example.be', user: null}, {'/api/auth/setup': () => json(ADMIN)})
    mount()
    await waitFor(() => getById('setup-form'))
    expect(getById('auth-email')).toHaveValue('admin@example.be')
    expect(getById('auth-email')).toHaveAttribute('readonly')
    typeInto('auth-setup-key', 'ABCD-EFGH-JKLM-NPQR')
    typeInto('auth-name', 'Jeroen')
    typeInto('auth-surname', 'Pleysier')
    typeInto('auth-password', 'geheim123')
    typeInto('auth-password2', 'anders123')
    submit('setup-form')
    await waitFor(() => expect(getById('auth-error')).toHaveTextContent(t('auth.passwordMismatch')))
    expect(posted('/api/auth/setup')).toEqual([])
    typeInto('auth-password2', 'geheim123')
    submit('setup-form')
    await waitFor(() => expect(getById('editor')).toHaveTextContent(ADMIN.email))
    expect(posted('/api/auth/setup')).toEqual([{name: 'Jeroen', surname: 'Pleysier', password: 'geheim123', setupKey: 'ABCD-EFGH-JKLM-NPQR'}])
})

test('first start with a wrong setup key: the message of the server is shown', async () => {
    backend({setupRequired: true, adminEmail: 'admin@example.be', user: null}, {
        '/api/auth/setup': () => json({status: 403, detail: 'De installatiesleutel klopt niet.', messageKey: 'auth.setupKeyWrong'}, 403),
    })
    mount()
    await waitFor(() => getById('setup-form'))
    expect(getById('auth-setup-key')).toHaveValue('')
    typeInto('auth-setup-key', 'fout')
    typeInto('auth-name', 'Jeroen')
    typeInto('auth-surname', 'Pleysier')
    typeInto('auth-password', 'geheim123')
    typeInto('auth-password2', 'geheim123')
    submit('setup-form')
    await waitFor(() => expect(getById('auth-error')).toHaveTextContent('De installatiesleutel klopt niet.'))
    expect(byId('editor')).toBeNull()
})

test('first start without PLUGGED_ADMIN_EMAIL: no form, only what to do', async () => {
    backend({setupRequired: true, adminEmail: '', user: null})
    mount()
    await waitFor(() => expect(getById('auth-error')).toHaveTextContent(t('auth.setup.noAdminEmail')))
    expect(byId('auth-submit')).toBeNull()
})

test('first start refused by the backend: its message is shown', async () => {
    backend({setupRequired: true, adminEmail: 'admin@example.be', user: null}, {'/api/auth/setup': json({detail: 'Er is al een beheerder'}, 409)})
    mount()
    await waitFor(() => getById('setup-form'))
    typeInto('auth-password', 'geheim123')
    typeInto('auth-password2', 'geheim123')
    submit('setup-form')
    await waitFor(() => expect(getById('auth-error')).toHaveTextContent('Er is al een beheerder'))
})

test('sign in: a refusal shows the message of the backend, then the editor opens', async () => {
    let approved = false
    backend({setupRequired: false, adminEmail: 'admin@example.be', user: null}, {
        '/api/auth/login': () => (approved ? json({...JAN, approved: true}) : json({detail: 'Je account is nog niet goedgekeurd'}, 403)),
    })
    mount()
    await waitFor(() => getById('login-form'))
    typeInto('auth-email', 'jan@example.be')
    typeInto('auth-password', 'geheim123')
    submit('login-form')
    await waitFor(() => expect(getById('auth-error')).toHaveTextContent('Je account is nog niet goedgekeurd'))
    approved = true
    submit('login-form')
    await waitFor(() => expect(getById('editor')).toHaveTextContent(JAN.email))
    expect(posted('/api/auth/login')[1]).toEqual({email: 'jan@example.be', password: 'geheim123'})
})

test('register from the sign-in screen; afterwards signing in has the address filled in and says to wait for approval', async () => {
    backend({setupRequired: false, adminEmail: 'admin@example.be', user: null}, {
        '/api/auth/register': (body) => (body.email === 'bestaat@example.be' ? json({detail: 'Er bestaat al een account'}, 409) : json(JAN, 201)),
    })
    mount()
    await waitFor(() => getById('login-form'))
    clickId('link-register')
    expect(window.location.hash).toBe('#register')
    getById('register-form')
    typeInto('auth-name', 'Jan')
    typeInto('auth-surname', 'Peeters')
    typeInto('auth-email', 'bestaat@example.be')
    typeInto('auth-password', 'geheim123')
    typeInto('auth-password2', 'geheim124')
    submit('register-form')
    await waitFor(() => expect(getById('auth-error')).toHaveTextContent(t('auth.passwordMismatch')))
    typeInto('auth-password2', 'geheim123')
    submit('register-form')
    await waitFor(() => expect(getById('auth-error')).toHaveTextContent('Er bestaat al een account'))
    typeInto('auth-email', 'jan@example.be')
    submit('register-form')
    await waitFor(() => getById('login-form'))
    expect(getById('auth-notice')).toHaveTextContent(t('auth.register.done'))
    expect(getById('auth-email')).toHaveValue('jan@example.be')
    expect(window.location.hash).toBe('')
    expect(posted('/api/auth/register').at(-1)).toEqual({name: 'Jan', surname: 'Peeters', email: 'jan@example.be', password: 'geheim123'})
})

test('the registration screen opens from the address (#register) and goes back to signing in with the link or the browser', async () => {
    backend({setupRequired: false, adminEmail: 'admin@example.be', user: null})
    history.replaceState(null, '', '/#register')
    mount()
    await waitFor(() => getById('register-form'))
    clickId('link-login')
    getById('login-form')
    history.replaceState(null, '', '/#register')
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')))
    getById('register-form')
})

test('signing out goes back to the sign-in screen', async () => {
    backend({setupRequired: false, adminEmail: 'admin@example.be', user: ADMIN}, {'/api/auth/logout': {ok: true, status: 204}})
    mount()
    await waitFor(() => getById('editor'))
    clickId('logout')
    await waitFor(() => getById('login-form'))
    expect(getById('auth-notice')).toHaveTextContent(t('auth.signedOut'))
    expect(posted('/api/auth/logout')).toEqual([null])
})

test('a session that ends during the work: sign in again on top of the editor, which stays open', async () => {
    backend({setupRequired: false, adminEmail: 'admin@example.be', user: ADMIN}, {'/api/projects/1': json(null, 401), '/api/auth/login': () => json(ADMIN)})
    mount()
    await waitFor(() => getById('editor'))
    await act(async () => {
        await apiFetch('/api/projects/1', {method: 'PUT'})
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
    getById('session-lost')
    getById('editor')
    expect(getById('auth-email')).toHaveValue(ADMIN.email)
    expect(byId('link-register')).toBeNull()
    typeInto('auth-password', 'geheim123')
    submit('login-form')
    await waitFor(() => expect(byId('session-lost')).toBeNull())
    getById('editor')
})

test('signed in with a temporary password: a new one first, then the editor', async () => {
    backend({setupRequired: false, adminEmail: 'admin@example.be', user: {...ADMIN, mustChangePassword: true}}, {
        '/api/auth/password': (body) => (body.currentPassword === 'tijdelijk' ? json({...ADMIN, mustChangePassword: false}) : json({detail: 'Je huidige wachtwoord klopt niet'}, 403)),
    })
    mount()
    await waitFor(() => getById('must-change-password'))
    expect(byId('editor')).toBeNull()
    typeInto('password-current', 'fout')
    typeInto('password-new', 'nieuwgeheim')
    typeInto('password-repeat', 'nieuwgeheim')
    submit('password-form')
    await waitFor(() => expect(getById('password-error')).toHaveTextContent('Je huidige wachtwoord klopt niet'))
    typeInto('password-current', 'tijdelijk')
    submit('password-form')
    await waitFor(() => expect(getById('editor')).toHaveTextContent(ADMIN.email))
    expect(posted('/api/auth/password').at(-1)).toEqual({currentPassword: 'tijdelijk', newPassword: 'nieuwgeheim'})
})

test('the two new passwords must be the same', async () => {
    backend({setupRequired: false, adminEmail: 'admin@example.be', user: {...ADMIN, mustChangePassword: true}})
    mount()
    await waitFor(() => getById('must-change-password'))
    typeInto('password-current', 'tijdelijk')
    typeInto('password-new', 'nieuwgeheim')
    typeInto('password-repeat', 'anders123')
    submit('password-form')
    await waitFor(() => expect(getById('password-error')).toHaveTextContent(t('auth.passwordMismatch')))
    expect(posted('/api/auth/password')).toEqual([])
})
