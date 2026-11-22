// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Opening the editor from outside: a link to a project (/?project=12, as an AI assistant gives it), a plan an assistant drew (it offers to
// make the eendraadschema), and Plugged as a program on one computer (no sign-in screen, no signing out).
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import App from '../../app/App.jsx'
import standard from '../fixtures/standardSymbols.js'
import {t} from '../../i18n/translate.js'
import {byId, getById} from '../utils.jsx'

vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))

const json = (body, status = 200, etag = null) => ({ok: status < 400, status, headers: {get: (name) => (name === 'ETag' ? etag : null)}, json: async () => body})
const USER = {id: 2, name: 'Jan', surname: 'Peeters', email: 'jan@example.be', admin: false, approved: true, restricted: false, ownedGroups: []}
const page = (name, items = []) => ({een: [{id: 'p1', name, tree: []}], sit: [{id: 's1', name: 'Plan 1', walls: [], items}], footer: {}})

const backend = ({user = USER, desktop = false, documents = {}} = {}) => {
    global.fetch = vi.fn(async (url, options = {}) => {
        if (url === '/api/auth/status') return json({setupRequired: false, adminEmail: '', user, desktop})
        if (url === '/api/symbols') return json(standard)
        if (url === '/api/projects/summaries')
            return json(Object.keys(documents).map((id) => ({id: +id, name: 'P' + id, updated: '2026-11-0' + id + 'T10:00:00Z', mine: true, canManage: true, groups: []})))
        const match = /^\/api\/projects\/(\d+)$/.exec(url)
        if (match && (options.method || 'GET') === 'GET') return json(documents[match[1]], 200, '"1"')
        if (url.includes('/presence')) return json({others: [], version: 1})
        return json(null, 404)
    })
}
const mount = async () => {
    render(<App />)
    await waitFor(() => getById('tab-comp'))
    await act(async () => {})
}
afterEach(() => history.replaceState(null, '', '/'))

test('a link to a project opens that one instead of the newest, and the link is taken out of the address', async () => {
    backend({documents: {1: page('Blad van project 1'), 3: page('Blad van project 3')}})
    history.replaceState(null, '', '/?project=1')
    await mount()
    await waitFor(() => expect(document.body.textContent).toContain('Blad van project 1'))
    expect(window.location.search).toBe('')
})

test('a plan an AI assistant drew opens on the situatieschema with the offer to make the eendraadschema', async () => {
    const drawn = {...page('Blad 1', [{id: 'a', kind: 'sym', type: 'stopcontact_pekid', x: 50, y: 50, r: 0, s: 7, mark: 'A1'}]), pending: {generateOneWire: true}}
    backend({documents: {4: drawn}})
    await mount()
    await waitFor(() => getById('generate-dialog'))
    expect(getById('tab-sit')).toHaveClass('on')
})

test('as a program on this computer: no sign-in screen but a word on how to open it, and no signing out', async () => {
    backend({user: null, desktop: true})
    render(<App />)
    await waitFor(() => expect(getById('desktop-signin')).toHaveTextContent(t('desktop.text')))
    expect(byId('login-form')).toBeNull()
})

test('signed in as a program on this computer there is no Afmelden', async () => {
    backend({desktop: true, documents: {1: page('Blad 1')}})
    await mount()
    expect(byId('btn-logout')).toBeNull()
    // no QR code either: not in the Project menu, not with Alt+Q
    fireEvent.click(getById('tab-project'))
    expect(byId('btn-qr')).toBeNull()
    fireEvent.keyDown(window, {key: 'q', code: 'KeyQ', altKey: true})
    expect(byId('qr-dialog')).toBeNull()
})
