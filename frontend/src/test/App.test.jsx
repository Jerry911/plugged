// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import App from '../App.jsx'
import {node} from './utils.jsx'
import pako from 'pako'
import {importEds} from '../eds.jsx'
import standard from './fixtures/standard-symbols.json'

const makePdf = vi.fn(async () => {})
vi.mock('../Export.jsx', async (o) => ({...(await o()), makePdf: (...a) => makePdf(...a)}))
vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))
const old = {
    footer: {titel: 'Oud'},
    tree: [node('n', 'stopcontact', [], {label: 'Oud sc'})],
    plan: {walls: [], items: [{id: 'i', kind: 'door', a: 30, x: 1, y: 1}]},
}
// the symbol library comes from the backend: serve the standard symbols (plus `extra`) and echo saved symbols back (with the defaults the backend adds)
const symbols = (extra = []) => (url, o) =>
    url === '/api/symbols'
        ? {ok: true, json: async () => [...standard, ...extra]}
        : url === '/api/symbols/template'
          ? {ok: true, json: async () => ({k: 'custom:nieuw', name: '', cat: 'Eigen', parents: ['kring'], place: true, shapes: []})}
          : url.startsWith('/api/symbols/') && o?.method === 'PUT'
            ? {ok: true, json: async () => ({cat: 'Eigen', parents: ['kring'], place: true, ...JSON.parse(o.body), builtin: false, modified: false})}
            : null
const setup = (data = null, ok = true, extra = []) => {
    global.fetch = vi.fn(
        async (url, o) => symbols(extra)(url, o) ?? (o?.method === 'PUT' ? {ok} : data ? {ok: true, json: async () => data} : {ok: false}),
    )
}
// project saves only (not the symbols)
const puts = () => global.fetch.mock.calls.filter((c) => c[1]?.method === 'PUT' && c[0].startsWith('/api/projects'))
// import / export go through the buttons with these ids: one file picker (json and eds) and one export dialog with a file type choice
const byId = (id) => document.getElementById(id)
const toProject = () => fireEvent.click(byId('tab-project'))
const clickSave = () => {
    toProject()
    fireEvent.click(byId('btn-save'))
}
const exportAs = (type) => {
    toProject()
    fireEvent.click(byId('btn-export'))
    fireEvent.click(byId('export-type-' + type))
    fireEvent.click(byId('export-confirm'))
}
const importFile = (name, text) => fireEvent.change(byId('import-input'), {target: {files: [{name, text: async () => text}]}})
// the editor appears once the backend has delivered the symbols
const mount = async () => {
    const r = render(<App />)
    await screen.findByText('Components')
    return r
}
beforeEach(() => {
    setup()
    window.alert = vi.fn()
    window.print = vi.fn()
    vi.stubGlobal('URL', {createObjectURL: vi.fn(() => 'blob:x')})
    HTMLAnchorElement.prototype.click = vi.fn()
    makePdf.mockClear()
})
test('starts with empty project, switches tabs, saves', async () => {
    await mount()
    await act(async () => {})
    screen.getByRole('button', {name: /Kaderinfo/})
    fireEvent.click(screen.getByText('Situatieschema'))
    screen.getByText('Selecteer')
    fireEvent.click(screen.getByText('Components'))
    screen.getByText('＋ Nieuw component')
    clickSave()
    await screen.findByText('Opgeslagen ✓')
    expect(JSON.parse(puts()[0][1].body).een).toHaveLength(1)
})
test('save failure message', async () => {
    setup(null, false)
    await mount()
    clickSave()
    await screen.findByText('Fout bij opslaan')
})
test('migrates old format on load', async () => {
    setup(old)
    await mount()
    await screen.findAllByText('Oud sc')
    clickSave()
    await screen.findByText('Opgeslagen ✓')
    const b = JSON.parse(puts()[0][1].body)
    expect(b.een[0].tree[0].label).toBe('Oud sc')
    expect(b.sit[0].items[0].r).toBe(30)
    expect(b.footer.titel).toBe('Oud')
    screen.getAllByTitle('Niet geplaatst op situatieschema')
})
// an in-memory /api/projects: id -> document (names travel in the document and as ?name= on save)
const projectsApi = (store) => {
    const names = new Map()
    global.fetch = vi.fn(async (url, o) => {
        const sym = symbols()(url, o)
        if (sym) return sym
        if (url === '/api/projects/summaries')
            return {ok: true, json: async () => [...store].map(([id, d]) => ({id, name: names.get(id) ?? d.name ?? null, updated: '2026-03-0' + id + 'T10:00:00Z'}))}
        if (url === '/api/projects') return {ok: true, json: async () => [...store.keys()]}
        const m = /^\/api\/projects\/(\d+)(?:\?name=(.*))?$/.exec(url)
        if (!m) return {ok: false}
        const id = +m[1]
        if (o?.method === 'PUT') {
            store.set(id, JSON.parse(o.body))
            names.set(id, m[2] ? decodeURIComponent(m[2]) : null)
            return {ok: true}
        }
        if (o?.method === 'DELETE') return store.delete(id), {ok: true}
        return store.has(id) ? {ok: true, json: async () => store.get(id)} : {ok: false}
    })
    return names
}
const doc = (name, titel) => ({een: [{id: 'a' + name, name: 'Blad ' + name, tree: []}], sit: [{id: 'b', name: 'P', walls: [], items: []}], custom: [], footer: {titel}, name})
test('the project number is gone from the header; the Project menu has the project actions', async () => {
    await mount()
    await act(async () => {})
    expect(screen.queryByTitle('Project-nr')).toBeNull()
    for (const id of ['btn-save', 'btn-load', 'btn-import', 'btn-export']) expect(byId(id)).toBeNull()
    toProject()
    for (const id of ['btn-save', 'btn-saveas', 'btn-new', 'btn-load', 'btn-import', 'btn-export']) expect(byId(id)).toBeTruthy()
})
test('Project opens the menu, clicking Project again closes it; the items are listed under each other', async () => {
    await mount()
    await act(async () => {})
    const btn = byId('tab-project')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(byId('project-menu')).toBeNull()
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    screen.getByRole('menu', {name: 'Project'})
    expect(screen.getAllByRole('menuitem').map((b) => b.id)).toEqual(['btn-save', 'btn-saveas', 'btn-new', 'btn-load', 'btn-import', 'btn-export'])
    // opening the menu is not a page switch: the drawing stays where it was
    screen.getByRole('button', {name: /Kaderinfo/})
    expect(byId('tab-een')).toHaveClass('on')
    fireEvent.click(btn)
    expect(byId('project-menu')).toBeNull()
    expect(btn).toHaveAttribute('aria-expanded', 'false')
})
test('the Project menu closes on a click elsewhere, on Escape and after an action, but not while typing the name', async () => {
    await mount()
    await act(async () => {})
    toProject()
    fireEvent.pointerDown(document.body)
    expect(byId('project-menu')).toBeNull()
    toProject()
    fireEvent.pointerDown(byId('project-name'))
    fireEvent.change(byId('project-name'), {target: {value: 'Naam'}})
    expect(byId('project-menu')).not.toBeNull()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(byId('project-menu')).toBeNull()
    toProject()
    fireEvent.click(byId('btn-load'))
    expect(byId('btn-load')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(byId('btn-load')) // the nested flyout toggles too
    expect(byId('btn-load')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(byId('btn-new'))
    expect(byId('project-menu')).toBeNull()
})
test('arrow keys move through the Project menu items', async () => {
    await mount()
    await act(async () => {})
    toProject()
    byId('project-name').focus()
    fireEvent.keyDown(byId('project-name'), {key: 'ArrowDown'})
    expect(document.activeElement).toBe(byId('btn-save'))
    fireEvent.keyDown(byId('btn-save'), {key: 'ArrowUp'})
    expect(document.activeElement).toBe(byId('btn-export'))
    fireEvent.keyDown(byId('btn-export'), {key: 'ArrowDown'})
    expect(document.activeElement).toBe(byId('btn-save'))
})
test('a project is saved with its name (in the document and as ?name=) and Ctrl+S saves too', async () => {
    projectsApi(new Map())
    await mount()
    await act(async () => {})
    toProject()
    fireEvent.change(byId('project-name'), {target: {value: 'Woning Jan'}})
    fireEvent.click(byId('btn-save'))
    await screen.findByText('Opgeslagen ✓')
    expect(puts()[0][0]).toBe('/api/projects/1?name=Woning%20Jan')
    expect(JSON.parse(puts()[0][1].body).name).toBe('Woning Jan')
    fireEvent.keyDown(window, {key: 's', ctrlKey: true})
    await waitFor(() => expect(puts()).toHaveLength(2))
})
test('Laden lists the stored projects by name and loads the chosen one; saving then goes to that project', async () => {
    projectsApi(new Map([[1, doc('Eerste', 'T1')], [2, doc('Tweede', 'T2')]]))
    await mount()
    await screen.findByText('Blad Eerste')
    toProject()
    expect(screen.queryByRole('table', {name: 'Opgeslagen projecten'})).toBeNull()
    fireEvent.click(byId('btn-load'))
    const table = await screen.findByRole('table', {name: 'Opgeslagen projecten'})
    expect(table.textContent).toMatch(/Eerste.*huidig/)
    expect(table.textContent).toContain('Tweede')
    fireEvent.click(screen.getByTitle('Laad project 2'))
    await screen.findByText('Project 2 geladen')
    await screen.findByText('Blad Tweede')
    clickSave()
    await waitFor(() => expect(puts().at(-1)[0]).toBe('/api/projects/2?name=Tweede'))
})
test('loading another project asks first when there are unsaved changes', async () => {
    projectsApi(new Map([[1, doc('Eerste', 'T1')], [2, doc('Tweede', 'T2')]]))
    await mount()
    await screen.findByText('Blad Eerste')
    toProject()
    fireEvent.click(byId('btn-load'))
    await screen.findByRole('table', {name: 'Opgeslagen projecten'})
    fireEvent.change(byId('project-name'), {target: {value: 'Gewijzigd'}})
    const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(screen.getByTitle('Laad project 2'))
    await act(async () => {})
    expect(ask).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalledWith('/api/projects/2')
    expect(byId('project-menu')).toBeNull() // (the menu closes when a project is chosen)
    toProject()
    fireEvent.click(byId('btn-load'))
    fireEvent.click(await screen.findByTitle('Laad project 2'))
    await screen.findByText('Project 2 geladen')
    expect(ask).toHaveBeenCalledTimes(2)
    // unchanged project: no question
    toProject()
    fireEvent.click(byId('btn-load'))
    fireEvent.click(await screen.findByTitle('Laad project 1'))
    await screen.findByText('Project 1 geladen')
    expect(ask).toHaveBeenCalledTimes(2)
})
test('Nieuw starts an empty project under the next free number, Opslaan als stores a copy under a new number', async () => {
    const store = new Map([[1, doc('Eerste', 'T1')], [4, doc('Vierde', 'T4')]])
    projectsApi(store)
    await mount()
    await screen.findByText('Blad Eerste')
    toProject()
    fireEvent.click(byId('btn-new'))
    await screen.findByText(/Nieuw project \(nr 5\)/)
    expect(screen.queryByText('Blad Eerste')).toBeNull()
    toProject()
    expect(byId('project-name').value).toBe('')
    fireEvent.change(byId('project-name'), {target: {value: 'Garage'}})
    fireEvent.click(byId('btn-save'))
    await waitFor(() => expect(store.has(5)).toBe(true))
    vi.spyOn(window, 'prompt').mockReturnValue('Garage (kopie)')
    toProject()
    fireEvent.click(byId('btn-saveas'))
    await screen.findByText('Opgeslagen als project 6 ✓')
    expect(store.get(6).name).toBe('Garage (kopie)')
    expect(store.get(5).name).toBe('Garage')
    vi.spyOn(window, 'prompt').mockReturnValue(null) // cancelled: nothing is saved
    toProject()
    fireEvent.click(byId('btn-saveas'))
    await act(async () => {})
    expect(store.size).toBe(4)
})
test('a project can be deleted from the list after confirming', async () => {
    const store = new Map([[1, doc('Eerste', 'T1')], [2, doc('Tweede', 'T2')]])
    projectsApi(store)
    await mount()
    await screen.findByText('Blad Eerste')
    toProject()
    fireEvent.click(byId('btn-load'))
    await screen.findByRole('table', {name: 'Opgeslagen projecten'})
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(screen.getByLabelText('Verwijder Tweede'))
    expect(store.has(2)).toBe(true)
    fireEvent.click(screen.getByLabelText('Verwijder Tweede'))
    await waitFor(() => expect(store.has(2)).toBe(false))
    await waitFor(() => expect(screen.queryByTitle('Laad project 2')).toBeNull())
})
test.each([
    ['Eendraadschema', 'Blad'],
    ['Situatieschema', 'Plattegrond'],
])('page bar on %s', async (tab, pre) => {
    await mount()
    await act(async () => {})
    fireEvent.click(screen.getByText(tab))
    fireEvent.click(screen.getByText('＋ blad'))
    screen.getByText(pre + ' 2')
    vi.spyOn(window, 'prompt').mockReturnValue('Nieuw')
    fireEvent.click(screen.getByText('✎'))
    screen.getByText('Nieuw')
    fireEvent.click(screen.getByText('⧉'))
    screen.getByText('Nieuw (kopie)')
    fireEvent.click(screen.getByText('◀'))
    fireEvent.click(screen.getByText('▶'))
    fireEvent.click(screen.getByText('🗑'))
    expect(screen.queryByText('Nieuw (kopie)')).toBeNull()
    fireEvent.click(screen.getByText(pre + ' 1'))
    fireEvent.click(screen.getByText('🗑'))
    expect(screen.getByText('Nieuw')).toBeTruthy()
})
test('duplicating an eendraad page regenerates node ids', async () => {
    setup({
        een: [{id: 'a', name: 'A', tree: [node('n1', 'bord')]}],
        sit: [{id: 'b', name: 'P', walls: [{id: 'w', x1: 0, y1: 0, x2: 1, y2: 1}], items: []}],
        custom: [],
        footer: {},
    })
    await mount()
    await screen.findAllByText('n1')
    fireEvent.click(screen.getByText('⧉'))
    clickSave()
    await screen.findByText('Opgeslagen ✓')
    const b = JSON.parse(puts()[0][1].body)
    expect(b.een[1].tree[0].id).not.toBe('n1')
    fireEvent.click(screen.getByText('Situatieschema'))
    fireEvent.click(screen.getByText('⧉'))
    clickSave()
    await waitFor(() => expect(puts()).toHaveLength(2))
    expect(JSON.parse(puts()[1][1].body).sit[1].walls[0].id).not.toBe('w')
})
test('footer edits flow into the project', async () => {
    await mount()
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', {name: /Kaderinfo/}))
    const i = document.querySelectorAll('.form input')[0]
    fireEvent.change(i, {target: {value: 'Villa'}})
    screen.getAllByText('Villa')
})
test('pdf, print, json export and json import', async () => {
    await mount()
    await act(async () => {})
    fireEvent.click(screen.getByText('PDF'))
    await waitFor(() => expect(makePdf).toHaveBeenCalled())
    expect(document.querySelectorAll('.export svg.sheet').length).toBe(0)
    makePdf.mockRejectedValueOnce(new Error('boom'))
    fireEvent.click(screen.getByText('PDF'))
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Export mislukt: boom'))
    fireEvent.click(screen.getByText('Afdrukken'))
    await waitFor(() => expect(window.print).toHaveBeenCalled())
    exportAs('json')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
    fireEvent.change(byId('import-input'), {target: {files: []}})
    importFile('oud.json', JSON.stringify(old))
    await screen.findAllByText('Oud sc')
    await screen.findByText('Project geïmporteerd')
})

const flawed = {
    een: [
        {
            id: 'a',
            name: 'Hoofd',
            tree: [node('A', 'aansluiting', [node('B', 'bord', [node('K', 'kring', [node('S', 'stopcontact')], {info: 'B16 2,5mm²'})])])],
        },
    ],
    sit: [{id: 'b', name: 'P', walls: [], items: []}],
    custom: [],
    footer: {},
}
test('Controleer button shows counts, lists issues and navigates to the node', async () => {
    setup(flawed)
    await mount()
    await screen.findAllByText('Hoofd')
    const btn = screen.getByRole('button', {name: /Controleer/})
    expect(btn.textContent).toMatch(/✖2.*⚠/)
    fireEvent.click(btn)
    screen.getByRole('region', {name: 'Controle'})
    fireEvent.click(screen.getByText(/hangt niet onder een differentieel/))
    expect(screen.getByText('Eigenschappen')).toBeInTheDocument()
    expect(screen.getByDisplayValue('K')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sluiten'))
    expect(screen.queryByRole('region', {name: 'Controle'})).toBeNull()
})
test('Controleer sits in the eendraadschema bar and the tab shows errors and warnings', async () => {
    setup(flawed)
    await mount()
    await screen.findAllByText('Hoofd')
    const tab = screen.getByRole('button', {name: /^Eendraadschema/})
    expect(tab.textContent).toMatch(/✖2.*⚠\d+/)
    expect(screen.getByRole('button', {name: /Controleer/}).closest('.bar')).toBeNull() // not in the header
    fireEvent.click(screen.getByText('Situatieschema'))
    expect(screen.queryByRole('button', {name: /Controleer/})).toBeNull() // only on the eendraadschema tab
})
test('footer issue goes to eendraad tab, plan issue to situatieschema, global issue without node', async () => {
    setup(flawed)
    await mount()
    await screen.findAllByText('Hoofd')
    fireEvent.click(screen.getByRole('button', {name: /Controleer/}))
    fireEvent.click(screen.getByText('Situatieschema'))
    fireEvent.click(screen.getByText(/Kaderinfo onvolledig/))
    screen.getByRole('dialog', {name: 'Kaderinfo'})
    fireEvent.click(screen.getAllByText(/staat niet op het situatieschema/, {selector: 'li'})[0])
    screen.getByText(/Muur: klik punten/)
    fireEvent.click(screen.getByText(/Geen aarding/))
    screen.getByText('Opbouw')
})

const enc = (j) => 'EDS0040000' + btoa(String.fromCharCode(...pako.deflate(JSON.stringify(j))))
const row = (id, parent, type, props = {}) => ({id, parent, indent: 0, props: {type, ...props}})
const EDS = () => ({
    data: [
        row(1, 0, 'Aansluiting', {met_teller: true}),
        row(2, 1, 'Bord', {is_geaard: true}),
        row(3, 2, 'Kring', {naam: 'A', amperage: '16', aantal_polen: '2', type_kabel: 'XVB Cca 3G2,5'}),
        row(4, 3, 'Contactdoos', {adres: 'Keuken'}),
        row(5, 3, 'Rare'),
    ],
    properties: {owner: 'Jan<br>Dorpstraat 1<br>9000 Gent'},
})
test('a new project starts with aansluiting, kWh meter and bord; the verifier reports the empty board', async () => {
    await mount()
    await act(async () => {})
    expect(document.querySelector('svg.sheet').textContent).toContain('kWh')
    fireEvent.click(screen.getByRole('button', {name: /Controleer/}))
    screen.getByText(/heeft geen kringen/)
})
test('an empty schema is reported as empty', async () => {
    setup({een: [{id: 'a', name: 'x', tree: []}], sit: [{id: 'b', name: 'P', walls: [], items: []}], custom: [], footer: {}})
    await mount()
    await screen.findByText('x')
    fireEvent.click(screen.getByRole('button', {name: /Controleer/}))
    screen.getByText('Het eendraadschema is leeg.')
})
test('new sheets start with a default board', async () => {
    await mount()
    await act(async () => {})
    fireEvent.click(screen.getByText('＋ blad'))
    clickSave()
    await screen.findByText('Opgeslagen ✓')
    const b = JSON.parse(puts()[0][1].body)
    expect(b.een[1].tree[0].type).toBe('aansluiting')
    expect(b.een[1].tree[0].children[0].type).toBe('bord')
})
test('EDS import replaces schema and footer, reports a message and can be undone', async () => {
    await mount()
    await act(async () => {})
    importFile('huis.eds', enc(EDS()))
    await screen.findByText(/EDS geïmporteerd: 1 kringen, 5 elementen \(onbekend: Rare\)/)
    screen.getAllByText('Keuken')
    screen.getByText('Dorpstraat 1, 9000 Gent')
    fireEvent.click(screen.getByRole('button', {name: /Ongedaan/}))
    expect(screen.queryByText('Keuken')).toBeNull()
})
test('EDS export downloads the schema as .eds, reports it, and the file imports again', async () => {
    await mount()
    await act(async () => {})
    importFile('huis.eds', enc(EDS()))
    await screen.findByText(/EDS geïmporteerd/)
    HTMLAnchorElement.prototype.click.mockClear()
    URL.createObjectURL.mockClear()
    exportAs('eds')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    await screen.findByText(/EDS geëxporteerd: 1 kringen, 5 elementen$/)
    const r = importEds(await readBlob(URL.createObjectURL.mock.calls[0][0]))
    expect(r.stats).toMatchObject({circuits: 1, nodes: 5})
    expect(r.footer).toMatchObject({eigenaar: 'Jan', straat: 'Dorpstraat', nr: '1', postcode: '9000', gemeente: 'Gent'})
})
test('EDS import without unknown types and with an invalid file', async () => {
    await mount()
    await act(async () => {})
    const j = EDS()
    j.data.pop()
    importFile('huis.eds', enc(j))
    await screen.findByText(/EDS geïmporteerd: 1 kringen, 4 elementen$/)
    importFile('kapot.eds', 'nope')
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Dit is geen geldig .eds-bestand.'))
    fireEvent.change(byId('import-input'), {target: {files: []}})
})

const readBlob = (b) =>
    new Promise((res) => {
        const r = new FileReader()
        r.onload = () => res(r.result)
        r.readAsText(b)
    })
const zelf = {k: 'custom:z', name: 'Zelf', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}], v: 0, builtin: false, modified: false}
test('library comes from the backend and the own symbols travel along in the JSON export', async () => {
    setup(null, true, [zelf])
    await mount()
    fireEvent.click(screen.getByText('Components'))
    await screen.findByText('Zelf')
    expect(global.fetch).toHaveBeenCalledWith('/api/symbols', undefined)
    exportAs('json')
    const out = JSON.parse(await readBlob(URL.createObjectURL.mock.calls[0][0]))
    expect(out.custom).toEqual([{id: 'z', name: 'Zelf', cat: 'Eigen', parents: ['kring'], place: true, shapes: zelf.shapes}])
})
test('components stored inside an old project move into the library', async () => {
    setup({
        een: [{id: 'a', name: 'A', tree: [node('c', 'custom:c1')]}],
        sit: [{id: 'b', name: 'P', walls: [], items: []}],
        custom: [{id: 'c1', name: 'Mijn ding', shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}]}],
        footer: {},
    })
    await mount()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/symbols/custom%3Ac1', expect.objectContaining({method: 'PUT'})))
    // no parents are sent: the backend gives it the default ones
    expect(JSON.parse(global.fetch.mock.calls.find((c) => c[0] === '/api/symbols/custom%3Ac1')[1].body)).not.toHaveProperty('parents')
    fireEvent.click(screen.getByText('Components'))
    await screen.findByText('Mijn ding')
    clickSave()
    await screen.findByText('Opgeslagen ✓')
    expect(JSON.parse(puts().at(-1)[1].body).custom).toEqual([])
})
test('shows a message with a retry button while the backend has no symbols', async () => {
    let up = false
    global.fetch = vi.fn(async (url, o) => (up ? symbols()(url, o) ?? {ok: false} : {ok: false}))
    render(<App />)
    await screen.findByText(/symbolen konden niet geladen worden/)
    expect(screen.queryByText('Components')).toBeNull()
    up = true
    fireEvent.click(screen.getByText('Opnieuw proberen'))
    await screen.findByText('Components')
})
test('shows that the symbols are loading', async () => {
    let done
    global.fetch = vi.fn(() => new Promise((res) => (done = res)))
    render(<App />)
    screen.getByText('Symbolen laden…')
    await act(async () => done({ok: false}))
})

test('import and export are one button each; the old separate JSON / EDS buttons are gone', async () => {
    await mount()
    await act(async () => {})
    toProject()
    expect(byId('btn-import')).toHaveTextContent('Importeren')
    expect(byId('btn-export')).toHaveTextContent('Exporteren')
    expect(byId('import-input')).toHaveAttribute('accept', '.json,.eds')
    for (const t of ['JSON ↑', 'JSON ↓', 'EDS ↑', 'EDS ↓']) expect(screen.queryByText(t)).toBeNull()
})
test('the import button opens the file picker', async () => {
    await mount()
    const click = vi.spyOn(byId('import-input'), 'click')
    toProject()
    fireEvent.click(byId('btn-import'))
    expect(click).toHaveBeenCalledTimes(1)
})
test('the export dialog offers both file types, json first, and downloads the chosen one', async () => {
    await mount()
    await act(async () => {})
    expect(screen.queryByRole('dialog', {name: 'Exporteren'})).toBeNull()
    toProject()
    fireEvent.click(byId('btn-export'))
    screen.getByRole('dialog', {name: 'Exporteren'})
    expect(byId('export-type-json')).toBeChecked()
    expect(byId('export-type-eds')).not.toBeChecked()
    // choosing nothing exports the project file
    fireEvent.click(byId('export-confirm'))
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', {name: 'Exporteren'})).toBeNull()
    const out = JSON.parse(await readBlob(URL.createObjectURL.mock.calls[0][0]))
    expect(out.een).toHaveLength(1)
    // .eds: other file, and the message of the export
    exportAs('eds')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2)
    await screen.findByText(/EDS geëxporteerd/)
})
test('the export dialog closes with the cross, Annuleer, Escape and the export button, without downloading', async () => {
    await mount()
    await act(async () => {})
    const dlg = () => screen.queryByRole('dialog', {name: 'Exporteren'})
    for (const close of [() => fireEvent.click(byId('export-close')), () => fireEvent.click(byId('export-cancel')), () => fireEvent.keyDown(dlg(), {key: 'Escape'}), () => (toProject(), fireEvent.click(byId('btn-export')))]) {
        toProject()
        fireEvent.click(byId('btn-export'))
        expect(dlg()).not.toBeNull()
        fireEvent.keyDown(dlg(), {key: 'a'})
        expect(dlg()).not.toBeNull()
        close()
        expect(dlg()).toBeNull()
    }
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})
test('the export dialog and the Kaderinfo dialog do not stay open together', async () => {
    await mount()
    await act(async () => {})
    toProject()
    fireEvent.click(byId('btn-export'))
    fireEvent.click(byId('btn-footer'))
    expect(screen.queryByRole('dialog', {name: 'Exporteren'})).toBeNull()
    screen.getByRole('dialog', {name: 'Kaderinfo'})
    toProject()
    fireEvent.click(byId('btn-export'))
    expect(screen.queryByRole('dialog', {name: 'Kaderinfo'})).toBeNull()
    screen.getByRole('dialog', {name: 'Exporteren'})
})
test('the import picks json or eds from the extension, or from the content when the name says nothing', async () => {
    await mount()
    await act(async () => {})
    importFile('project', JSON.stringify(old)) // no extension: not an EDS header, so json
    await screen.findAllByText('Oud sc')
    importFile('schema', enc(EDS())) // no extension: EDS header
    await screen.findByText(/EDS geïmporteerd: 1 kringen/)
    importFile('verkeerd.json', enc(EDS())) // the extension wins: not valid json
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Dit is geen geldig projectbestand (.json).'))
    importFile('verkeerd.eds', JSON.stringify(old)) // the extension wins: not a valid eds
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Dit is geen geldig .eds-bestand.'))
    importFile(undefined, enc(EDS())) // a file without name
    await waitFor(() => expect(screen.getAllByText(/EDS geïmporteerd/).length).toBeGreaterThan(0))
})
test('importing the same file twice works: the picker is reset after every choice', async () => {
    await mount()
    await act(async () => {})
    const input = byId('import-input')
    importFile('a.json', JSON.stringify(old))
    await screen.findAllByText('Oud sc')
    expect(input.value).toBe('')
})
test('the Info tab shows the info page and the other tabs bring the editor back', async () => {
    await mount()
    await act(async () => {})
    expect(byId('info-page')).toBeNull()
    fireEvent.click(byId('tab-info'))
    expect(byId('info-page')).not.toBeNull()
    expect(byId('tab-info')).toHaveClass('on')
    expect(byId('tab-een')).not.toHaveClass('on')
    fireEvent.click(byId('tab-comp'))
    expect(byId('info-page')).toBeNull()
    expect(byId('tab-info')).not.toHaveClass('on')
    fireEvent.click(byId('tab-een'))
    expect(byId('tab-een')).toHaveClass('on')
    fireEvent.click(byId('tab-sit'))
    screen.getByText('Selecteer')
})
