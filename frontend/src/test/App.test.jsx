// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import App from '../App.jsx'
import {node} from './utils.jsx'
import pako from 'pako'

const makePdf = vi.fn(async () => {})
vi.mock('../Export.jsx', async (o) => ({...(await o()), makePdf: (...a) => makePdf(...a)}))
vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))
const old = {
    footer: {titel: 'Oud'},
    tree: [node('n', 'stopcontact', [], {label: 'Oud sc'})],
    plan: {walls: [], items: [{id: 'i', kind: 'door', a: 30, x: 1, y: 1}]},
}
const setup = (data = null, ok = true) => {
    global.fetch = vi.fn(async (url, o) => (o?.method === 'PUT' ? {ok} : data ? {ok: true, json: async () => data} : {ok: false}))
}
const puts = () => global.fetch.mock.calls.filter((c) => c[1]?.method === 'PUT')
beforeEach(() => {
    setup()
    window.alert = vi.fn()
    window.print = vi.fn()
    vi.stubGlobal('URL', {createObjectURL: vi.fn(() => 'blob:x')})
    HTMLAnchorElement.prototype.click = vi.fn()
    makePdf.mockClear()
})
test('starts with empty project, switches tabs, saves', async () => {
    render(<App />)
    await act(async () => {})
    screen.getByRole('button', {name: /Kaderinfo/})
    fireEvent.click(screen.getByText('Situatieschema'))
    screen.getByText('Selecteer')
    fireEvent.click(screen.getByText('Componenten'))
    screen.getByText('＋ Nieuw component')
    fireEvent.click(screen.getByText('Opslaan'))
    await screen.findByText('Opgeslagen ✓')
    expect(JSON.parse(puts()[0][1].body).een).toHaveLength(1)
})
test('save failure message', async () => {
    setup(null, false)
    render(<App />)
    fireEvent.click(screen.getByText('Opslaan'))
    await screen.findByText('Fout bij opslaan')
})
test('migrates old format on load', async () => {
    setup(old)
    render(<App />)
    await screen.findAllByText('Oud sc')
    fireEvent.click(screen.getByText('Opslaan'))
    await screen.findByText('Opgeslagen ✓')
    const b = JSON.parse(puts()[0][1].body)
    expect(b.een[0].tree[0].label).toBe('Oud sc')
    expect(b.sit[0].items[0].r).toBe(30)
    expect(b.footer.titel).toBe('Oud')
    screen.getByTitle('Niet geplaatst op situatieschema')
})
test('loads new format and other project numbers', async () => {
    setup({een: [{id: 'a', name: 'Eigen blad', tree: []}], sit: [{id: 'b', name: 'P', walls: [], items: []}], custom: [], footer: {}})
    render(<App />)
    await screen.findByText('Eigen blad')
    fireEvent.change(screen.getByTitle('Project-nr'), {target: {value: '2'}})
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/projects/2'))
    fireEvent.change(screen.getByTitle('Project-nr'), {target: {value: ''}})
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/projects/1'))
})
test.each([
    ['Eendraadschema', 'Blad'],
    ['Situatieschema', 'Plattegrond'],
])('page bar on %s', async (tab, pre) => {
    render(<App />)
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
    render(<App />)
    await screen.findAllByText('n1')
    fireEvent.click(screen.getByText('⧉'))
    fireEvent.click(screen.getByText('Opslaan'))
    await screen.findByText('Opgeslagen ✓')
    const b = JSON.parse(puts()[0][1].body)
    expect(b.een[1].tree[0].id).not.toBe('n1')
    fireEvent.click(screen.getByText('Situatieschema'))
    fireEvent.click(screen.getByText('⧉'))
    fireEvent.click(screen.getByText('Opslaan'))
    await waitFor(() => expect(puts()).toHaveLength(2))
    expect(JSON.parse(puts()[1][1].body).sit[1].walls[0].id).not.toBe('w')
})
test('footer edits flow into the project', async () => {
    render(<App />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', {name: /Kaderinfo/}))
    const i = document.querySelectorAll('.form input')[0]
    fireEvent.change(i, {target: {value: 'Villa'}})
    screen.getAllByText('Villa')
})
test('pdf, print and json export / import', async () => {
    render(<App />)
    await act(async () => {})
    fireEvent.click(screen.getByText('PDF'))
    await waitFor(() => expect(makePdf).toHaveBeenCalled())
    expect(document.querySelectorAll('.export svg.sheet').length).toBe(0)
    makePdf.mockRejectedValueOnce(new Error('boom'))
    fireEvent.click(screen.getByText('PDF'))
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Export mislukt: boom'))
    fireEvent.click(screen.getByText('Afdrukken'))
    await waitFor(() => expect(window.print).toHaveBeenCalled())
    fireEvent.click(screen.getByText('JSON ↓'))
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
    const f = document.querySelector('input[type=file]')
    fireEvent.change(f, {target: {files: []}})
    fireEvent.change(f, {target: {files: [{text: async () => JSON.stringify(old)}]}})
    await screen.findAllByText('Oud sc')
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
    render(<App />)
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
test('footer issue goes to eendraad tab, plan issue to situatieschema, global issue without node', async () => {
    setup(flawed)
    render(<App />)
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
    render(<App />)
    await act(async () => {})
    expect(document.querySelector('svg.sheet').textContent).toContain('kWh')
    fireEvent.click(screen.getByRole('button', {name: /Controleer/}))
    screen.getByText(/heeft geen kringen/)
})
test('an empty schema is reported as empty', async () => {
    setup({een: [{id: 'a', name: 'x', tree: []}], sit: [{id: 'b', name: 'P', walls: [], items: []}], custom: [], footer: {}})
    render(<App />)
    await screen.findByText('x')
    fireEvent.click(screen.getByRole('button', {name: /Controleer/}))
    screen.getByText('Het eendraadschema is leeg.')
})
test('new sheets start with a default board', async () => {
    render(<App />)
    await act(async () => {})
    fireEvent.click(screen.getByText('＋ blad'))
    fireEvent.click(screen.getByText('Opslaan'))
    await screen.findByText('Opgeslagen ✓')
    const b = JSON.parse(puts()[0][1].body)
    expect(b.een[1].tree[0].type).toBe('aansluiting')
    expect(b.een[1].tree[0].children[0].type).toBe('bord')
})
test('EDS import replaces schema and footer, reports a message and can be undone', async () => {
    render(<App />)
    await act(async () => {})
    const input = document.querySelector('input[accept=".eds"]')
    fireEvent.change(input, {target: {files: [{text: async () => enc(EDS())}]}})
    await screen.findByText(/EDS geïmporteerd: 1 kringen, 5 elementen \(onbekend: Rare\)/)
    screen.getAllByText('Keuken')
    screen.getByText('Dorpstraat 1, 9000 Gent')
    fireEvent.click(screen.getByRole('button', {name: /Ongedaan/}))
    expect(screen.queryByText('Keuken')).toBeNull()
})
test('EDS import without unknown types and with an invalid file', async () => {
    render(<App />)
    await act(async () => {})
    const input = document.querySelector('input[accept=".eds"]')
    const j = EDS()
    j.data.pop()
    fireEvent.change(input, {target: {files: [{text: async () => enc(j)}]}})
    await screen.findByText(/EDS geïmporteerd: 1 kringen, 4 elementen$/)
    fireEvent.change(input, {target: {files: [{text: async () => 'nope'}]}})
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Dit is geen geldig .eds-bestand.'))
    fireEvent.change(input, {target: {files: []}})
})

const readBlob = (b) =>
    new Promise((res) => {
        const r = new FileReader()
        r.onload = () => res(r.result)
        r.readAsText(b)
    })
const zelf = {k: 'custom:z', name: 'Zelf', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}]}
test('library comes from the database, is seeded with the standard components and travels along in the JSON export', async () => {
    global.fetch = vi.fn(async (url, o) =>
        o?.method === 'PUT' ? {ok: true} : url === '/api/components' ? {ok: true, json: async () => [{k: 'custom:z', json: JSON.stringify(zelf)}]} : {ok: false},
    )
    render(<App />)
    fireEvent.click(screen.getByText('Componenten'))
    await screen.findByText('Zelf')
    const seed = global.fetch.mock.calls.find((c) => c[0] === '/api/components' && c[1]?.method === 'PUT')
    expect(JSON.parse(seed[1].body).length).toBeGreaterThan(40)
    fireEvent.click(screen.getByText('JSON ↓'))
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
    render(<App />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/components/custom%3Ac1', expect.objectContaining({method: 'PUT'})))
    fireEvent.click(screen.getByText('Componenten'))
    screen.getByText('Mijn ding')
    fireEvent.click(screen.getByText('Opslaan'))
    await screen.findByText('Opgeslagen ✓')
    expect(JSON.parse(puts().at(-1)[1].body).custom).toEqual([])
})
