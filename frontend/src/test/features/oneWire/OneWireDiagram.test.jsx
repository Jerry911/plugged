// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {createEvent, fireEvent} from '@testing-library/react'
import OneWireDiagram, {keepZoomAnchor, zoomAnchorOf} from '../../../features/oneWire/OneWireDiagram.jsx'
import {findNode as find, rotateNode as rotate} from '../../../model/tree.js'
import {defaultTree} from '../../../model/boardLayout.js'
import {setLanguage, t as translate} from '../../../i18n/translate.js'
import {baseProject as base, byId, getById, mount, node} from '../../utils.jsx'

const btn = byId
// a symbol of the palette (by symbol key) and the row of an element in the Opbouw list (by element id)
const pal = (key) => getById('eds-palette-' + key),
    row = (id) => getById('eds-tree-' + id)
// the field of a property in Eigenschappen
const field = (key) => getById('eds-field-' + key)
beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {
    })
})
const withTree = (tree) => ({...base(), een: [{id: 'e1', name: 'Blad 1', tree}]})
test('adds root, child; enforces hierarchy; free mode', () => {
    // the connection (root) is not in the palette: it comes with a new schema
    const {spy} = mount(OneWireDiagram, withTree([node('A', 'aansluiting')]), {pageIndex: 0})
    fireEvent.click(pal('stopcontact')) // there is no circuit to hang it under
    expect(window.alert).toHaveBeenCalledWith(translate('oneWire.selectParentFirst'))
    fireEvent.click(row('A'))
    fireEvent.click(pal('bord'))
    expect(spy.project.een[0].tree[0].children).toHaveLength(1)
    fireEvent.click(pal('stopcontact'))
    expect(window.alert).toHaveBeenLastCalledWith(expect.stringContaining("'Stopcontact (aarding)'"))
    fireEvent.click(byId('eds-free-hierarchy'))
    fireEvent.click(pal('stopcontact'))
    expect(spy.project.een[0].tree[0].children[0].children).toHaveLength(1)
})
test('free mode without selection adds at root', () => {
    const {spy} = mount(OneWireDiagram, base(), {pageIndex: 0})
    fireEvent.click(byId('eds-free-hierarchy'))
    fireEvent.click(pal('stopcontact'))
    expect(spy.project.een[0].tree).toHaveLength(1)
})
test('search filters palette', () => {
    const {container} = mount(OneWireDiagram, base(), {pageIndex: 0})
    fireEvent.change(byId('eds-palette-search'), {target: {value: 'oven'}})
    expect(container.querySelectorAll('.pal details')).toHaveLength(1)
    fireEvent.change(byId('eds-palette-search'), {target: {value: 'zzzz'}})
    expect(container.querySelectorAll('.pal details')).toHaveLength(0)
})
test('edit properties, move, indent, outdent, duplicate, delete', () => {
    const t = [node('A', 'bord', [node('B', 'kring')]), node('C', 'bord')],
        {spy} = mount(OneWireDiagram, withTree(t), {pageIndex: 0})
    fireEvent.click(row('C'))
    fireEvent.change(byId('eds-label'), {target: {value: 'Cx'}})
    expect(spy.project.een[0].tree[1].label).toBe('Cx')
    fireEvent.change(byId('eds-specs'), {target: {value: 'B16'}})
    expect(spy.project.een[0].tree[1].info).toBe('B16')
    fireEvent.click(btn('eds-earlier'))
    expect(spy.project.een[0].tree[0].label).toBe('Cx')
    fireEvent.click(btn('eds-later'))
    fireEvent.click(btn('eds-indent'))
    expect(spy.project.een[0].tree[0].children.map((n) => n.id)).toEqual(['B', 'C'])
    fireEvent.click(btn('eds-outdent'))
    expect(spy.project.een[0].tree.map((n) => n.id)).toEqual(['A', 'C'])
    fireEvent.click(btn('eds-duplicate'))
    expect(spy.project.een[0].tree).toHaveLength(3)
    fireEvent.keyDown(document.body, {key: 'Delete'})
    expect(spy.project.een[0].tree).toHaveLength(2)
})
test('toolbar buttons have a tooltip and an accessible name', () => {
    mount(OneWireDiagram, withTree([node('A', 'bord'), node('C', 'bord')]), {pageIndex: 0})
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
        {spy} = mount(OneWireDiagram, withTree(t), {pageIndex: 0}),
        S = () => spy.project.een[0].tree[0].children[0].children[0].children[0]
    // select through the tree list
    fireEvent.click(row('K'))
    expect(btn('eds-rotate-cw')).toBeDisabled()
    expect(btn('eds-rotate-ccw')).toBeDisabled()
    fireEvent.click(row('S'))
    expect(selected().id).toBe('eds-tree-S')
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
    const {container} = mount(OneWireDiagram, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {pageIndex: 0})
    expect(container.querySelector('svg.sheet g[transform^="rotate(90 "]')).toBeInTheDocument()
})
test('Eigenschappen sits above Opbouw and can be closed with the cross', () => {
    mount(OneWireDiagram, withTree([node('Aa', 'bord'), node('Cc', 'bord')]), {pageIndex: 0})
    expect(btn('eds-close')).toBeNull()
    fireEvent.click(row('Cc'))
    const eig = getById('eds-props'),
        opb = getById('eds-tree-title')
    expect(eig.compareDocumentPosition(opb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(btn('eds-close'))
    expect(byId('eds-props')).toBeNull()
    expect(selected()).toBeNull()
})
test('trash button in the toolbar deletes the selected element with its children', () => {
    const {spy} = mount(OneWireDiagram, withTree([node('Aa', 'bord', [node('Bb', 'kring')]), node('Cc', 'bord')]), {pageIndex: 0})
    fireEvent.click(row('Aa'))
    expect(btn('eds-delete')).toHaveAttribute('title')
    fireEvent.click(btn('eds-delete'))
    expect(spy.project.een[0].tree.map((n) => n.id)).toEqual(['Cc'])
    expect(byId('eds-props')).toBeNull()
})
test('a trash can appears on the selected symbol in the drawing and deletes it', () => {
    const t = defaultTree()
    t[0].children[0].children = [node('K', 'kring', [node('S', 'stopcontact'), node('T', 'stopcontact')])]
    const {spy} = mount(OneWireDiagram, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {pageIndex: 0}),
        kids = () => spy.project.een[0].tree[0].children[0].children[0].children
    expect(btn('eds-drawing-delete')).toBeNull()
    fireEvent.click(row('S'))
    expect(document.querySelectorAll('#eds-drawing-delete')).toHaveLength(1)
    fireEvent.click(btn('eds-drawing-delete'))
    expect(kids().map((n) => n.id)).toEqual(['T'])
    expect(btn('eds-drawing-delete')).toBeNull()
})
test('main levels can be folded and unfolded with the arrow in the Opbouw list', () => {
    const t = [node('Aa', 'aansluiting', [node('Bb', 'bord', [node('Kk', 'kring', [node('Ss', 'stopcontact'), node('Tt', 'stopcontact')])])])],
        {spy} = mount(OneWireDiagram, withTree(t), {pageIndex: 0}),
        names = () => [...document.querySelectorAll('#eds-tree > div')].map((d) => d.id)
    expect(names()).toHaveLength(5)
    expect(btn('eds-toggle-Ss')).toBeNull()
    expect(btn('eds-toggle-Kk')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(btn('eds-toggle-Kk'))
    expect(names()).toHaveLength(3)
    expect(row('Kk')).toHaveTextContent('(+2)')
    expect(btn('eds-toggle-Kk')).toHaveAttribute('aria-expanded', 'false')
    expect(selected()).toBeNull() // folding does not select
    fireEvent.click(btn('eds-toggle-Bb'))
    expect(names()).toHaveLength(2)
    fireEvent.click(btn('eds-toggle-Bb'))
    fireEvent.click(btn('eds-toggle-Kk'))
    expect(names()).toHaveLength(5)
    expect(spy.project.een[0].tree).toEqual(t) // the data is untouched
})
test('selecting a hidden element in the drawing unfolds its levels', () => {
    const t = [node('Aa', 'aansluiting', [node('Bb', 'bord', [node('Kk', 'kring', [node('Ss', 'stopcontact')])])])],
        {container} = mount(OneWireDiagram, withTree(t), {pageIndex: 0})
    fireEvent.click(btn('eds-toggle-Kk'))
    expect(document.querySelectorAll('#eds-tree > div')).toHaveLength(3)
    fireEvent.click(container.querySelector('svg.sheet g[style*="pointer"]'))
    expect(document.querySelectorAll('#eds-tree > div')).toHaveLength(4)
    expect(selected().id).toBe('eds-tree-Ss')
})
test('adding an element to a folded circuit unfolds it', () => {
    const {spy} = mount(OneWireDiagram, DEF(), {pageIndex: 0})
    fireEvent.click(pal('kring'))
    fireEvent.click(pal('stopcontact'))
    const circuit = board1(spy).children[0] // Aansluiting net > Verdeelbord > circuit A
    expect(circuit.label).toBe('A')
    fireEvent.click(getById('eds-toggle-' + circuit.id))
    expect(document.querySelectorAll('#eds-tree > div')).toHaveLength(3)
    // (a lichtpunt does not hang directly under a circuit, it hangs behind a switch: a wall lamp does)
    fireEvent.click(pal('wandlamp'))
    expect(document.querySelectorAll('#eds-tree > div')).toHaveLength(5)
    expect(board1(spy).children[0].children).toHaveLength(2)
})
test('custom components appear in palette', () => {
    const p = {...base(), custom: [{id: '9', name: 'Mijn ding', shapes: []}]}
    mount(OneWireDiagram, p, {pageIndex: 0})
    expect(pal('custom_9')).toBeInTheDocument()
})
test('Delete/Backspace remove the selected node; ignored in inputs and without selection', () => {
    const {spy} = mount(OneWireDiagram, withTree([node('Aa', 'bord'), node('Bb', 'bord')]), {pageIndex: 0}),
        b = document.body
    fireEvent.keyDown(b, {key: 'Delete'})
    expect(spy.project.een[0].tree).toHaveLength(2)
    expect(byId('eds-props')).toBeNull()
    fireEvent.click(row('Aa'))
    expect(selected().id).toBe('eds-tree-Aa')
    fireEvent.keyDown(byId('eds-label'), {key: 'Delete'})
    fireEvent.keyDown(b, {key: 'x'})
    expect(spy.project.een[0].tree).toHaveLength(2)
    fireEvent.keyDown(b, {key: 'Delete'})
    expect(spy.project.een[0].tree.map((n) => n.id)).toEqual(['Bb'])
    fireEvent.click(row('Bb'))
    fireEvent.keyDown(b, {key: 'Backspace'})
    expect(spy.project.een[0].tree).toHaveLength(0)
})
test('Delete key removes node with its children', () => {
    const {spy} = mount(OneWireDiagram, withTree([node('Aa', 'bord', [node('K', 'kring')])]), {pageIndex: 0})
    fireEvent.click(row('Aa'))
    fireEvent.keyDown(document.body, {key: 'Delete'})
    expect(spy.project.een[0].tree).toEqual([])
})
test('footer cells in the diagram call onFooter', () => {
    const fn = vi.fn(),
        {container} = mount(OneWireDiagram, base(), {pageIndex: 0, onFooter: fn})
    fireEvent.click(getById('eds-sheet-1-drawing-footer-titel'))
    expect(fn).toHaveBeenCalledWith('titel')
})

const DEF = () => ({...base(), een: [{id: 'e1', name: 'Blad 1', tree: defaultTree()}]})
const selected = () => document.querySelector('#eds-tree .sel')
const board1 = (spy) => spy.project.een[0].tree[0].children[0]
test('circuits are appended to the board from left to right with defaults and free letters', () => {
    const {spy} = mount(OneWireDiagram, DEF(), {pageIndex: 0})
    for (let i = 0; i < 3; i++) fireEvent.click(pal('kring'))
    const b = board1(spy)
    expect(b.children.map((k) => k.label)).toEqual(['A', 'B', 'C'])
    expect(b.children[0]).toMatchObject({
        type: 'kring',
        info: 'B16 2P XVB Cca 3G2,5',
        p: {polen: 2, amp: 16, curve: 'B', bescherming: 'automatisch'},
    })
})
test('elements go into the selected circuit; the circuit stays selected; a new circuit becomes selected', () => {
    const {spy} = mount(OneWireDiagram, DEF(), {pageIndex: 0})
    fireEvent.click(pal('kring'))
    fireEvent.click(pal('stopcontact'))
    fireEvent.click(pal('stopcontact'))
    fireEvent.click(pal('wandlamp'))
    expect(board1(spy).children[0].children.map((c) => c.type)).toEqual(['stopcontact', 'stopcontact', 'wandlamp'])
    expect(selected().id).toBe('eds-tree-' + board1(spy).children[0].id)
    expect(board1(spy).children[0].label).toBe('A')
    fireEvent.click(pal('kring'))
    expect(board1(spy).children).toHaveLength(2)
    expect(selected().id).toBe('eds-tree-' + board1(spy).children[1].id)
    expect(board1(spy).children[1].label).toBe('B')
})
test('without selection an element is added to the last circuit', () => {
    const t = defaultTree()
    t[0].children[0].children = [node('K1', 'kring'), node('K2', 'kring')]
    const {spy} = mount(OneWireDiagram, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {pageIndex: 0})
    fireEvent.click(pal('motor'))
    expect(board1(spy).children[1].children.map((c) => c.type)).toEqual(['motor'])
    expect(board1(spy).children[0].children).toHaveLength(0)
})
test('kring fields update props and the derived spec string', () => {
    const {spy} = mount(OneWireDiagram, DEF(), {pageIndex: 0})
    fireEvent.click(pal('kring'))
    const k = () => board1(spy).children[0],
        f = field
    fireEvent.change(f('amp'), {target: {value: '20'}})
    fireEvent.change(f('curve'), {target: {value: 'C'}})
    fireEvent.change(f('polen'), {target: {value: '4'}})
    fireEvent.change(f('kabel'), {target: {value: 'XVB 3G4'}})
    fireEvent.change(f('tekst'), {target: {value: 'Oven'}})
    fireEvent.change(f('kortsl'), {target: {value: '6'}})
    expect(k().info).toBe('C20 4P XVB 3G4')
    expect(k().p).toMatchObject({amp: '20', curve: 'C', polen: '4', tekst: 'Oven', kortsl: '6'})
    fireEvent.change(getById('eds-label'), {target: {value: 'Z'}})
    expect(k().label).toBe('Z')
    expect(byId('eds-specs')).toBeNull()
})
test('aansluiting, bord and element fields', () => {
    const {spy, container} = mount(OneWireDiagram, DEF(), {pageIndex: 0})
    fireEvent.click(row(spy.project.een[0].tree[0].id))
    fireEvent.change(field('delta'), {target: {value: '30'}})
    expect(spy.project.een[0].tree[0].p.delta).toBe('30')
    fireEvent.click(row(board1(spy).id))
    fireEvent.click(byId('eds-earthed'))
    expect(board1(spy).p.geaard).toBe(false)
    expect(byId('eds-field-aantal')).toBeNull()
    fireEvent.click(pal('kring'))
    fireEvent.click(pal('stopcontact'))
    fireEvent.click(row(board1(spy).children[0].children[0].id))
    fireEvent.change(field('aantal'), {target: {value: '4'}})
    fireEvent.change(field('nr'), {target: {value: '2'}})
    expect(board1(spy).children[0].children[0].p).toMatchObject({aantal: '4', nr: '2'})
    fireEvent.change(byId('eds-specs'), {target: {value: '16A'}})
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
    const {container} = mount(OneWireDiagram, withTree(t), {pageIndex: 0})
    fireEvent.click(container.querySelector('svg.sheet text[data-nid="K"]'))
    expect(selected().id).toBe('eds-tree-K')
    getById('eds-props')
    fireEvent.click(container.querySelector('svg.sheet g[style*="pointer"]'))
    expect(selected().id).toBe('eds-tree-S')
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
    const {container} = mount(OneWireDiagram, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {pageIndex: 0})
    expect(container.querySelectorAll('svg.sheet').length).toBeGreaterThan(2)
})
test('zoom buttons scale the schema and stay inside the sheet corner', () => {
    const {container} = mount(OneWireDiagram, base(), {pageIndex: 0})
    const wrap = () => container.querySelector('.zoomscroll > div')
    expect(wrap().style.width).toBe('100%')
    fireEvent.click(byId('eds-zoom-1-in'))
    expect(wrap().style.width).toBe('150%')
    expect(byId('eds-zoom-1-reset')).toHaveTextContent('150%')
    fireEvent.click(byId('eds-zoom-1-reset'))
    fireEvent.click(byId('eds-zoom-1-out'))
    expect(container.querySelector('.zoomctl').parentElement.style.width).toBe('75%')
    expect(container.querySelector('.zoomctl.inset')).toBeInTheDocument()
})
test('Polen, Beveiliging and Curve are short inputs on one line with their label, grouped in one block', () => {
    const {container} = mount(OneWireDiagram, DEF(), {pageIndex: 0})
    fireEvent.click(pal('kring'))
    const polen = field('polen'),
        amp = field('amp'),
        curve = field('curve')
    expect(polen.maxLength).toBe(1)
    expect(amp.maxLength).toBe(4)
    expect(curve.maxLength).toBe(1)
    // the three belong to the same row container, the longer fields (Kabel) keep the full-width layout below it
    const shortRow = container.querySelector('#eds-short-polen')
    expect(shortRow).not.toBeNull()
    expect([...shortRow.querySelectorAll('input')]).toEqual([polen, amp, curve])
    expect(shortRow.contains(field('kabel'))).toBe(false)
    expect(field('kabel').style.width).toBe('100%')
})
test('aansluiting: Polen and Beveiliging are grouped, Differentieel stays full width', () => {
    const {container, spy} = mount(OneWireDiagram, DEF(), {pageIndex: 0})
    fireEvent.click(row(spy.project.een[0].tree[0].id))
    const r = container.querySelector('#eds-short-polen')
    expect([...r.querySelectorAll('input')]).toEqual([field('polen'), field('amp')])
    expect(r.contains(field('delta'))).toBe(false)
})


test('details are edited in a text area (Enter = new line) and only for elements, not for distribution parts', () => {
    const t = [node('A', 'bord', [node('K', 'kring', [node('I', 'omvormer', [], {label: 'PV-omvormer', p: {aantal: 1, details: 'Merk: X|Type: Y'}})])])],
        {spy} = mount(OneWireDiagram, withTree(t), {pageIndex: 0})
    fireEvent.click(row('K'))
    expect(btn('eds-details')).toBeNull()
    fireEvent.click(row('I')) // the row of the structure list, not the drawing
    const ta = byId('eds-details')
    expect(ta.tagName).toBe('TEXTAREA')
    expect(ta.value).toBe('Merk: X|Type: Y')
    fireEvent.change(ta, {target: {value: 'Merk: X\nType: Y\nS/N: 1\n'}})
    expect(spy.project.een[0].tree[0].children[0].children[0].p.details).toBe('Merk: X\nType: Y\nS/N: 1\n')
})

test('a focus (message of the check) selects the element, centers it below the check popup and is consumed', () => {
    vi.useFakeTimers()
    const pop = document.createElement('div')
    pop.className = 'verify'
    pop.getBoundingClientRect = () => ({top: 0, bottom: 200, left: 0, right: 0, width: 0, height: 200})
    document.body.appendChild(pop)
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return this === pop ? {top: 0, bottom: 200, height: 200, left: 0, width: 0} : {top: 700, bottom: 740, height: 40, left: 0, width: 40}
    })
    const done = vi.fn(),
        t = [node('A', 'bord', [node('K', 'kring', [node('I', 'omvormer', [], {label: 'PV-omvormer', p: {aantal: 1}})])])]
    mount(OneWireDiagram, withTree(t), {pageIndex: 0, focus: {id: 'I', n: 1}, onFocused: done})
    vi.advanceTimersByTime(100)
    // visible area = below the popup (200) to the bottom of the window: its middle is where the element's middle must end up
    const mid = 200 + (innerHeight - 200) / 2
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.calls[0][0].top).toBe(720 - mid)
    expect(done).toHaveBeenCalledTimes(1)
    expect(byId('eds-details')).toBeInTheDocument() // the element is selected: its properties are shown
    // an element that is not drawn on this sheet is still selected, without scrolling
    mount(OneWireDiagram, withTree(t), {pageIndex: 0, focus: {id: 'nope', n: 2}})
    vi.advanceTimersByTime(100)
    expect(scroll).toHaveBeenCalledTimes(1)
    rect.mockRestore()
    scroll.mockRestore()
    pop.remove()
    vi.useRealTimers()
})

// ---- insert before / after (buttons) and drag & drop from the palette ----
const chain = () => withTree([node('A', 'aansluiting', [node('B', 'bord', [node('K', 'kring', [node('S', 'schakelaar', [node('L', 'lichtpunt')])])])])])
const pick = (c, id) => fireEvent.click(c.querySelector(`[data-nid="${id}"]`))
const typeSelect = () => byId('eds-type')
const optionValues = () => [...typeSelect().querySelectorAll('option')].map((option) => option.value)
const shapeOf = (ns) => ns.map((n) => n.id + (n.children.length ? `(${shapeOf(n.children)})` : '')).join(',')

test('the "after" button inserts an empty symbol under the selected one; the Type dropdown only lists what may hang there', () => {
    const {container, spy} = mount(OneWireDiagram, chain(), {pageIndex: 0})
    pick(container, 'S')
    fireEvent.click(btn('eds-insert-after'))
    const s = find(spy.project.een[0].tree, 'S')
    expect(s.children).toHaveLength(2)
    const e = s.children[1]
    expect(e.type).toBe('leeg')
    // the new empty element is selected: its dropdown starts with the placeholder and is filtered by the "can be placed after" list
    expect(typeSelect().value).toBe('leeg')
    const values = optionValues()
    expect(values[0]).toBe('leeg') // the placeholder
    expect(values).toContain('stopcontact')
    expect(values).not.toContain('bord') // a board may not hang under a switch
    fireEvent.change(typeSelect(), {target: {value: 'stopcontact'}})
    const t = find(spy.project.een[0].tree, e.id)
    expect(t).toMatchObject({id: e.id, type: 'stopcontact', label: ''})
})
test('the "before" button puts an empty symbol between the parent and the selected symbol', () => {
    const {container, spy} = mount(OneWireDiagram, chain(), {pageIndex: 0})
    pick(container, 'S')
    fireEvent.click(btn('eds-insert-before'))
    const k = find(spy.project.een[0].tree, 'K')
    expect(k.children).toHaveLength(1)
    expect(k.children[0].type).toBe('leeg')
    expect(shapeOf(k.children[0].children)).toBe('S(L)') // the switch and its light moved under the new element
    expect(typeSelect().value).toBe('leeg')
})
test('the insert buttons are disabled when nothing fits, and for an empty symbol until it has a type', () => {
    const {container} = mount(OneWireDiagram, chain(), {pageIndex: 0})
    fireEvent.click(row('A')) // the row of the top level element in the structure list: nothing can go above it
    expect(btn('eds-insert-before')).toBeDisabled()
    fireEvent.click(byId('eds-free-hierarchy'))
    expect(btn('eds-insert-before')).toBeEnabled()
    fireEvent.click(byId('eds-free-hierarchy'))
    pick(container, 'S')
    fireEvent.click(btn('eds-insert-after'))
    expect(btn('eds-insert-after')).toBeDisabled()
    expect(btn('eds-insert-before')).toBeDisabled()
    expect(btn('eds-insert-after')).toHaveAttribute('title')
    expect(btn('eds-insert-before')).toHaveAttribute('aria-label')
})
test('dragging a symbol over the drawing previews it in blue; dropping inserts it after (right half) or before (left half)', () => {
    const {container, spy} = mount(OneWireDiagram, chain(), {pageIndex: 0}),
        at = (id) => container.querySelector(`[data-nid="${id}"]`)
    fireEvent.dragStart(pal('wandlamp'))
    expect(container.querySelector('#eds-drop-preview')).toBeNull()
    fireEvent.dragOver(at('S'), {clientX: 10}) // jsdom has no DragEvent and no layout: without a clientX the drop counts as the right half (after)
    const prev = container.querySelector('#eds-drop-preview')
    expect(prev).not.toBeNull()
    expect(prev.querySelectorAll('[stroke="#0a6cff"]').length).toBeGreaterThan(0) // the new symbol is drawn in blue
    expect(find(spy.project.een[0].tree, 'S').children).toHaveLength(1) // nothing is inserted yet
    fireEvent.drop(at('S'), {clientX: 10})
    expect(container.querySelector('#eds-drop-preview')).toBeNull()
    const s = find(spy.project.een[0].tree, 'S')
    expect(s.children.map((c) => c.type)).toEqual(['lichtpunt', 'wandlamp'])
    // left half of the light: the new symbol comes between the switch and the light
    fireEvent.dragStart(pal('wandlamp'))
    // jsdom has no DragEvent, so the coordinate is put on the event by hand
    const left = createEvent.drop(at('L'))
    Object.defineProperty(left, 'clientX', {value: -10})
    fireEvent(at('L'), left)
    const s2 = find(spy.project.een[0].tree, 'S')
    expect(s2.children.map((c) => c.type)).toEqual(['wandlamp', 'wandlamp'])
    expect(s2.children[0].children.map((c) => c.id)).toEqual(['L'])
})
test('drag & drop does not check whether a symbol fits: a verdeelbord over a symbol is previewed and dropped', () => {
    const {container, spy} = mount(OneWireDiagram, chain(), {pageIndex: 0})
    fireEvent.dragStart(pal('bord'))
    fireEvent.dragOver(container.querySelector('[data-nid="S"]'), {clientX: 10})
    expect(container.querySelector('#eds-drop-preview')).not.toBeNull()
    fireEvent.drop(container.querySelector('[data-nid="S"]'), {clientX: 10})
    expect(flatTypes(spy.project.een[0].tree).filter((t) => t === 'bord')).toHaveLength(2)
    expect(find(spy.project.een[0].tree, 'S').children.map((c) => c.type)).toContain('bord')
})
test('the preview disappears when the drag ends without a drop', () => {
    const {container} = mount(OneWireDiagram, chain(), {pageIndex: 0})
    fireEvent.dragStart(pal('wandlamp'))
    fireEvent.dragOver(container.querySelector('[data-nid="S"]'), {clientX: 10})
    expect(container.querySelector('#eds-drop-preview')).not.toBeNull()
    fireEvent.dragEnd(pal('wandlamp'))
    expect(container.querySelector('#eds-drop-preview')).toBeNull()
})
const flatTypes = (ns) => ns.flatMap((n) => [n.type, ...flatTypes(n.children)])

// ---- the next branch (B1 -> B2): button and latching onto the stem ----
const circ = () => withTree([node('A', 'aansluiting', [node('B', 'bord', [node('K', 'kring', [node('S', 'schakelaar')])])])])
const kids = (spy) => find(spy.project.een[0].tree, 'K').children
test('the branch button puts an empty symbol next to the selected one, under the same circuit (B1 -> B2)', () => {
    const {container, spy} = mount(OneWireDiagram, circ(), {pageIndex: 0})
    pick(container, 'S')
    fireEvent.click(btn('eds-insert-branch'))
    expect(kids(spy).map((c) => c.type)).toEqual(['schakelaar', 'leeg'])
    expect(kids(spy)[0].children).toHaveLength(0) // not in series under the switch
    expect(typeSelect().value).toBe('leeg')
    fireEvent.change(typeSelect(), {target: {value: 'stopcontact'}})
    expect(kids(spy).map((c) => c.type)).toEqual(['schakelaar', 'stopcontact'])
    // a top level element has no branch
    fireEvent.click(row('A'))
    expect(btn('eds-insert-branch')).toBeDisabled()
})
test('the stem of a circuit is a latch zone: dragging into it previews and drops the next branch', () => {
    const {container, spy} = mount(OneWireDiagram, circ(), {pageIndex: 0}),
        zone = () => container.querySelector('[data-stem="K"]')
    expect(container.querySelector('.main')).not.toHaveClass('eds-dragging')
    fireEvent.dragStart(pal('wandlamp'))
    expect(container.querySelector('.main')).toHaveClass('eds-dragging')
    fireEvent.dragOver(zone(), {clientX: 10})
    const prev = container.querySelector('#eds-drop-preview')
    expect(prev).not.toBeNull()
    expect(prev.querySelectorAll('[stroke="#0a6cff"]').length).toBeGreaterThan(0)
    expect(kids(spy)).toHaveLength(1) // nothing inserted yet
    // moving away detaches
    fireEvent.dragLeave(container.querySelector('#eds-sheet-1'), {relatedTarget: document.body})
    expect(container.querySelector('#eds-drop-preview')).toBeNull()
    fireEvent.dragOver(zone(), {clientX: 10})
    fireEvent.drop(zone(), {clientX: 10})
    expect(kids(spy).map((c) => c.type)).toEqual(['schakelaar', 'wandlamp'])
    expect(find(spy.project.een[0].tree, 'S').children).toHaveLength(0)
})
test('in the latch zone a smeltveiligheid goes before the circuit and a differentieel makes a new circuit; over a symbol it keeps inserting before / after it', () => {
    const {container, spy} = mount(OneWireDiagram, circ(), {pageIndex: 0})
    fireEvent.dragStart(pal('zekering'))
    fireEvent.drop(container.querySelector('[data-stem="K"]'), {clientX: 10})
    expect(find(spy.project.een[0].tree, 'B').children[0].type).toBe('zekering')
    fireEvent.dragStart(pal('diff'))
    fireEvent.drop(container.querySelector('[data-stem="K"]'), {clientX: 10})
    const dk = find(spy.project.een[0].tree, 'B').children[0].children[1]
    expect(dk).toMatchObject({type: 'kring', p: {bescherming: 'differentieel', delta: 30, diffType: 'A'}})
    fireEvent.dragStart(pal('wandlamp'))
    fireEvent.drop(container.querySelector('[data-nid="S"]'), {clientX: 10})
    expect(find(spy.project.een[0].tree, 'S').children.map((c) => c.type)).toEqual(['wandlamp'])
})

// ---- waterproof (h) is a checkbox of a socket, not a symbol of its own ----
test('Waterdicht checkbox: only for sockets, sets p.h and draws the little h in the diagram', () => {
    const {container, spy} = mount(OneWireDiagram, withTree([node('A', 'aansluiting', [node('B', 'bord', [node('K', 'kring', [node('P', 'stopcontact'), node('S', 'schakelaar')])])])]), {pageIndex: 0})
    const hs = () => [...container.querySelector('#eds-sheet-1').querySelectorAll('text')].filter((t) => t.textContent === 'h').length,
        cb = () => document.getElementById('eds-waterproof'),
        p = () => find(spy.project.een[0].tree, 'P').p
    pick(container, 'S')
    expect(cb()).toBeNull()
    pick(container, 'P')
    expect(cb().checked).toBe(false)
    expect(hs()).toBe(0)
    fireEvent.click(cb())
    expect(p().h).toBe(true)
    expect(find(spy.project.een[0].tree, 'P').type).toBe('stopcontact') // still the normal socket
    expect(hs()).toBe(1)
    expect(cb().checked).toBe(true)
    // it works for the other socket types too
    fireEvent.change(typeSelect(), {target: {value: 'stopcontact2'}})
    expect(cb().checked).toBe(true)
    fireEvent.click(cb())
    expect(p().h).toBe(false)
    expect(hs()).toBe(0)
})
test('there is no waterproof socket in the palette', () => {
    mount(OneWireDiagram, circ(), {pageIndex: 0})
    expect(byId('eds-palette-stopcontact_h')).toBeNull()
    expect(byId('eds-palette-stopcontact')).toBeTruthy()
})
test('a new element from the palette starts with an empty text; a circuit still gets its letter', () => {
    const {spy} = mount(OneWireDiagram, withTree([node('A', 'aansluiting')]), {pageIndex: 0})
    fireEvent.click(row('A'))
    fireEvent.click(pal('bord'))
    expect(spy.project.een[0].tree[0].children[0].label).toBe('')
    fireEvent.click(byId('eds-free-hierarchy'))
    fireEvent.click(pal('stopcontact'))
    expect(spy.project.een[0].tree[0].children[0].children[0].label).toBe('')
})

test('dragging a circuit onto a circuit (or one of its symbols) puts the new circuit left (left half) or right (right half) of it', () => {
    const {container, spy} = mount(OneWireDiagram, circ(), {pageIndex: 0}),
        bord = () => find(spy.project.een[0].tree, 'B').children
    fireEvent.dragStart(pal('kring'))
    fireEvent.dragOver(container.querySelector('[data-nid="S"]'), {clientX: 10})
    expect(container.querySelector('#eds-drop-preview')).not.toBeNull()
    expect(bord()).toHaveLength(1) // nothing inserted yet
    fireEvent.drop(container.querySelector('[data-nid="S"]'), {clientX: 10}) // jsdom has no layout: clientX 10 = right half
    expect(bord().map((c) => c.type)).toEqual(['kring', 'kring'])
    expect(bord()[0].id).toBe('K')
    // left half of the stem zone: the new circuit comes before K
    fireEvent.dragStart(pal('kring'))
    const left = createEvent.drop(container.querySelector('[data-stem="K"]'))
    Object.defineProperty(left, 'clientX', {value: -10})
    fireEvent(container.querySelector('[data-stem="K"]'), left)
    expect(bord()).toHaveLength(3)
    expect(bord()[1].id).toBe('K')
    expect(bord()[0].type).toBe('kring')
})
test('on the bus: a circuit becomes the last circuit, a differentieel / verdeelbord goes in front of the board, anything else hangs under the board', () => {
    const {container, spy} = mount(OneWireDiagram, circ(), {pageIndex: 0}),
        bus = () => container.querySelector('[data-bus="B"]'),
        bord = () => find(spy.project.een[0].tree, 'B')
    expect(bus()).not.toBeNull()
    fireEvent.dragStart(pal('wandlamp'))
    fireEvent.drop(bus(), {clientX: 10})
    expect(bord().children.map((c) => c.type)).toEqual(['kring', 'wandlamp'])
    fireEvent.dragStart(pal('kring'))
    fireEvent.dragOver(bus(), {clientX: 10})
    expect(container.querySelector('#eds-drop-preview [stroke="#0a6cff"]')).not.toBeNull() // the new circuit is drawn in blue
    fireEvent.drop(bus(), {clientX: 10})
    expect(bord().children.map((c) => c.type)).toEqual(['kring', 'wandlamp', 'kring'])
    // a hoofdschakelaar goes on the main line: between the connection and the board; a verdeelbord hangs under the board (the circuits stay visible)
    fireEvent.dragStart(pal('hoofdschakelaar'))
    fireEvent.drop(bus(), {clientX: 10})
    const top = find(spy.project.een[0].tree, 'A')
    expect(top.children.map((c) => c.type)).toEqual(['hoofdschakelaar'])
    expect(top.children[0].children.map((c) => c.id)).toEqual(['B'])
    fireEvent.dragStart(pal('bord'))
    fireEvent.dragOver(bus(), {clientX: 10})
    expect(container.querySelector('#eds-drop-preview line[stroke="#0a6cff"]')).not.toBeNull() // not drawn itself: the bus is marked in blue
    fireEvent.drop(bus(), {clientX: 10})
    expect(bord().children.map((c) => c.type)).toEqual(['kring', 'wandlamp', 'kring', 'bord'])
})
test('a differentieel makes a new circuit (a kring that is protected by a differentieel), just like an automaat', () => {
    const {container, spy} = mount(OneWireDiagram, circ(), {pageIndex: 0}),
        bus = () => container.querySelector('[data-bus="B"]'),
        bord = () => find(spy.project.een[0].tree, 'B')
    fireEvent.dragStart(pal('diff'))
    fireEvent.dragOver(bus(), {clientX: 10})
    expect(container.querySelector('#eds-drop-preview [stroke="#0a6cff"]')).not.toBeNull() // drawn in blue
    fireEvent.drop(bus(), {clientX: 10})
    expect(bord().children.map((c) => c.type)).toEqual(['kring', 'kring'])
    const dk = bord().children[1]
    expect(dk.p).toMatchObject({bescherming: 'differentieel', polen: 2, amp: 25, delta: 30, diffType: 'A'})
    expect(dk.label).not.toBe('K')
    // it can be corrected in the properties: Bescherming, with Δ mA and Type instead of the curve
    fireEvent.click(container.querySelector(`[data-nid="${dk.id}"]`))
    expect(byId('eds-protection').value).toBe('differentieel')
    expect(byId('eds-field-delta')).not.toBeNull()
    expect(byId('eds-field-curve')).toBeNull()
    fireEvent.change(byId('eds-protection'), {target: {value: 'automatisch'}})
    expect(bord().children[1].p.bescherming).toBe('automatisch')
    expect(byId('eds-field-curve')).not.toBeNull()
})
test('anywhere on the sheet works: above the bus the nearest circuit counts, below it the bus', () => {
    const {container, spy} = mount(OneWireDiagram, circ(), {pageIndex: 0}),
        sheet = () => container.querySelector('svg.sheet'),
        bord = () => find(spy.project.een[0].tree, 'B')
    fireEvent.dragStart(pal('kring'))
    fireEvent.drop(sheet(), {clientX: 10}) // jsdom has no layout: the right half of the nearest circuit
    expect(bord().children.map((c) => c.id)[0]).toBe('K')
    expect(bord().children).toHaveLength(2)
    fireEvent.dragStart(pal('bord'))
    fireEvent.dragOver(sheet(), {clientX: 10})
    expect(container.querySelector('#eds-drop-preview')).not.toBeNull() // previewed: the bus is marked in blue
    fireEvent.drop(sheet(), {clientX: 10})
    expect(bord().children.map((c) => c.type)).toEqual(['kring', 'kring', 'bord'])
})
test('a drop in an empty drawing becomes a top level element', () => {
    const {container, spy} = mount(OneWireDiagram, withTree([]), {pageIndex: 0})
    fireEvent.dragStart(pal('bord'))
    fireEvent.drop(container.querySelector('svg.sheet'), {clientX: 10})
    expect(spy.project.een[0].tree.map((n) => n.type)).toEqual(['bord'])
})

test('the palette, the properties and the structure list follow the language', () => {
    setLanguage('fr')
    const {spy} = mount(OneWireDiagram, DEF(), {pageIndex: 0})
    expect(pal('stopcontact')).toHaveTextContent('Prise de courant (terre)')
    expect(byId('eds-palette-search')).toHaveAttribute('placeholder', 'Rechercher un élément…')
    fireEvent.click(pal('kring'))
    expect(getById('eds-props-title')).toHaveTextContent('Propriétés')
    expect(getById('eds-tree-title')).toHaveTextContent('Structure')
    // the default labels of a new page are made in the active language
    expect(row(spy.project.een[0].tree[0].id)).toHaveTextContent('Raccordement au réseau')
})

// a sheet with a scroll pane and a drawing at the given places on the screen (jsdom has no layout)
const zoomSheet = ({sheet, pane, drawing, size = {width: 1000, height: 700}}) => {
    const sheetElement = document.createElement('div'),
        paneElement = document.createElement('div'),
        content = document.createElement('div')
    paneElement.className = 'zoomscroll'
    paneElement.appendChild(content)
    sheetElement.appendChild(paneElement)
    const rect = ({x = 0, y = 0, width = 0, height = 0}) => () => ({left: x, top: y, right: x + width, bottom: y + height, width, height})
    sheetElement.getBoundingClientRect = rect(sheet)
    paneElement.getBoundingClientRect = rect(pane)
    content.getBoundingClientRect = rect(drawing)
    Object.defineProperties(paneElement, {clientWidth: {value: pane.width}, clientHeight: {value: pane.height}})
    Object.defineProperties(content, {scrollWidth: {value: size.width}, scrollHeight: {value: size.height}})
    return {sheetElement, paneElement}
}
test('zooming aims at the middle of the part of the sheet that is on the screen', () => {
    expect(zoomAnchorOf(null)).toBeNull()
    expect(zoomAnchorOf(document.createElement('div'))).toBeNull()
    // a sheet of 400 high whose top 100 are above the screen: the middle of the visible part (y 0..300) is y 150
    const {sheetElement} = zoomSheet({sheet: {y: -100, width: 800, height: 400}, pane: {y: -100, width: 800, height: 400}, drawing: {y: -100, width: 800, height: 400}})
    expect(zoomAnchorOf(sheetElement)).toEqual({fx: 0.5, fy: 250 / 400, y: 150})
    // a sheet that is not on the screen at all: its own middle; an empty drawing: the middle
    const below = zoomSheet({sheet: {y: 5000, width: 800, height: 400}, pane: {y: 5000, width: 800, height: 400}, drawing: {y: 5000, width: 0, height: 0}})
    expect(zoomAnchorOf(below.sheetElement)).toEqual({fx: 0.5, fy: 0.5, y: 5200})
})
test('after a zoom the sheet stays on the screen: zoomed in at the top with the same point in the middle, at 100% where it was', () => {
    const scroll = vi.fn()
    vi.stubGlobal('scrollBy', scroll)
    try {
        const {sheetElement, paneElement} = zoomSheet({sheet: {y: 300, width: 800, height: 600}, pane: {y: 300, width: 800, height: 600}, drawing: {y: 300, width: 1000, height: 700}})
        keepZoomAnchor(sheetElement, {fx: 0.5, fy: 0.75, y: 400}, 1.5)
        expect(scroll).toHaveBeenLastCalledWith({top: 290, behavior: 'instant'})
        // the point at 3/4 of the drawing (525 of 700) in the middle of the pane (600 high)
        expect([paneElement.scrollLeft, paneElement.scrollTop]).toEqual([100, 225])
        keepZoomAnchor(sheetElement, {fx: 0.5, fy: 0.5, y: 400}, 1)
        // the point at half of the drawing (y 300 + 350) goes back to y 400
        expect(scroll).toHaveBeenLastCalledWith({top: 250, behavior: 'instant'})
        scroll.mockClear()
        keepZoomAnchor(sheetElement, null, 2)
        keepZoomAnchor(null, {fx: 0, fy: 0, y: 0}, 2)
        expect(scroll).not.toHaveBeenCalled()
    } finally {
        vi.unstubAllGlobals()
    }
})
