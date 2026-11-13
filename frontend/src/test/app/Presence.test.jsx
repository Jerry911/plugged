// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Working together: who else has the open project, and following their saves.
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import App from '../../app/App.jsx'
import standard from '../fixtures/standardSymbols.js'
import {t} from '../../i18n/translate.js'
import {byId, clickId, getById} from '../utils.jsx'

vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))

const json = (body, status = 200, etag = null) => ({ok: status < 400, status, headers: {get: (name) => (name === 'ETag' ? etag : null)}, json: async () => body})
const USER = {id: 2, name: 'Jan', surname: 'Peeters', email: 'jan@example.be', admin: false, approved: true, restricted: false, ownedGroups: []}
const project = (pageName) => ({een: [{id: 'p1', name: pageName, tree: []}], sit: [{id: 's1', name: 'Plan 1', walls: [], items: []}], footer: {}})

/** The server has `server.document` as version `server.version`; presence answers `server.presence`. */
const backend = (server) => {
    global.fetch = vi.fn(async (url, options = {}) => {
        if (url === '/api/auth/status') return json({setupRequired: false, adminEmail: 'admin@example.be', user: USER})
        if (url === '/api/symbols') return json(standard)
        if (url === '/api/projects/summaries') return json([{id: 1, name: null, updated: '2026-11-04T10:00:00Z', mine: true, canManage: true, groups: []}])
        if (url === '/api/projects/1') return json(server.document, 200, '"' + server.version + '"')
        if (url === '/api/projects/1/presence' && options.method === 'POST') return json(server.presence())
        if (url.startsWith('/api/projects/1/presence') && options.method === 'DELETE') return {ok: true, status: 204}
        return json(null, 404)
    })
}
const pageNames = () => document.getElementById('eds-pagebar')?.textContent || document.body.textContent
const mount = async () => {
    render(<App />)
    await waitFor(() => getById('tab-comp'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/projects/1/presence', expect.objectContaining({method: 'POST'})))
    await act(async () => {})
}

test('who else has the project open is shown in the top bar', async () => {
    const server = {document: project('Blad 1'), version: 1, presence: () => ({others: [{name: 'Bob Test', editing: true, since: '2026-11-13T10:00:00Z', me: false}], version: 1})}
    backend(server)
    await mount()
    await waitFor(() => expect(getById('presence')).toHaveTextContent('Bob Test'))
    expect(getById('presence')).toHaveClass('editing')
    expect(getById('presence').title).toContain(t('presence.unsaved'))
    const body = JSON.parse(global.fetch.mock.calls.find((call) => call[0] === '/api/projects/1/presence')[1].body)
    expect(body).toEqual({window: expect.any(String), editing: false})
})

test('nobody else: nothing is shown', async () => {
    backend({document: project('Blad 1'), version: 1, presence: () => ({others: [], version: 1})})
    await mount()
    expect(byId('presence')).toBeNull()
    expect(byId('newer-version')).toBeNull()
})

test('a newer version of somebody else is loaded right away when nothing is unsaved here', async () => {
    const server = {document: project('Blad 1'), version: 1, presence: () => ({others: [{name: 'Bob Test', editing: false, me: false}], version: server.version, savedBy: 'Bob Test'})}
    backend(server)
    // the first heartbeat already sees version 2 of Bob
    server.presence = () => {
        server.document = project('Blad van Bob')
        server.version = 2
        return {others: [{name: 'Bob Test', editing: false, me: false}], version: 2, savedBy: 'Bob Test', savedByMe: false}
    }
    await mount()
    await waitFor(() => expect(getById('status-message')).toHaveTextContent(t('presence.followed', {name: 'Bob Test'})))
    expect(pageNames()).toContain('Blad van Bob')
    expect(byId('newer-version')).toBeNull()
})

test('two other windows of mine: shown as such', async () => {
    backend({document: project('Blad 1'), version: 1, presence: () => ({others: [{name: 'Jan Peeters', editing: false, me: true}], version: 1})})
    await mount()
    await waitFor(() => expect(getById('presence')).toHaveTextContent(t('presence.youElsewhere')))
})

test('the count, with more than one other', async () => {
    backend({
        document: project('Blad 1'),
        version: 1,
        presence: () => ({others: [{name: 'Bob Test', editing: false}, {name: 'Carol Test', editing: false}], version: 1}),
    })
    await mount()
    await waitFor(() => expect(getById('presence')).toHaveTextContent(t('presence.count', {count: 2})))
    expect(getById('presence').title).toContain('Carol Test')
})

test('the account dialog opens from the top bar', async () => {
    backend({document: project('Blad 1'), version: 1, presence: () => ({others: [], version: 1})})
    await mount()
    clickId('btn-account')
    expect(getById('account-dialog')).toBeInTheDocument()
    fireEvent.keyDown(getById('account-dialog'), {key: 'Escape'})
    expect(byId('account-dialog')).toBeNull()
})
