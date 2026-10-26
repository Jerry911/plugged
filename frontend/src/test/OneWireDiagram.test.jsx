// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, screen} from '@testing-library/react'
import OneLineSchema, {rotate} from '../OneWireDiagram.jsx'
import {base, mount, node} from './utils.jsx'
import {defaultTree} from '../boardModel.jsx'

const btn = (id) => document.getElementById(id)
const pal = (n) => screen.getAllByText(n)[0],
    row = (n) => screen.getAllByText(n).at(-1)
beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {
    })
})
const withTree = (tree) => ({...base(), een: [{id: 'e1', name: 'Blad 1', tree}]})
test('adds root, child; enforces hierarchy; free mode', () => {
    const {spy} = mount(OneLineSchema, base(), {idx: 0})
    fireEvent.click(pal('Verdeelbord'))
    expect(window.alert).toHaveBeenCalledWith('Selecteer eerst een element waaronder dit past.')
    fireEvent.click(pal('Aansluiting net'))
    expect(spy.p.een[0].tree).toHaveLength(1)
    fireEvent.click(row('Aansluiting net'))
    fireEvent.click(pal('Verdeelbord'))
    expect(spy.p.een[0].tree[0].children).toHaveLength(1)
    fireEvent.click(pal('Stopcontact'))
    expect(window.alert).toHaveBeenLastCalledWith(expect.stringContaining('kan enkel onder: Kring (automaat)'))
    fireEvent.click(screen.getByLabelText(/Vrije hiërarchie/))
    fireEvent.click(pal('Stopcontact'))
    expect(spy.p.een[0].tree[0].children[0].children).toHaveLength(1)
})
test('free mode without selection adds at root', () => {
    const {spy} = mount(OneLineSchema, base(), {idx: 0})
    fireEvent.click(screen.getByLabelText(/Vrije hiërarchie/))
    fireEvent.click(pal('Stopcontact'))
    expect(spy.p.een[0].tree).toHaveLength(1)
})
test('search filters palette', () => {
    const {container} = mount(OneLineSchema, base(), {idx: 0})
    fireEvent.change(screen.getByPlaceholderText('Zoek element…'), {target: {value: 'oven'}})
    expect(container.querySelectorAll('.pal details')).toHaveLength(1)
    fireEvent.change(screen.getByPlaceholderText('Zoek element…'), {target: {value: 'zzzz'}})
    expect(container.querySelectorAll('.pal details')).toHaveLength(0)
})
test('edit properties, move, indent, outdent, duplicate, delete', () => {
    const t = [node('A', 'bord', [node('B', 'kring')]), node('C', 'bord')],
        {spy} = mount(OneLineSchema, withTree(t), {idx: 0})
    fireEvent.click(row('C'))
    fireEvent.change(screen.getByDisplayValue('C'), {target: {value: 'Cx'}})
    expect(spy.p.een[0].tree[1].label).toBe('Cx')
    fireEvent.change(screen.getByPlaceholderText(/Specs/), {target: {value: 'B16'}})
    expect(spy.p.een[0].tree[1].info).toBe('B16')
    fireEvent.click(btn('eds-earlier'))
    expect(spy.p.een[0].tree[0].label).toBe('Cx')
    fireEvent.click(btn('eds-later'))
    fireEvent.click(btn('eds-indent'))
    expect(spy.p.een[0].tree[0].children.map((n) => n.id)).toEqual(['B', 'C'])
    fireEvent.click(btn('eds-outdent'))
    expect(spy.p.een[0].tree.map((n) => n.id)).toEqual(['A', 'C'])
    fireEvent.click(btn('eds-duplicate'))
    expect(spy.p.een[0].tree).toHaveLength(3)
    fireEvent.keyDown(document.body, {key: 'Delete'})
    expect(spy.p.een[0].tree).toHaveLength(2)
})
test('toolbar buttons have a tooltip and an accessible name', () => {
    mount(OneLineSchema, withTree([node('A', 'bord'), node('C', 'bord')]), {idx: 0})
    fireEvent.click(row('C'))
    for (const id of ['eds-earlier', 'eds-later', 'eds-outdent', 'eds-indent', 'eds-duplicate', 'eds-rotate-ccw', 'eds-rotate-cw']) {
        expect(btn(id)).toHaveAttribute('title')
        expect(btn(id)).toHaveAttribute('aria-label')
    }
})
test('rotate helper wraps around in both directions', () => {
    const t = [node('A', 'stopcontact', [node('B', 'lamp')])]
    expect(rotate(t, 'A', 15)[0].r).toBe(15)
    expect(rotate(t, 'A', -15)[0].r).toBe(345)
    expect(rotate(rotate(t, 'A', 350), 'A', 20)[0].r).toBe(10)
    expect(rotate(t, 'B', 90)[0].children[0].r).toBe(90)
})
test('rotate buttons turn the selected symbol, full circle, and are disabled for distribution parts', () => {
    const t = [node('A', 'aansluiting', [node('B', 'bord', [node('K', 'kring', [node('S', 'stopcontact')])])])],
        {spy} = mount(OneLineSchema, withTree(t), {idx: 0}),
        S = () => spy.p.een[0].tree[0].children[0].children[0].children[0]
    // select through the tree list: the drawing also contains a (non-clickable) text 'S' for the label
    const treeRow = (l) => [...document.querySelectorAll('.tree div')].find((d) => d.textContent.startsWith(l))
    fireEvent.click(treeRow('K'))
    expect(btn('eds-rotate-cw')).toBeDisabled()
    expect(btn('eds-rotate-ccw')).toBeDisabled()
    fireEvent.click(treeRow('S'))
    expect(selected()).toHaveTextContent(/^S/)
    fireEvent.click(btn('eds-rotate-cw'))
    expect(S().r).toBe(15)
    expect(btn('eds-rotation')).toHaveTextContent('15°')
    fireEvent.click(btn('eds-rotate-ccw'))
    fireEvent.click(btn('eds-rotate-ccw'))
    expect(S().r).toBe(345)
    for (let i = 0; i < 24; i++) fireEvent.click(btn('eds-rotate-cw'))
    expect(S().r).toBe(345)
})
test('a turned symbol is drawn turned in the schema', () => {
    const t = defaultTree()
    t[0].children[0].children = [node('K', 'kring', [node('S', 'stopcontact', [], {r: 90})])]
    const {container} = mount(OneLineSchema, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {idx: 0})
    expect(container.querySelector('svg.sheet g[transform^="rotate(90 "]')).toBeInTheDocument()
})
test('Eigenschappen sits above Opbouw and can be closed with the cross', () => {
    mount(OneLineSchema, withTree([node('Aa', 'bord'), node('Cc', 'bord')]), {idx: 0})
    expect(btn('eds-close')).toBeNull()
    fireEvent.click(row('Cc'))
    const eig = screen.getByText('Eigenschappen'),
        opb = screen.getByText('Opbouw')
    expect(eig.compareDocumentPosition(opb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(btn('eds-close'))
    expect(screen.queryByText('Eigenschappen')).toBeNull()
    expect(selected()).toBeNull()
})
test('trash button in the toolbar deletes the selected element with its children', () => {
    const {spy} = mount(OneLineSchema, withTree([node('Aa', 'bord', [node('Bb', 'kring')]), node('Cc', 'bord')]), {idx: 0})
    fireEvent.click(row('Aa'))
    expect(btn('eds-delete')).toHaveAttribute('title')
    fireEvent.click(btn('eds-delete'))
    expect(spy.p.een[0].tree.map((n) => n.id)).toEqual(['Cc'])
    expect(screen.queryByText('Eigenschappen')).toBeNull()
})
test('a trash can appears on the selected symbol in the drawing and deletes it', () => {
    const t = defaultTree()
    t[0].children[0].children = [node('K', 'kring', [node('S', 'stopcontact'), node('T', 'stopcontact')])]
    const {spy} = mount(OneLineSchema, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {idx: 0}),
        treeRow = (l) => [...document.querySelectorAll('.tree div')].find((d) => d.textContent.startsWith(l)),
        kids = () => spy.p.een[0].tree[0].children[0].children[0].children
    expect(btn('eds-drawing-delete')).toBeNull()
    fireEvent.click(treeRow('S'))
    expect(document.querySelectorAll('#eds-drawing-delete')).toHaveLength(1)
    fireEvent.click(btn('eds-drawing-delete'))
    expect(kids().map((n) => n.id)).toEqual(['T'])
    expect(btn('eds-drawing-delete')).toBeNull()
})
test('main levels can be folded and unfolded with the arrow in the Opbouw list', () => {
    const t = [node('Aa', 'aansluiting', [node('Bb', 'bord', [node('Kk', 'kring', [node('Ss', 'stopcontact'), node('Tt', 'stopcontact')])])])],
        {spy} = mount(OneLineSchema, withTree(t), {idx: 0}),
        names = () => [...document.querySelectorAll('.tree div')].map((d) => d.textContent)
    expect(names()).toHaveLength(5)
    expect(btn('eds-toggle-Ss')).toBeNull()
    expect(btn('eds-toggle-Kk')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(btn('eds-toggle-Kk'))
    expect(names()).toHaveLength(3)
    expect(names()[2]).toContain('(+2)')
    expect(btn('eds-toggle-Kk')).toHaveAttribute('aria-expanded', 'false')
    expect(selected()).toBeNull() // folding does not select
    fireEvent.click(btn('eds-toggle-Bb'))
    expect(names()).toHaveLength(2)
    fireEvent.click(btn('eds-toggle-Bb'))
    fireEvent.click(btn('eds-toggle-Kk'))
    expect(names()).toHaveLength(5)
    expect(spy.p.een[0].tree).toEqual(t) // the data is untouched
})
test('selecting a hidden element in the drawing unfolds its levels', () => {
    const t = [node('Aa', 'aansluiting', [node('Bb', 'bord', [node('Kk', 'kring', [node('Ss', 'stopcontact')])])])],
        {container} = mount(OneLineSchema, withTree(t), {idx: 0})
    fireEvent.click(btn('eds-toggle-Kk'))
    expect(document.querySelectorAll('.tree div')).toHaveLength(3)
    fireEvent.click(container.querySelector('svg.sheet g[style*="pointer"]'))
    expect(document.querySelectorAll('.tree div')).toHaveLength(4)
    expect(selected()).toHaveTextContent(/^Ss/)
})
test('adding an element to a folded circuit unfolds it', () => {
    const {spy} = mount(OneLineSchema, DEF(), {idx: 0})
    fireEvent.click(pal('Kring (automaat)'))
    fireEvent.click(pal('Stopcontact'))
    const k = document.querySelectorAll('.tree div')[2] // Aansluiting net > Verdeelbord > circuit A
    expect(k).toHaveTextContent(/^A/)
    fireEvent.click(k.querySelector('button'))
    expect(document.querySelectorAll('.tree div')).toHaveLength(3)
    fireEvent.click(pal('Lichtpunt'))
    expect(document.querySelectorAll('.tree div')).toHaveLength(5)
    expect(board1(spy).children[0].children).toHaveLength(2)
})
test('custom components appear in palette', () => {
    const p = {...base(), custom: [{id: '9', name: 'Mijn ding', shapes: []}]}
    mount(OneLineSchema, p, {idx: 0})
    expect(pal('Mijn ding')).toBeInTheDocument()
})
test('Delete/Backspace remove the selected node; ignored in inputs and without selection', () => {
    const {spy} = mount(OneLineSchema, withTree([node('Aa', 'bord'), node('Bb', 'bord')]), {idx: 0}),
        b = document.body
    fireEvent.keyDown(b, {key: 'Delete'})
    expect(spy.p.een[0].tree).toHaveLength(2)
    expect(screen.queryByText('Eigenschappen')).toBeNull()
    fireEvent.click(row('Aa'))
    expect(selected()).toHaveTextContent(/^Aa/)
    fireEvent.keyDown(screen.getByDisplayValue('Aa'), {key: 'Delete'})
    fireEvent.keyDown(b, {key: 'x'})
    expect(spy.p.een[0].tree).toHaveLength(2)
    fireEvent.keyDown(b, {key: 'Delete'})
    expect(spy.p.een[0].tree.map((n) => n.id)).toEqual(['Bb'])
    fireEvent.click(row('Bb'))
    fireEvent.keyDown(b, {key: 'Backspace'})
    expect(spy.p.een[0].tree).toHaveLength(0)
})
test('Delete key removes node with its children', () => {
    const {spy} = mount(OneLineSchema, withTree([node('Aa', 'bord', [node('K', 'kring')])]), {idx: 0})
    fireEvent.click(row('Aa'))
    fireEvent.keyDown(document.body, {key: 'Delete'})
    expect(spy.p.een[0].tree).toEqual([])
})
test('footer cells in the diagram call onFooter', () => {
    const fn = vi.fn(),
        {container} = mount(OneLineSchema, base(), {idx: 0, onFooter: fn})
    fireEvent.click(container.querySelector('.fcell'))
    expect(fn).toHaveBeenCalledWith('titel')
})

const DEF = () => ({...base(), een: [{id: 'e1', name: 'Blad 1', tree: defaultTree()}]})
const selected = () => document.querySelector('.tree .sel')
const board1 = (spy) => spy.p.een[0].tree[0].children[0]
test('circuits are appended to the board from left to right with defaults and free letters', () => {
    const {spy} = mount(OneLineSchema, DEF(), {idx: 0})
    for (let i = 0; i < 3; i++) fireEvent.click(pal('Kring (automaat)'))
    const b = board1(spy)
    expect(b.children.map((k) => k.label)).toEqual(['A', 'B', 'C'])
    expect(b.children[0]).toMatchObject({
        type: 'kring',
        info: 'B16 2P XVB Cca 3G2,5',
        p: {polen: 2, amp: 16, curve: 'B', bescherming: 'automatisch'},
    })
})
test('elements go into the selected circuit; the circuit stays selected; a new circuit becomes selected', () => {
    const {spy} = mount(OneLineSchema, DEF(), {idx: 0})
    fireEvent.click(pal('Kring (automaat)'))
    fireEvent.click(pal('Stopcontact'))
    fireEvent.click(pal('Stopcontact'))
    fireEvent.click(pal('Lichtpunt'))
    expect(board1(spy).children[0].children.map((c) => c.type)).toEqual(['stopcontact', 'stopcontact', 'lichtpunt'])
    expect(selected()).toHaveTextContent(/^A/)
    fireEvent.click(pal('Kring (automaat)'))
    expect(board1(spy).children).toHaveLength(2)
    expect(selected()).toHaveTextContent(/^B/)
})
test('without selection an element is added to the last circuit', () => {
    const t = defaultTree()
    t[0].children[0].children = [node('K1', 'kring'), node('K2', 'kring')]
    const {spy} = mount(OneLineSchema, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {idx: 0})
    fireEvent.click(pal('Motor'))
    expect(board1(spy).children[1].children.map((c) => c.type)).toEqual(['motor'])
    expect(board1(spy).children[0].children).toHaveLength(0)
})
test('kring fields update props and the derived spec string', () => {
    const {spy} = mount(OneLineSchema, DEF(), {idx: 0})
    fireEvent.click(pal('Kring (automaat)'))
    const k = () => board1(spy).children[0],
        f = (l) => screen.getByLabelText(l)
    fireEvent.change(f('Beveiliging (A)'), {target: {value: '20'}})
    fireEvent.change(f('Curve'), {target: {value: 'C'}})
    fireEvent.change(f('Polen'), {target: {value: '4'}})
    fireEvent.change(f('Kabel'), {target: {value: 'XVB 3G4'}})
    fireEvent.change(f('Naam (tekst)'), {target: {value: 'Oven'}})
    fireEvent.change(f('Kortsluitvermogen (kA)'), {target: {value: '6'}})
    expect(k().info).toBe('C20 4P XVB 3G4')
    expect(k().p).toMatchObject({amp: '20', curve: 'C', polen: '4', tekst: 'Oven', kortsl: '6'})
    fireEvent.change(f('Letter'), {target: {value: 'Z'}})
    expect(k().label).toBe('Z')
    expect(screen.queryByPlaceholderText(/Specs/)).toBeNull()
})
test('aansluiting, bord and element fields', () => {
    const {spy, container} = mount(OneLineSchema, DEF(), {idx: 0})
    fireEvent.click(row('Aansluiting net'))
    fireEvent.change(screen.getByLabelText('Differentieel (mA)'), {target: {value: '30'}})
    expect(spy.p.een[0].tree[0].p.delta).toBe('30')
    fireEvent.click(row('Verdeelbord'))
    fireEvent.click(screen.getByLabelText('Geaard'))
    expect(board1(spy).p.geaard).toBe(false)
    expect(screen.queryByLabelText('Aantal (x)')).toBeNull()
    fireEvent.click(pal('Kring (automaat)'))
    fireEvent.click(pal('Stopcontact'))
    fireEvent.click([...container.querySelectorAll('.tree div')].at(-1))
    fireEvent.change(screen.getByLabelText('Aantal (x)'), {target: {value: '4'}})
    fireEvent.change(screen.getByLabelText('Nr'), {target: {value: '2'}})
    expect(board1(spy).children[0].children[0].p).toMatchObject({aantal: '4', nr: '2'})
    fireEvent.change(screen.getByPlaceholderText(/Specs/), {target: {value: '16A'}})
    expect(board1(spy).children[0].children[0].info).toBe('16A')
})
test('clicking a circuit letter or a symbol in the drawing selects it', () => {
    const t = [
        node('A', 'aansluiting', [
            node('B', 'bord', [
                node('K', 'kring', [node('S', 'stopcontact')], {
                    p: {
                        polen: 2,
                        amp: 16,
                        curve: 'B',
                        kabel: 'x',
                        kortsl: 3
                    }
                }),
            ]),
        ]),
    ]
    const {container} = mount(OneLineSchema, withTree(t), {idx: 0})
    fireEvent.click([...container.querySelectorAll('svg.sheet text')].find((x) => x.textContent === 'K'))
    expect(selected()).toHaveTextContent(/^K/)
    screen.getByText('Eigenschappen')
    fireEvent.click(container.querySelector('svg.sheet g[style*="pointer"]'))
    expect(selected()).toHaveTextContent(/^S/)
})
test('wide boards are shown on several sheets', () => {
    const t = defaultTree()
    t[0].children[0].children = Array.from({length: 40}, (_, i) =>
        node('K' + i, 'kring', [node('s' + i, 'stopcontact')], {
            p: {
                polen: 2,
                amp: 16,
                curve: 'B',
                kabel: 'x',
                kortsl: 3
            }
        }),
    )
    const {container} = mount(OneLineSchema, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {idx: 0})
    expect(container.querySelectorAll('svg.sheet').length).toBeGreaterThan(2)
})
test('zoom buttons scale the schema and stay inside the sheet corner', () => {
    const {container} = mount(OneLineSchema, base(), {idx: 0})
    const wrap = () => container.querySelector('.zoomscroll > div')
    expect(wrap().style.width).toBe('100%')
    fireEvent.click(screen.getByTitle('Inzoomen'))
    expect(wrap().style.width).toBe('150%')
    expect(screen.getByTitle('Zoom terugzetten (100%)')).toHaveTextContent('150%')
    fireEvent.click(screen.getByTitle('Zoom terugzetten (100%)'))
    fireEvent.click(screen.getByTitle('Uitzoomen'))
    expect(container.querySelector('.zoomctl').parentElement.style.width).toBe('75%')
    expect(container.querySelector('.zoomctl.inset')).toBeInTheDocument()
})
test('Polen, Beveiliging and Curve are short inputs on one line with their label, grouped in one block', () => {
    const {container} = mount(OneLineSchema, DEF(), {idx: 0})
    fireEvent.click(pal('Kring (automaat)'))
    const polen = screen.getByLabelText('Polen'),
        amp = screen.getByLabelText('Beveiliging (A)'),
        curve = screen.getByLabelText('Curve')
    expect(polen.maxLength).toBe(1)
    expect(amp.maxLength).toBe(4)
    expect(curve.maxLength).toBe(1)
    // the three belong to the same row container, the longer fields (Kabel) keep the full-width layout below it
    const shortRow = container.querySelector('#eds-short-polen')
    expect(shortRow).not.toBeNull()
    expect([...shortRow.querySelectorAll('input')]).toEqual([polen, amp, curve])
    expect(shortRow.contains(screen.getByLabelText('Kabel'))).toBe(false)
    expect(screen.getByLabelText('Kabel').style.width).toBe('100%')
})
test('aansluiting: Polen and Beveiliging are grouped, Differentieel stays full width', () => {
    const {container} = mount(OneLineSchema, DEF(), {idx: 0})
    fireEvent.click(row('Aansluiting net'))
    const r = container.querySelector('#eds-short-polen')
    expect([...r.querySelectorAll('input')]).toEqual([screen.getByLabelText('Polen'), screen.getByLabelText('Beveiliging (A)')])
    expect(r.contains(screen.getByLabelText('Differentieel (mA)'))).toBe(false)
})


test('details are edited in a text area (Enter = new line) and only for elements, not for distribution parts', () => {
    const t = [node('A', 'bord', [node('K', 'kring', [node('I', 'omvormer', [], {label: 'PV-omvormer', p: {aantal: 1, details: 'Merk: X|Type: Y'}})])])],
        {spy} = mount(OneLineSchema, withTree(t), {idx: 0})
    fireEvent.click(row('K'))
    expect(btn('eds-details')).toBeNull()
    fireEvent.click(screen.getAllByText('PV-omvormer')[0]) // the row of the structure list, not the drawing
    const ta = screen.getByLabelText('Details')
    expect(ta.tagName).toBe('TEXTAREA')
    expect(ta.value).toBe('Merk: X|Type: Y')
    fireEvent.change(ta, {target: {value: 'Merk: X\nType: Y\nS/N: 1\n'}})
    expect(spy.p.een[0].tree[0].children[0].children[0].p.details).toBe('Merk: X\nType: Y\nS/N: 1\n')
})
