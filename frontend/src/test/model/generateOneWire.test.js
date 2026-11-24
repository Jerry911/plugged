// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Eendraadschema maken: the loose symbols of the plans become circuits by their text (B4 = point 4 of circuit B).
import {BREAKERS, CABLE_FOR_BREAKER, CABLES, generateOneWire, parseMark, planOneWire} from '../../model/generateOneWire.js'
import {circuitMarks} from '../../model/project.js'
import {flatten} from '../../model/tree.js'
import {typeOf} from '../../symbols/symbolLibrary.js'
import {baseProject, node} from '../utils.jsx'

let next = 0
const sym = (type, mark, extra = {}) => ({id: 'i' + ++next, kind: 'sym', type, x: 10 * next, y: 20, r: 0, s: 7, ...(mark === undefined ? {} : {mark}), ...extra})
const withPlan = (items, een) => ({...baseProject(), ...(een ? {een} : {}), sit: [{id: 's1', name: 'Plan 1', walls: [], items}]})
const shape = (nodes) => nodes.map((element) => (element.children.length ? {[element.type]: shape(element.children)} : element.type))
const circuitsOf = (project) => flatten(project.een.flatMap((page) => page.tree)).filter((element) => element.type === 'kring')

test('a text is a circuit letter and a point number', () => {
    expect(parseMark('B4')).toEqual({letter: 'B', number: 4})
    expect(parseMark(' b 12 ')).toEqual({letter: 'B', number: 12})
    expect(parseMark('AA3')).toEqual({letter: 'AA', number: 3})
    expect(parseMark('C-2')).toEqual({letter: 'C', number: 2})
    for (const text of ['', 'B', '4', 'Keuken', 'B0', 'B4a', undefined]) expect(parseMark(text)).toBeNull()
})

test('one point per number: the switches in series, the lamp under the last one (B3: schakelaar → lamp, B4: wissel → wissel → lamp)', () => {
    const project = withPlan([
        sym('lichtpunt', 'B4'),
        sym('schakelaar', 'B3'),
        sym('wissel', 'B4'),
        sym('lichtpunt', 'B3'),
        sym('wissel', 'B4'),
    ])
    const {project: made} = generateOneWire(project, typeOf)
    const [circuit] = circuitsOf(made)
    expect(circuit.label).toBe('B')
    // two points; B3 and B4 are their numbers (positions 1 and 2), so they are written on the points
    expect(shape(circuit.children)).toEqual([{schakelaar: ['lichtpunt']}, {wissel: [{wissel: ['lichtpunt']}]}])
    expect(circuit.children.map((point) => point.p?.nr)).toEqual(['3', '4'])
    // every symbol is linked to its element, and its text now comes from the eendraadschema
    const marks = circuitMarks(made)
    made.sit[0].items.forEach((item, index) => {
        expect(item.node).toBeTruthy()
        expect(item.type).toBeUndefined()
        expect(item.mark).toBeUndefined()
        expect(marks.get(item.node)).toBe(project.sit[0].items[index].mark)
        expect(item.x).toBe(project.sit[0].items[index].x)
    })
})

test('the same lamp more than once in one point is one element with its count (B1: 4 spots, B2: 3 lamps and a waterproof one)', () => {
    const project = withPlan([
        sym('schakelaar', 'B1'),
        sym('spot', 'B1'),
        sym('spot', 'B1'),
        sym('spot', 'B1'),
        sym('spot', 'B1'),
        sym('lichtpunt', 'B2'),
        sym('lichtpunt', 'B2'),
        sym('lichtpunt', 'B2'),
        sym('lichtpunt', 'B2', {h: true}),
        sym('wissel', 'B3'),
        sym('wissel', 'B3'),
        sym('lichtpunt', 'B3'),
    ])
    const {project: made} = generateOneWire(project, typeOf)
    const [circuit] = circuitsOf(made)
    // without a switch the rest hangs under the first element: the three lamps, with the waterproof one under it
    expect(shape(circuit.children)).toEqual([{schakelaar: ['spot']}, {lichtpunt: ['lichtpunt']}, {wissel: [{wissel: ['lichtpunt']}]}])
    const [spot] = circuit.children[0].children
    expect(spot.p).toEqual({aantal: 4})
    expect(circuit.children[1].p).toEqual({aantal: 3})
    expect(circuit.children[1].children[0].p).toEqual({h: true})
    // two wissels stay two switches in series
    expect(circuit.children[2].p).toBeUndefined()
    // all four spots on the plan are linked to the one element
    expect(made.sit[0].items.filter((item) => item.node === spot.id)).toHaveLength(4)
})

test('only lighting: 16 A with 3G1,5; anything else (an outlet, an appliance, lighting mixed with outlets) 20 A with 3G2,5', () => {
    const {project: made} = generateOneWire(
        withPlan([
            sym('schakelaar', 'A1'),
            sym('lichtpunt', 'A1'),
            sym('spot', 'A2'),
            sym('stopcontact', 'C1'),
            sym('stopcontact', 'C2'),
            sym('schakelaar', 'D1'),
            sym('lichtpunt', 'D1'),
            sym('stopcontact', 'D2'),
            sym('wasmachine', 'E1'),
        ]),
        typeOf,
    )
    const specs = Object.fromEntries(circuitsOf(made).map((circuit) => [circuit.label, [circuit.p.amp, circuit.p.kabel, circuit.info]]))
    expect(specs).toEqual({
        A: [16, 'XVB Cca 3G1,5', 'B16 2P XVB Cca 3G1,5'],
        C: [20, 'XVB Cca 3G2,5', 'B20 2P XVB Cca 3G2,5'],
        D: [20, 'XVB Cca 3G2,5', 'B20 2P XVB Cca 3G2,5'],
        E: [20, 'XVB Cca 3G2,5', 'B20 2P XVB Cca 3G2,5'],
    })
    // the circuits in alphabetical order under the board of the new project, with its usual defaults (2 poles, curve B, automaat)
    const board = flatten(made.een[0].tree).find((element) => element.type === 'bord')
    expect(board.children.map((circuit) => circuit.label)).toEqual(['A', 'C', 'D', 'E'])
    expect(board.children[0].p).toMatchObject({polen: 2, curve: 'B', bescherming: 'automatisch'})
})

test('symbols without a circuit number are left out and named; furniture and the board are not part of a circuit', () => {
    const project = withPlan([sym('stopcontact', 'A1'), sym('stopcontact'), sym('lichtpunt', 'Keuken'), sym('bed', 'A2'), sym('bord', 'X1')])
    const plan = planOneWire(project, typeOf)
    expect(plan.circuits.map((circuit) => circuit.letter)).toEqual(['A'])
    expect(plan.skipped.map(({item, reason}) => [item.type, reason])).toEqual([
        ['stopcontact', 'noLabel'],
        ['lichtpunt', 'noLabel'],
    ])
    const {project: made} = generateOneWire(project, typeOf)
    expect(made.sit[0].items.map((item) => !!item.node)).toEqual([true, false, false, false, false])
})

test('an existing eendraadschema: new circuits under its board, new points at the end of a circuit that exists; nothing else changes', () => {
    const een = [
        {
            id: 'e1',
            name: 'Blad 1',
            tree: [node('A', 'aansluiting', [node('BRD', 'bord', [node('K', 'kring', [node('S1', 'stopcontact'), node('S2', 'stopcontact')], {label: 'A'})])])],
        },
    ]
    const project = withPlan([sym('stopcontact', 'A3'), sym('stopcontact', 'a5'), sym('stopcontact', 'A2'), sym('schakelaar', 'B1'), sym('lichtpunt', 'B1')], een)
    const plan = planOneWire(project, typeOf)
    // A2 is already a point of circuit A
    expect(plan.skipped.map(({item, reason}) => [item.mark, reason])).toEqual([['A2', 'taken']])
    expect(plan.circuits.map((circuit) => [circuit.letter, !!circuit.existing])).toEqual([
        ['A', true],
        ['B', false],
    ])
    const {project: made} = generateOneWire(project, typeOf)
    const [a, b] = circuitsOf(made)
    expect(a.id).toBe('K')
    expect(a.children.map((point) => point.id).slice(0, 2)).toEqual(['S1', 'S2'])
    // A3 is the third point anyway; A5 is the fourth, so it carries its number
    expect(a.children.slice(2).map((point) => point.p?.nr)).toEqual([undefined, '5'])
    expect(a.p).toBeUndefined()
    expect(b.label).toBe('B')
    expect(flatten(made.een[0].tree).find((element) => element.id === 'BRD').children.map((circuit) => circuit.id)).toEqual(['K', b.id])
    const marks = circuitMarks(made)
    expect(made.sit[0].items.filter((item) => item.node).map((item) => marks.get(item.node))).toEqual(['A3', 'A5', 'B1', 'B1'])
})

test('the waterproof property and the size and turn of a symbol stay; symbols on every plan count', () => {
    const project = {
        ...baseProject(),
        sit: [
            {id: 's1', name: 'Gelijkvloers', walls: [], items: [sym('stopcontact', 'A1', {h: true, r: 90, s: 9})]},
            {id: 's2', name: 'Verdieping', walls: [], items: [sym('stopcontact', 'A2')]},
        ],
    }
    const {project: made} = generateOneWire(project, typeOf)
    const [circuit] = circuitsOf(made)
    expect(circuit.children).toHaveLength(2)
    expect(circuit.children[0].p).toEqual({h: true})
    expect(made.sit[0].items[0]).toMatchObject({r: 90, s: 9})
    expect(made.sit[1].items[0].node).toBe(circuit.children[1].id)
})

test('a project without a board gets the connection and board of a new project; nothing to make leaves the project as it is', () => {
    const {project: made} = generateOneWire(withPlan([sym('stopcontact', 'A1')]), typeOf)
    expect(made.een[0].tree.map((element) => element.type)).toEqual(['aansluiting'])
    expect(shape(made.een[0].tree)).toEqual([{aansluiting: [{bord: [{kring: ['stopcontact']}]}]}])
    const empty = withPlan([sym('stopcontact')])
    expect(generateOneWire(empty, typeOf).project).toBe(empty)
})

test('the breaker and cable chosen in the dialog, per new circuit; an existing circuit keeps its own, a blank cable keeps the planned one', () => {
    const een = [{id: 'e1', name: 'Blad 1', tree: [node('AA', 'aansluiting', [node('BRD', 'bord', [node('K', 'kring', [], {label: 'A', p: {amp: 16}})])])]}]
    const project = withPlan([sym('stopcontact', 'A1'), sym('stopcontact', 'B1'), sym('lichtpunt', 'C1'), sym('stopcontact', 'D1')], een)
    const choices = {A: {amp: 32}, B: {amp: 25, kabel: 'XVB Cca 3G4'}, C: {kabel: '  VOB 3G1,5 in buis '}, D: {kabel: '   '}}
    const plan = planOneWire(project, typeOf, choices)
    expect(plan.circuits.map((circuit) => [circuit.letter, circuit.amp, circuit.kabel])).toEqual([
        ['A', undefined, undefined],
        ['B', 25, 'XVB Cca 3G4'],
        ['C', 16, 'VOB 3G1,5 in buis'],
        ['D', 20, 'XVB Cca 3G2,5'],
    ])
    const {project: made} = generateOneWire(project, typeOf, choices)
    const byLetter = Object.fromEntries(circuitsOf(made).map((circuit) => [circuit.label, circuit]))
    expect(byLetter.A.p).toEqual({amp: 16})
    expect([byLetter.B.p.amp, byLetter.B.p.kabel, byLetter.B.info]).toEqual([25, 'XVB Cca 3G4', 'B25 2P XVB Cca 3G4'])
    expect([byLetter.C.p.amp, byLetter.C.p.kabel]).toEqual([16, 'VOB 3G1,5 in buis'])
    expect([byLetter.D.p.amp, byLetter.D.p.kabel]).toEqual([20, 'XVB Cca 3G2,5'])
})

test('every breaker to choose from has its cable', () => {
    for (const amp of BREAKERS) expect(CABLES).toContain(CABLE_FOR_BREAKER[amp])
})

describe('the aansluiting net is always there and complete', () => {
    const DEFAULTS = {teller: true, polen: 4, amp: 40, bescherming: 'differentieel', delta: 300, diffType: 'A', kabel: '4x16'}
    const page = (tree) => [{id: 'e1', name: 'Blad 1', tree}]
    const made = (tree) => generateOneWire(withPlan([sym('stopcontact', 'A1')], page(tree)), typeOf).project.een[0].tree

    test('an aansluiting without its properties (an older project) gets those of a new project, so its head is drawn', () => {
        const [aansluiting] = made([node('AA', 'aansluiting', [node('BRD', 'bord')])])
        expect(aansluiting.id).toBe('AA')
        expect(aansluiting.label).toBe('AA')
        expect(aansluiting.p).toMatchObject(DEFAULTS)
    })

    test('a board without an aansluiting above it gets one', () => {
        const tree = made([node('BRD', 'bord')])
        expect(shape(tree)).toEqual([{aansluiting: [{bord: [{kring: ['stopcontact']}]}]}])
        expect(tree[0].p).toMatchObject(DEFAULTS)
        expect(tree[0].children[0].id).toBe('BRD')
        // also when the board hangs under a meter of its own
        expect(shape(made([node('T', 'teller', [node('BRD', 'bord')])]))).toEqual([{aansluiting: [{teller: [{bord: [{kring: ['stopcontact']}]}]}]}])
    })

    test('a complete aansluiting, or an older one with its meter and main switch as elements, stays as it is', () => {
        const own = {teller: false, polen: 2, amp: 25, bescherming: 'automatisch'}
        expect(made([node('AA', 'aansluiting', [node('BRD', 'bord')], {p: own})])[0].p).toEqual(own)
        const [older] = made([node('AA', 'aansluiting', [node('T', 'teller', [node('H', 'hoofdschakelaar', [node('BRD', 'bord')])])])])
        expect(older.p).toBeUndefined()
    })

    test('also when only an existing circuit gets points', () => {
        const [aansluiting] = made([node('AA', 'aansluiting', [node('BRD', 'bord', [node('K', 'kring', [], {label: 'A'})])])])
        expect(aansluiting.p).toMatchObject(DEFAULTS)
        expect(aansluiting.children[0].children.map((circuit) => circuit.id)).toEqual(['K'])
    })
})

test('the dialog shows the same lamp more than once as one with its count', async () => {
    const {pointText} = await import('../../features/situation/GenerateOneWireDialog.jsx')
    const {symbolName} = await import('../../symbols/symbolLibrary.js')
    const project = baseProject(),
        name = (type) => symbolName(typeOf(project, type))
    expect(pointText(project, ['schakelaar', 'spot', 'spot', 'spot', 'lichtpunt'])).toBe(`${name('schakelaar')} → ${name('spot')} x3, ${name('lichtpunt')}`)
})

test('deleting the eendraadschema (or one element) leaves the symbols on the plan as loose symbols, so it can be generated again', async () => {
    const {keepOrphanSymbols} = await import('../../model/project.js')
    const project = withPlan([
        sym('schakelaar', 'B1'),
        sym('spot', 'B1'),
        sym('spot', 'B1'),
        sym('stopcontact', 'A1', {h: true}),
        {id: 'txt', kind: 'text', txt: 'Keuken', x: 5, y: 5, s: 4, r: 0},
    ])
    const {project: made} = generateOneWire(project, typeOf)
    expect(made.sit[0].items.filter((item) => item.node)).toHaveLength(4)
    // the sheet of the eendraadschema deleted
    const deleted = keepOrphanSymbols(made, {...made, een: []})
    const items = deleted.sit[0].items
    expect(items.map((item) => [item.type, item.mark, !!item.h, item.node])).toEqual([
        ['schakelaar', 'B1', false, undefined],
        ['spot', 'B1', false, undefined],
        ['spot', 'B1', false, undefined],
        ['stopcontact', 'A1', true, undefined],
        [undefined, undefined, false, undefined],
    ])
    expect(items.map((item) => [item.x, item.y])).toEqual(made.sit[0].items.map((item) => [item.x, item.y]))
    // ... and generating makes it again
    const {project: again, plan} = generateOneWire({...deleted, een: project.een}, typeOf)
    expect(plan.circuits.map((circuit) => circuit.letter)).toEqual(['A', 'B'])
    expect(again.sit[0].items.filter((item) => item.node)).toHaveLength(4)
    // one element deleted: only its symbol becomes loose
    const socket = flatten(made.een[0].tree).find((element) => element.type === 'stopcontact'),
        withoutSocket = {
            ...made,
            een: made.een.map((page) => ({...page, tree: JSON.parse(JSON.stringify(page.tree), (key, value) => (Array.isArray(value) ? value.filter((element) => element?.id !== socket.id) : value))})),
        }
    const kept = keepOrphanSymbols(made, withoutSocket).sit[0].items
    expect(kept.filter((item) => item.node)).toHaveLength(3)
    expect(kept[3]).toMatchObject({type: 'stopcontact', mark: 'A1', h: true})
    // a change that removes no element changes nothing
    const renamed = {...made, name: 'x'}
    expect(keepOrphanSymbols(made, renamed)).toBe(renamed)
    const sameTree = {...made, een: made.een.map((page) => ({...page}))}
    expect(keepOrphanSymbols(made, sameTree)).toBe(sameTree)
})
