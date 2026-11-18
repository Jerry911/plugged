// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The bedradingsschema: connection points of symbols, wires (ends, right angles, junctions), and how its pages live in a project.
import {
    boxHitsBox,
    colourOf,
    dashArray,
    detachFrom,
    endResolver,
    inOneWire,
    inWiring,
    junctions,
    lengthOf,
    moveWire,
    pathOf,
    pinPosition,
    symbolPins,
    wireHitsBox,
    wirePoints,
} from '../../model/wiring.js'
import {sheetPlan, pageNumbering} from '../../model/boardLayout.js'
import {isProjectEmpty, newProject, normalizeProject} from '../../app/projectDocument.js'
import {embedSymbols, setLibrary, typeOf} from '../../symbols/symbolLibrary.js'
import {copyPlan} from '../../features/wiring/WiringPanels.jsx'
import {sheetFileNames} from '../../features/project/pagesExport.js'
import standard from '../fixtures/standardSymbols.js'
import {baseProject, node} from '../utils.jsx'

const project = (over = {}) => ({...baseProject(), wire: [{id: 'w1', name: 'Bedrading 1', walls: [], items: [], wires: [], boxes: []}], ...over})
const free = (x, y) => ({x, y})
const wire = (id, a, b, points = [], extra = {}) => ({id, a, b, points, style: 'solid', color: 'black', w: 0.35, ...extra})
const atPoints = (points) => (end) => end?.item != null ? points[end.item][end.pin] : end

describe('symbols on the bedradingsschema', () => {
    test('a symbol is in the palette of the eendraadschema unless it says no; in the one of the wiring when it says so or can be placed', () => {
        expect(inOneWire({})).toBe(true)
        expect(inOneWire({een: false})).toBe(false)
        expect(inWiring({place: true})).toBe(true)
        expect(inWiring({place: false})).toBe(false)
        expect(inWiring({place: false, wire: true})).toBe(true)
        expect(inWiring({place: true, wire: false})).toBe(false)
        // the standard catalog: contacts only for the wiring, furniture also on the plans, breakers also on the wiring
        expect(inOneWire(typeOf(null, 'contact_no'))).toBe(false)
        expect(inWiring(typeOf(null, 'contact_no'))).toBe(true)
        expect(typeOf(null, 'bed').place).toBe(true)
        expect(inWiring(typeOf(null, 'kring'))).toBe(true)
        expect(inOneWire(typeOf(null, 'kring'))).toBe(true)
    })
    test('the connection points: given by the symbol, else the ends of its lines on the border, else the centre', () => {
        expect(symbolPins({pins: [[12, 0]], shapes: []})).toEqual([[12, 0]])
        expect(symbolPins({pins: [], shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}]})).toEqual([])
        expect(symbolPins({shapes: [{t: 'line', x1: 1, y1: 12, x2: 8, y2: 12}, {t: 'line', x1: 8, y1: 12, x2: 22.5, y2: 12}]})).toEqual([
            [1, 12],
            [22.5, 12],
        ])
        expect(symbolPins({shapes: [{t: 'circle', cx: 12, cy: 12, r: 5}]})).toEqual([[12, 12]])
        expect(symbolPins(null)).toEqual([])
        // e.g. the socket of the catalog: its lead on the left
        expect(symbolPins(typeOf(null, 'stopcontact'))).toEqual([[1, 12]])
        expect(symbolPins(typeOf(null, 'contactor3'))).toHaveLength(6)
        expect(symbolPins(typeOf(null, 'wc'))).toEqual([])
    })
    test('a connection point on the sheet follows the position, the size and the rotation of the symbol', () => {
        expect(pinPosition({x: 100, y: 50, r: 0}, [12, 0], 10)).toEqual({x: 100, y: 45})
        expect(pinPosition({x: 100, y: 50, r: 90}, [12, 0], 10)).toEqual({x: 105, y: 50})
        expect(pinPosition({x: 100, y: 50, r: 180}, [24, 12], 24)).toEqual({x: 88, y: 50})
    })
    test('the standard symbols of the wiring keep their settings in a project for somebody who does not have them', () => {
        setLibrary([])
        try {
            const own = {k: 'custom:k', name: 'Contact', cat: 'Eigen', parents: [], place: false, shapes: [{t: 'line', x1: 12, y1: 0, x2: 12, y2: 24}], een: false, wire: true, pins: []}
            setLibrary([own])
            const embedded = embedSymbols(project({wire: [{id: 'w1', name: 'B', walls: [], items: [{id: 'i', kind: 'sym', type: 'custom:k', x: 1, y: 1}], wires: [], boxes: []}]}))
            expect(embedded.symbols).toEqual([own])
        } finally {
            setLibrary(standard)
        }
    })
})

describe('wires', () => {
    const points = {c: [free(60, 55), free(60, 65)], l: [free(100, 115)]}
    test('an end on a symbol is where its connection point is; a symbol that is gone leaves the end where it was last seen', () => {
        const items = [{id: 'c', kind: 'sym', x: 60, y: 60}]
        const resolve = endResolver(items, (item) => points[item.id])
        expect(resolve({item: 'c', pin: 1})).toEqual(free(60, 65))
        expect(resolve({item: 'gone', pin: 0, x: 3, y: 4})).toEqual(free(3, 4))
        expect(resolve({item: 'c', pin: 7})).toBeNull()
        expect(resolve(free(1, 2))).toEqual(free(1, 2))
    })
    test('a right-angled wire leaves its start vertically and turns horizontally after that', () => {
        const resolve = atPoints(points)
        expect(wirePoints(wire('w', {item: 'c', pin: 1}, {item: 'l', pin: 0}, [], {ortho: true}), resolve)).toEqual([free(60, 65), free(60, 115), free(100, 115)])
        expect(wirePoints(wire('w', free(0, 0), free(30, 20), [free(10, 10)], {ortho: true}), resolve)).toEqual([free(0, 0), free(0, 10), free(10, 10), free(30, 10), free(30, 20)])
        // a free wire goes straight from point to point
        expect(wirePoints(wire('w', free(0, 0), free(30, 20)), resolve)).toEqual([free(0, 0), free(30, 20)])
        // no corner where the points are aligned already, and no double points
        expect(wirePoints(wire('w', free(0, 0), free(30, 0), [free(0, 0)], {ortho: true}), resolve)).toEqual([free(0, 0), free(30, 0)])
        expect(wirePoints(wire('w', {item: 'x', pin: 0}, free(1, 1)), () => null)).toEqual([])
    })
    test('path, length and style', () => {
        const route = [free(0, 0), free(30, 0), free(30, 40)]
        expect(pathOf(route)).toBe('M0 0 L30 0 L30 40')
        expect(lengthOf(route)).toBe(70)
        expect(dashArray('solid')).toBeUndefined()
        expect(dashArray('dashed', 0.35)).toBe('3 1.5')
        expect(dashArray('dashed', 0.7)).toBe('6 3')
        expect(dashArray('dashdot', 0.35).split(' ')).toHaveLength(4)
        expect(colourOf('blue')).toBe('#1565c0')
        expect(colourOf('#123456')).toBe('#123456')
    })
    test('a junction dot where a wire branches off another one or three wires meet, not where two wires join or on a symbol', () => {
        const resolve = atPoints({s: [free(50, 0)]})
        const main = wire('m', free(0, 0), free(100, 0))
        expect(junctions([main], resolve)).toEqual([])
        expect(junctions([main, wire('b', free(50, 40), free(50, 0))], resolve)).toEqual([free(50, 0)])
        // two wires end to end: a bend, no dot
        expect(junctions([main, wire('n', free(100, 0), free(100, 50))], resolve)).toEqual([])
        expect(junctions([main, wire('n', free(100, 0), free(100, 50)), wire('o', free(100, 0), free(150, 0))], resolve)).toEqual([free(100, 0)])
        // on the connection point of a symbol the symbol shows the connection
        expect(junctions([wire('p', {item: 's', pin: 0}, free(50, 40)), wire('q', {item: 's', pin: 0}, free(90, 40)), wire('r', {item: 's', pin: 0}, free(0, 40))], resolve)).toEqual([])
    })
    test('deleting a symbol leaves the ends of its wires where they were; moving a wire moves only its free ends and bends', () => {
        const resolve = atPoints(points)
        const wires = [wire('w', {item: 'c', pin: 1}, {item: 'l', pin: 0}), wire('v', free(1, 1), free(2, 2))]
        expect(detachFrom(wires, new Set(['l']), resolve)).toEqual([wire('w', {item: 'c', pin: 1}, free(100, 115)), wires[1]])
        expect(moveWire(wire('w', {item: 'c', pin: 1}, free(10, 10), [free(5, 5)]), 2, 3)).toEqual(wire('w', {item: 'c', pin: 1}, free(12, 13), [free(7, 8)]))
    })
    test('a selection rectangle catches a wire it crosses and a frame whose side it touches, not a frame around it', () => {
        expect(wireHitsBox([free(0, 10), free(100, 10)], {x0: 40, y0: 0, x1: 60, y1: 20})).toBe(true)
        expect(wireHitsBox([free(0, 10), free(100, 10)], {x0: 40, y0: 30, x1: 60, y1: 50})).toBe(false)
        const frame = {x1: 0, y1: 0, x2: 100, y2: 100}
        expect(boxHitsBox(frame, {x0: -5, y0: 40, x1: 5, y1: 60})).toBe(true)
        expect(boxHitsBox(frame, {x0: 40, y0: 40, x1: 60, y1: 60})).toBe(false)
    })
})

describe('the pages of the bedradingsschema in a project', () => {
    test('a new project has one empty page; older projects get it when they are opened', () => {
        const fresh = newProject()
        expect(fresh.wire).toEqual([{id: 'w1', name: 'Bedrading 1', walls: [], items: [], wires: [], boxes: []}])
        const old = normalizeProject({...baseProject()})
        expect(old.wire).toHaveLength(1)
        expect(old.wire[0]).toMatchObject({walls: [], items: [], wires: [], boxes: []})
        // a page without its lists gets them
        expect(normalizeProject({...baseProject(), wire: [{id: 'x', name: 'X', wires: [wire('w', free(0, 0), free(1, 1))]}]}).wire[0]).toMatchObject({
            id: 'x',
            walls: [],
            items: [],
            boxes: [],
            wires: [expect.objectContaining({id: 'w'})],
        })
    })
    test('a wire or a frame makes a project non-empty', () => {
        expect(isProjectEmpty(newProject())).toBe(true)
        const withWire = newProject()
        withWire.wire[0].wires.push(wire('w', free(0, 0), free(1, 1)))
        expect(isProjectEmpty(withWire)).toBe(false)
        const withFrame = newProject()
        withFrame.wire[0].boxes.push({id: 'b', x1: 0, y1: 0, x2: 5, y2: 5})
        expect(isProjectEmpty(withFrame)).toBe(false)
    })
    test('its pages are printed after the situatieschema, an empty one is left out; in its own tab every page counts', () => {
        const p = project()
        p.een[0].tree = [node('a', 'aansluiting', [node('b', 'bord')])]
        expect(sheetPlan(p).map((sheet) => sheet.kind)).toEqual(['een', 'sit'])
        expect(pageNumbering(p, p.wire[0])).toEqual({number: 1, total: 1})
        p.wire[0].items.push({id: 'i', kind: 'sym', type: 'klem', x: 10, y: 10})
        p.wire.push({id: 'w2', name: 'Bedrading 2', walls: [], items: [], wires: [], boxes: []})
        expect(sheetPlan(p).map((sheet) => sheet.kind)).toEqual(['een', 'sit', 'wire'])
        expect(pageNumbering(p, p.wire[1])).toEqual({number: 2, total: 2})
        expect(sheetFileNames(p, 'svg').at(-1)).toBe('03 Bedradingsschema - Bedrading 1.svg')
    })
    test('copying a plan: walls, doors and texts with new ids, symbols as loose symbols with their marking', () => {
        const p = project({
            een: [{id: 'e1', name: 'Blad 1', tree: [node('a', 'aansluiting', [node('b', 'bord', [node('k', 'kring', [node('s', 'stopcontact', [], {p: {h: true}})], {label: 'A'})])])]}],
            sit: [
                {
                    id: 's1',
                    name: 'Plan',
                    walls: [{id: 'm', x1: 0, y1: 0, x2: 10, y2: 0}],
                    items: [
                        {id: 'p', kind: 'sym', node: 's', x: 5, y: 5, r: 0, s: 7},
                        {id: 'q', kind: 'sym', node: 'gone', x: 5, y: 5},
                        {id: 'r', kind: 'sym', type: 'bed', x: 50, y: 50, mark: 'Bed'},
                        {id: 't', kind: 'text', x: 1, y: 1, txt: 'Keuken'},
                    ],
                },
            ],
        })
        const copied = copyPlan(p, p.sit[0], true)
        expect(copied.walls).toEqual([expect.objectContaining({x1: 0, y1: 0, x2: 10, y2: 0})])
        expect(copied.walls[0].id).not.toBe('m')
        expect(copied.items.map((item) => item.type || item.kind)).toEqual(['stopcontact', 'bed', 'text'])
        expect(copied.items[0]).toMatchObject({kind: 'sym', type: 'stopcontact', mark: 'A1', h: true, x: 5, y: 5})
        expect(copied.items[0].node).toBeUndefined()
        expect(copied.items[1]).toMatchObject({mark: 'Bed'})
        expect(copyPlan(p, p.sit[0], false).items.map((item) => item.kind)).toEqual(['text'])
    })
})
