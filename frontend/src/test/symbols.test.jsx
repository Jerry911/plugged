// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {render} from '@testing-library/react'
import {allTypes, arcPath, BUILTIN, BUILTIN_KEYS, setLibrary, Sym, typeOf} from '../symbols.jsx'
import {reach} from '../boardModel.js'

test('keys unique and parents refer to existing types', () => {
    const ks = BUILTIN.map((t) => t.k)
    expect(new Set(ks).size).toBe(ks.length)
    BUILTIN.forEach((t) => t.parents.forEach((k) => expect(ks).toContain(k)))
})
test('root element has no parents', () => expect(BUILTIN.filter((t) => !t.parents.length).map((t) => t.k)).toEqual(['aansluiting']))
test('allTypes adds custom types and handles missing custom', () => {
    expect(allTypes({})).toHaveLength(BUILTIN.length)
    const p = {custom: [{id: '1', name: 'Mijn', shapes: []}]}
    const t = allTypes(p).at(-1)
    expect(t).toMatchObject({k: 'custom:1', cat: 'Eigen', place: true, parents: expect.arrayContaining(['kring'])})
})
test('typeOf falls back to first builtin', () => {
    expect(typeOf({custom: []}, 'nope').k).toBe('aansluiting')
    expect(typeOf({custom: []}, 'oven').name).toBe('Oven')
})
test('Sym renders every shape kind', () => {
    const {container} = render(
        <svg>
            <Sym
                shapes={[
                    {t: 'line', x1: 0, y1: 0, x2: 1, y2: 1},
                    {t: 'circle', cx: 1, cy: 1, r: 1},
                    {t: 'rect', x: 0, y: 0, w: 2, h: 2},
                    {t: 'text', x: 1, y: 1, s: 'M'},
                ]}
            />
        </svg>,
    )
    expect(container.querySelector('line')).toBeTruthy()
    expect(container.querySelector('circle')).toBeTruthy()
    expect(container.querySelector('rect')).toBeTruthy()
    expect(container.querySelector('text').textContent).toBe('M')
})
test('every builtin symbol renders', () =>
    BUILTIN.forEach((t) => {
        const {container, unmount} = render(
            <svg>
                <Sym shapes={t.shapes} />
            </svg>,
        )
        expect(container.querySelector('g').children.length).toBe(t.shapes.length)
        unmount()
    }))

afterEach(() => setLibrary(null))
test('arcPath draws clockwise on screen and flags large arcs', () => {
    expect(arcPath({cx: 9, cy: 12, r: 6, a1: -90, a2: 90})).toBe('M9 6A6 6 0 0 1 9 18')
    expect(arcPath({cx: 12, cy: 17, r: 7, a1: 180, a2: 360})).toBe('M5 17A7 7 0 0 1 19 17')
    expect(arcPath({cx: 0, cy: 0, r: 5, a1: 0, a2: 270})).toBe('M5 0A5 5 0 1 1 0 -5')
})
test('Sym renders arcs and text with its own font size', () => {
    const {container} = render(
        <svg>
            <Sym
                shapes={[
                    {t: 'arc', cx: 9, cy: 12, r: 6, a1: -90, a2: 90},
                    {t: 'text', x: 1, y: 1, s: 'kWh', fs: 8},
                    {t: 'text', x: 1, y: 1, s: 'X'},
                ]}
                w={0.6}
            />
        </svg>,
    )
    expect(container.querySelector('path').getAttribute('d')).toBe('M9 6A6 6 0 0 1 9 18')
    expect(container.querySelector('g').getAttribute('stroke-width')).toBe('0.6')
    const ts = container.querySelectorAll('text')
    expect(ts[0].getAttribute('font-size')).toBe('8')
    expect(ts[1].getAttribute('font-size')).toBe('10')
})
test('setLibrary swaps the active component library, empty or missing falls back to the standard components', () => {
    const mine = {k: 'mijn', name: 'Mijn', cat: 'X', parents: [], place: true, shapes: []}
    setLibrary([...BUILTIN, mine])
    expect(typeOf({}, 'mijn').name).toBe('Mijn')
    expect(allTypes({})).toHaveLength(BUILTIN.length + 1)
    setLibrary([])
    expect(allTypes({})).toHaveLength(BUILTIN.length)
    expect(typeOf({}, 'mijn').k).toBe('aansluiting')
    expect(BUILTIN_KEYS.has('oven')).toBe(true)
})
test('legacy project components keep working unless the library already has them', () => {
    const p = {custom: [{id: '1', name: 'Oud', shapes: [], cat: 'Mijn cat', parents: ['bord'], place: false}]}
    expect(typeOf(p, 'custom:1')).toMatchObject({name: 'Oud', cat: 'Mijn cat', parents: ['bord'], place: false})
    setLibrary([...BUILTIN, {k: 'custom:1', name: 'Nieuw', cat: 'Eigen', parents: [], place: true, shapes: []}])
    expect(allTypes(p)).toHaveLength(BUILTIN.length + 1)
    expect(typeOf(p, 'custom:1').name).toBe('Nieuw')
})
test('placeable symbols have a connection point on the centre line', () => {
    BUILTIN.filter((t) => t.place).forEach((t) => expect(reach(t.shapes), t.k).not.toBeNull())
})
test('switch lines touch: supply line ends on the hinge circle, lever starts on it', () => {
    const [wire, hinge, lever, ...flags] = typeOf({}, 'schakelaar').shapes
    expect(wire.x2).toBe(hinge.cx - hinge.r)
    expect(Math.hypot(lever.x1 - hinge.cx, lever.y1 - hinge.cy)).toBeCloseTo(hinge.r, 1)
    flags.forEach((f) => {
        const t = ((f.x1 - lever.x1) * (lever.x2 - lever.x1) + (f.y1 - lever.y1) * (lever.y2 - lever.y1)) / Math.hypot(lever.x2 - lever.x1, lever.y2 - lever.y1) ** 2
        const px = lever.x1 + t * (lever.x2 - lever.x1),
            py = lever.y1 + t * (lever.y2 - lever.y1)
        expect(Math.hypot(f.x1 - px, f.y1 - py)).toBeLessThan(0.05)
    })
    expect(flags.length).toBeGreaterThan(0)
    expect(typeOf({}, 'wissel').shapes.length).toBe(typeOf({}, 'schakelaar').shapes.length)
})
test('lamp cross ends lie on the circle', () => {
    const [c, a, b] = typeOf({}, 'lichtpunt').shapes
    ;[[a.x1, a.y1], [a.x2, a.y2], [b.x1, b.y1], [b.x2, b.y2]].forEach(([x, y]) => expect(Math.hypot(x - c.cx, y - c.cy)).toBeCloseTo(c.r, 1))
})
test('reach follows arcs that cross the centre line', () => {
    expect(reach([{t: 'arc', cx: 9, cy: 12, r: 6, a1: -90, a2: 90}])).toEqual([15, 15])
    expect(reach([{t: 'arc', cx: 9, cy: 12, r: 6, a1: 90, a2: 270}])).toEqual([3, 3])
    expect(reach([{t: 'arc', cx: 12, cy: 17, r: 7, a1: 180, a2: 360}])[0]).toBeCloseTo(7.1, 1)
    expect(reach([{t: 'arc', cx: 12, cy: 17, r: 7, a1: 0, a2: 90}])).toBeNull()
    expect(reach([{t: 'arc', cx: 12, cy: 40, r: 7, a1: 0, a2: 360}])).toBeNull()
})
