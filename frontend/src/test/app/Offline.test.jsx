// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Working without a connection: a save is kept on this device and goes to the server when the connection is back.
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import App from '../../app/App.jsx'
import standard from '../fixtures/standardSymbols.js'
import {t} from '../../i18n/translate.js'
import {byId, getById} from '../utils.jsx'
import {keepSave, pendingSaves, resetOfflineStore} from '../../offline/offlineStore.js'

vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))

const json = (body, status = 200, etag = null) => ({ok: status < 400, status, headers: {get: (name) => (name === 'ETag' ? etag : null)}, json: async () => body})
const USER = {id: 2, name: 'Jan', surname: 'Peeters', email: 'jan@example.be', admin: false, approved: true, restricted: false, ownedGroups: []}
const project = (pageName) => ({een: [{id: 'p1', name: pageName, tree: []}], sit: [{id: 's1', name: 'Plan 1', walls: [], items: []}], footer: {}})

/** Project 1 on the server at `server.version`; with `server.offline` every request that changes something fails as without a network. */
const backend = (server) => {
    global.fetch = vi.fn(async (url, options = {}) => {
        const method = options.method || 'GET'
        if (server.offline && method !== 'GET') throw new TypeError('Failed to fetch')
        if (url === '/api/auth/status') return json({setupRequired: false, adminEmail: '', user: USER})
        if (url === '/api/symbols') return json(standard)
        if (url === '/api/projects/summaries') return json([{id: 1, name: null, updated: '2026-11-04T10:00:00Z', mine: true, canManage: true, groups: []}])
        if (url === '/api/projects/1' && method === 'GET') return json(project('Blad 1'), 200, '"' + server.version + '"')
        if (url.includes('/presence')) return json({others: [], version: server.version})
        if (url.startsWith('/api/projects/1') && method === 'PUT') {
            server.saves.push({ifMatch: options.headers['If-Match'], body: JSON.parse(options.body)})
            if (options.headers['If-Match'] !== '"' + server.version + '"') return json({detail: 'conflict'}, 409)
            server.version++
            return json(null, 204, '"' + server.version + '"')
        }
        if (url.startsWith('/api/projects?') && method === 'POST') {
            server.created.push(decodeURIComponent(url))
            return json({id: 7, version: 0}, 201, '"0"')
        }
        return json(null, 404)
    })
}
const mount = async () => {
    render(<App />)
    await waitFor(() => getById('tab-comp'))
    await act(async () => {})
}
const save = () => {
    fireEvent.click(getById('tab-project'))
    fireEvent.click(getById('btn-save'))
}
const status = () => getById('status-message')

beforeEach(() => resetOfflineStore())

test('saving without a connection keeps the work on this device; it goes to the server when the connection is back', async () => {
    const server = {version: 1, offline: false, saves: [], created: []}
    backend(server)
    await mount()
    expect(byId('offline-status')).toBeNull()
    server.offline = true
    save()
    await waitFor(() => expect(status().textContent).toBe(t('offline.savedLocally')))
    expect(getById('offline-status')).toHaveTextContent(t('offline.pending', {count: 1}))
    expect(await pendingSaves(2)).toMatchObject([{id: 1, version: '"1"'}])
    server.offline = false
    await act(async () => dispatchEvent(new Event('online')))
    await waitFor(() => expect(status().textContent).toBe(t('offline.synced')))
    expect(server.saves).toMatchObject([{ifMatch: '"1"'}])
    await waitFor(() => expect(byId('offline-status')).toBeNull())
    expect(await pendingSaves(2)).toEqual([])
})

test('somebody else saved in the meantime: the work of this device becomes a new project, nothing is overwritten', async () => {
    const server = {version: 1, offline: false, saves: [], created: []}
    backend(server)
    await mount()
    server.offline = true
    save()
    await waitFor(() => expect(status().textContent).toBe(t('offline.savedLocally')))
    server.version = 3
    server.offline = false
    await act(async () => dispatchEvent(new Event('online')))
    await waitFor(() => expect(status().textContent).toContain('7'))
    expect(server.created[0]).toContain('(offline')
    // the open project is now the copy: saving again goes there
    server.offline = true
    save()
    await waitFor(async () => expect(await pendingSaves(2)).toMatchObject([{id: 7}]))
})

test('work that still waited on this device is opened at the start, before the newest project of the server', async () => {
    await keepSave({userId: 2, id: 1, version: '"1"', own: true, name: '', document: project('Blad van het toestel')})
    const server = {version: 1, offline: true, saves: [], created: []}
    backend(server)
    await mount()
    await waitFor(() => expect(status().textContent).toBe(t('offline.restored')))
    expect(document.body.textContent).toContain('Blad van het toestel')
    expect(getById('offline-status')).toHaveTextContent(t('offline.pending', {count: 1}))
})
