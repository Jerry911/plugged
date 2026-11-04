// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Beheer → Symbolen: what the next release changes, and the download of the catalog file.
import {render, waitFor} from '@testing-library/react'
import SymbolsPanel, {CATALOG_FILE, CATALOG_PATH} from '../../../features/admin/SymbolsPanel.jsx'
import {fetchCatalogChanges, fetchCatalogFile} from '../../../api/authApi.js'
import {t} from '../../../i18n/translate.js'
import {byId, clickId, getById} from '../../utils.jsx'

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body, text: async () => body})
const FILE = '[\n  {"k":"lichtpunt","name":"Lamp"}\n]\n'

/** /changes answers `changes` (or `changesStatus`), the catalog answers FILE (or `fileStatus`). */
const backend = ({changes = [], changesStatus = 200, fileStatus = 200} = {}) => {
    global.fetch = vi.fn(async (url) => {
        if (url === '/api/admin/symbols/catalog/changes') return json(changes, changesStatus)
        if (url === '/api/admin/symbols/catalog') return json(FILE, fileStatus)
        return json(null, 404)
    })
}
let saved
beforeEach(() => {
    saved = []
    vi.stubGlobal('URL', {createObjectURL: (blob) => (saved.push(blob), 'blob:x')})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
        saved.push(this.download)
    })
})
afterEach(() => vi.unstubAllGlobals())

test('lists the standard symbols the next release changes, by their name in the active language', async () => {
    backend({changes: [{k: 'lichtpunt', name: 'Lichtpunt'}, {k: 'motor', name: 'Mijn motor'}]})
    render(<SymbolsPanel />)
    await waitFor(() => getById('catalog-changes'))
    expect(getById('catalog-changes')).toHaveTextContent(t('catalog.changes', {count: 2}))
    expect(getById('catalog-change-lichtpunt')).toHaveTextContent(t('symbols.lichtpunt'))
    expect(getById('catalog-change-motor')).toHaveTextContent('Mijn motor (motor)')
    expect(getById('admin-symbols')).toHaveTextContent(CATALOG_PATH)
})

test('nothing changed: says so; the download still gives the whole catalog', async () => {
    backend()
    render(<SymbolsPanel />)
    await waitFor(() => expect(getById('catalog-no-changes')).toHaveTextContent(t('catalog.noChanges')))
    clickId('catalog-download')
    await waitFor(() => expect(getById('catalog-message')).toHaveTextContent(t('catalog.downloaded', {file: CATALOG_FILE})))
    expect(saved[1]).toBe('standard-symbols.json')
    expect(await saved[0].text()).toBe(FILE)
})

test('the changes or the file cannot be fetched: the panel says so', async () => {
    backend({changesStatus: 500, fileStatus: 500})
    render(<SymbolsPanel />)
    await waitFor(() => expect(getById('catalog-failed')).toHaveTextContent(t('catalog.loadFailed')))
    expect(byId('catalog-changes')).toBeNull()
    clickId('catalog-download')
    await waitFor(() => expect(getById('catalog-message')).toHaveTextContent(t('catalog.downloadFailed')))
    expect(saved).toEqual([])
})

test('the api calls', async () => {
    global.fetch = vi.fn(async () => json({}))
    expect(await fetchCatalogChanges()).toEqual([])
    global.fetch = vi.fn(async () => Promise.reject(new Error('down')))
    expect(await fetchCatalogFile()).toBeNull()
})
