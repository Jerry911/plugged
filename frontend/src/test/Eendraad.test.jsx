// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, screen} from '@testing-library/react'
import Eendraad from '../Eendraad.jsx'
import {base, mount, node} from './utils.jsx'
import {defaultTree} from '../boardModel.js'

const pal = (n) => screen.getAllByText(n)[0],
    row = (n) => screen.getAllByText(n).at(-1)
beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
})
const withTree = (tree) => ({...base(), een: [{id: 'e1', name: 'Blad 1', tree}]})
test('adds root, child; enforces hierarchy; free mode', () => {
    const {spy} = mount(Eendraad, base(), {idx: 0})
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
    const {spy} = mount(Eendraad, base(), {idx: 0})
    fireEvent.click(screen.getByLabelText(/Vrije hiërarchie/))
    fireEvent.click(pal('Stopcontact'))
    expect(spy.p.een[0].tree).toHaveLength(1)
})
test('search filters palette', () => {
    const {container} = mount(Eendraad, base(), {idx: 0})
    fireEvent.change(screen.getByPlaceholderText('Zoek element…'), {target: {value: 'oven'}})
    expect(container.querySelectorAll('.pal details')).toHaveLength(1)
    fireEvent.change(screen.getByPlaceholderText('Zoek element…'), {target: {value: 'zzzz'}})
    expect(container.querySelectorAll('.pal details')).toHaveLength(0)
})
test('edit properties, move, indent, outdent, duplicate, delete', () => {
    const t = [node('A', 'bord', [node('B', 'kring')]), node('C', 'bord')],
        {spy} = mount(Eendraad, withTree(t), {idx: 0})
    fireEvent.click(row('C'))
    fireEvent.change(screen.getByDisplayValue('C'), {target: {value: 'Cx'}})
    expect(spy.p.een[0].tree[1].label).toBe('Cx')
    fireEvent.change(screen.getByPlaceholderText(/Specs/), {target: {value: 'B16'}})
    expect(spy.p.een[0].tree[1].info).toBe('B16')
    fireEvent.click(screen.getByText('↑'))
    expect(spy.p.een[0].tree[0].label).toBe('Cx')
    fireEvent.click(screen.getByText('↓'))
    fireEvent.click(screen.getByText('→'))
    expect(spy.p.een[0].tree[0].children.map((n) => n.id)).toEqual(['B', 'C'])
    fireEvent.click(screen.getByText('←'))
    expect(spy.p.een[0].tree.map((n) => n.id)).toEqual(['A', 'C'])
    fireEvent.click(screen.getByText('⧉'))
    expect(spy.p.een[0].tree).toHaveLength(3)
    fireEvent.keyDown(document.body, {key: 'Delete'})
    expect(spy.p.een[0].tree).toHaveLength(2)
})
test('custom components appear in palette', () => {
    const p = {...base(), custom: [{id: '9', name: 'Mijn ding', shapes: []}]}
    mount(Eendraad, p, {idx: 0})
    expect(pal('Mijn ding')).toBeInTheDocument()
})
test('Delete/Backspace remove the selected node; ignored in inputs and without selection', () => {
    const {spy} = mount(Eendraad, withTree([node('Aa', 'bord'), node('Bb', 'bord')]), {idx: 0}),
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
    const {spy} = mount(Eendraad, withTree([node('Aa', 'bord', [node('K', 'kring')])]), {idx: 0})
    fireEvent.click(row('Aa'))
    fireEvent.keyDown(document.body, {key: 'Delete'})
    expect(spy.p.een[0].tree).toEqual([])
})
test('footer cells in the diagram call onFooter', () => {
    const fn = vi.fn(),
        {container} = mount(Eendraad, base(), {idx: 0, onFooter: fn})
    fireEvent.click(container.querySelector('.fcell'))
    expect(fn).toHaveBeenCalledWith('titel')
})

const DEF = () => ({...base(), een: [{id: 'e1', name: 'Blad 1', tree: defaultTree()}]})
const selected = () => document.querySelector('.tree .sel')
const board1 = (spy) => spy.p.een[0].tree[0].children[0]
test('circuits are appended to the board from left to right with defaults and free letters', () => {
    const {spy} = mount(Eendraad, DEF(), {idx: 0})
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
    const {spy} = mount(Eendraad, DEF(), {idx: 0})
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
    const {spy} = mount(Eendraad, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {idx: 0})
    fireEvent.click(pal('Motor'))
    expect(board1(spy).children[1].children.map((c) => c.type)).toEqual(['motor'])
    expect(board1(spy).children[0].children).toHaveLength(0)
})
test('kring fields update props and the derived spec string', () => {
    const {spy} = mount(Eendraad, DEF(), {idx: 0})
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
    const {spy, container} = mount(Eendraad, DEF(), {idx: 0})
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
                node('K', 'kring', [node('S', 'stopcontact')], {p: {polen: 2, amp: 16, curve: 'B', kabel: 'x', kortsl: 3}}),
            ]),
        ]),
    ]
    const {container} = mount(Eendraad, withTree(t), {idx: 0})
    fireEvent.click([...container.querySelectorAll('svg.sheet text')].find((x) => x.textContent === 'K'))
    expect(selected()).toHaveTextContent(/^K/)
    screen.getByText('Eigenschappen')
    fireEvent.click(container.querySelector('svg.sheet g[style*="pointer"]'))
    expect(selected()).toHaveTextContent(/^S/)
})
test('wide boards are shown on several sheets', () => {
    const t = defaultTree()
    t[0].children[0].children = Array.from({length: 40}, (_, i) =>
        node('K' + i, 'kring', [node('s' + i, 'stopcontact')], {p: {polen: 2, amp: 16, curve: 'B', kabel: 'x', kortsl: 3}}),
    )
    const {container} = mount(Eendraad, {...base(), een: [{id: 'e1', name: 'x', tree: t}]}, {idx: 0})
    expect(container.querySelectorAll('svg.sheet').length).toBeGreaterThan(2)
})
