// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {render} from '@testing-library/react'
import {allTypes, arcPath, setLibrary, shapesOf, sockShapes, stackOf, Sym, typeOf} from '../symbols.jsx'
import {reach} from '../boardModel.js'
import standard from './fixtures/standard-symbols.json'

// the symbols come from the backend; these tests use its standard catalog (see setup.js)
const BUILTIN = standard

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
test('typeOf falls back to the net connection, and to a placeholder when there is no library', () => {
    expect(typeOf({custom: []}, 'nope').k).toBe('aansluiting')
    expect(typeOf({custom: []}, 'oven').name).toBe('Oven')
    setLibrary(null)
    expect(typeOf({custom: []}, 'nope')).toMatchObject({k: '?', parents: []})
    expect(allTypes({})).toEqual([])
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

afterEach(() => setLibrary(standard))
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
test('setLibrary swaps the active symbol library; without symbols nothing is known', () => {
    const mine = {k: 'mijn', name: 'Mijn', cat: 'X', parents: [], place: true, shapes: []}
    setLibrary([...BUILTIN, mine])
    expect(typeOf({}, 'mijn').name).toBe('Mijn')
    expect(allTypes({})).toHaveLength(BUILTIN.length + 1)
    setLibrary([])
    expect(allTypes({})).toHaveLength(0)
    expect(typeOf({}, 'mijn').k).toBe('?')
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
    expect(flags).toHaveLength(1)
    expect(typeOf({}, 'schakelaar2').shapes).toHaveLength(typeOf({}, 'schakelaar').shapes.length + 1)
    expect(typeOf({}, 'schakelaar3').shapes).toHaveLength(typeOf({}, 'schakelaar').shapes.length + 2)
})
test('multi-way switches have a lever with a flag on both sides of the hinge circle', () => {
    const levers = (k) => typeOf({}, k).shapes.filter((h) => h.t === 'line' && h.y1 !== 12 && h.x1 !== h.x2 && Math.abs(h.y2 - h.y1) > 4)
    expect(levers('wissel')).toHaveLength(2)
    expect(levers('omschakelaar')).toHaveLength(2)
    expect(levers('kruis')).toHaveLength(4)
})
test('lichtpunt is a supply line that ends in the centre of a cross', () => {
    const [wire, a, b] = typeOf({}, 'lichtpunt').shapes
    expect(wire.y1).toBe(12)
    expect([(a.x1 + a.x2) / 2, (b.x1 + b.x2) / 2]).toEqual([wire.x2, wire.x2])
    expect([(a.y1 + a.y2) / 2, (b.y1 + b.y2) / 2]).toEqual([12, 12])
})
test('filled shapes are drawn with a fill, all others without', () => {
    const {container} = render(
        <svg>
            <Sym shapes={[{t: 'circle', cx: 1, cy: 1, r: 1, f: 1}, {t: 'circle', cx: 1, cy: 1, r: 1}, {t: 'rect', x: 0, y: 0, w: 2, h: 2, f: 1}, {t: 'rect', x: 0, y: 0, w: 2, h: 2}]} stroke="#123" />
        </svg>,
    )
    const fills = [...container.querySelectorAll('circle, rect')].map((e) => e.getAttribute('fill'))
    expect(fills).toEqual(['#123', null, '#123', null])
})
test('every standard symbol is marked as builtin and unmodified', () => BUILTIN.forEach((t) => expect([t.builtin, t.modified], t.k).toEqual([true, false])))
test('reach follows arcs that cross the centre line', () => {
    expect(reach([{t: 'arc', cx: 9, cy: 12, r: 6, a1: -90, a2: 90}])).toEqual([15, 15])
    expect(reach([{t: 'arc', cx: 9, cy: 12, r: 6, a1: 90, a2: 270}])).toEqual([3, 3])
    expect(reach([{t: 'arc', cx: 12, cy: 17, r: 7, a1: 180, a2: 360}])[0]).toBeCloseTo(7.1, 1)
    expect(reach([{t: 'arc', cx: 12, cy: 17, r: 7, a1: 0, a2: 90}])).toBeNull()
    expect(reach([{t: 'arc', cx: 12, cy: 40, r: 7, a1: 0, a2: 360}])).toBeNull()
})

test('socket variants: bar for the protective conductor, feet for kinderveiligheid, stacked arcs when horizontal', () => {
    const lines = (s) => s.filter((h) => h.t === 'line').length
    const plain = sockShapes({pe: false}),
        pe = sockShapes({pe: true}),
        kid = sockShapes({pe: true, kid: true})
    expect(lines(pe)).toBe(lines(plain) + 1)
    expect(lines(kid)).toBe(lines(pe) + 2)
    expect(sockShapes({n: 3}, false)).toContainEqual(expect.objectContaining({s: '3'}))
    const h = sockShapes({kid: true, n: 3}, true)
    expect(h.filter((s) => s.t === 'arc')).toHaveLength(3)
    expect(h.filter((s) => s.t === 'arc').every((a) => a.cx + a.r <= 24)).toBe(true)
    expect(sockShapes({h: true}, true)).toContainEqual(expect.objectContaining({s: 'h'}))
    expect(sockShapes({h: true})).toContainEqual(expect.objectContaining({s: 'h'}))
    expect(reach(sockShapes({n: 4}, true))).not.toBeNull()
})
test('stackOf only applies to sockets and multiplies the type count with p.aantal', () => {
    expect(stackOf(typeOf({}, 'lichtpunt'), {aantal: 3})).toBeNull()
    expect(stackOf(typeOf({}, 'stopcontact'))).toEqual({n: 1, hor: true})
    expect(stackOf(typeOf({}, 'stopcontact2'), {aantal: 2})).toEqual({n: 4, hor: true})
    expect(stackOf(typeOf({}, 'stopcontact'), {aantal: 2, hor: false})).toEqual({n: 2, hor: false})
})
test('symbols are drawn with round joins so lever and flag touch', () => {
    const {container} = render(<svg><Sym shapes={typeOf({}, 'schakelaar').shapes} /></svg>)
    expect(container.querySelector('g').getAttribute('stroke-linejoin')).toBe('round')
    expect(container.querySelector('g').getAttribute('stroke-linecap')).toBe('round')
})

const sockets = () => BUILTIN.filter((t) => t.sock)
test('the sockets of the catalog are drawn like the generator draws them (frontend and backend agree)', () => {
    expect(sockets().length).toBeGreaterThanOrEqual(7)
    sockets().forEach((t) => expect(sockShapes(t.sock), t.k).toEqual(t.shapes))
})
test('sockets lie in the line: the supply enters the apex of an arch that opens away from it, nothing hangs below the line', () => {
    sockets().forEach((t) => {
        expect(t.shapes[0], t.k).toEqual({t: 'line', x1: 1, y1: 12, x2: 4, y2: 12})
        const arcs = t.shapes.filter((h) => h.t === 'arc')
        expect(arcs.length).toBe(t.sock.n || 1)
        arcs.forEach((a) => expect([a.cy, a.a1, a.a2], t.k).toEqual([12, 90, 270]))
        // symmetric around the line y = 12 (apart from the little 'h' of the waterproof socket)
        const ys = t.shapes.filter((h) => h.t !== 'text').flatMap((h) => (h.t === 'line' ? [h.y1, h.y2] : [h.cy - h.r, h.cy + h.r]))
        expect(Math.min(...ys) + Math.max(...ys), t.k).toBeCloseTo(24, 5)
    })
})
test('a socket is drawn as stored, stacked when there are more, and vertically (hanging) on request', () => {
    const sc = typeOf({}, 'stopcontact')
    expect(shapesOf(sc)).toBe(sc.shapes)
    expect(shapesOf(sc, {aantal: 1})).toBe(sc.shapes)
    expect(shapesOf(sc, {aantal: 3}).filter((h) => h.t === 'arc')).toHaveLength(3)
    expect(shapesOf(typeOf({}, 'stopcontact2'), {aantal: 2}).filter((h) => h.t === 'arc')).toHaveLength(4)
    expect(shapesOf(sc, {hor: false})).toEqual(sockShapes(sc.sock, false))
    expect(shapesOf(sc, {hor: false}).some((h) => h.t === 'arc' && h.a1 === 180)).toBe(true)
    const lp = typeOf({}, 'lichtpunt')
    expect(shapesOf(lp, {aantal: 3})).toBe(lp.shapes)
})
test('switches lean 25 degrees from the vertical like in the PDF, with the supply entering the hinge from the left', () => {
    for (const k of ['schakelaar', 'schakelaar2', 'schakelaar3', 'verklikker']) {
        const t = typeOf({}, k),
            lever = t.shapes.find((h) => h.t === 'line' && h.y1 !== 12 && h.x1 !== h.x2 && Math.abs(h.y2 - h.y1) > 7)
        const deg = (Math.atan2(lever.x2 - lever.x1, lever.y1 - lever.y2) * 180) / Math.PI
        expect(deg, k).toBeCloseTo(25, 0)
        expect(t.shapes[0], k).toMatchObject({t: 'line', x1: 1, y1: 12, y2: 12})
    }
})
