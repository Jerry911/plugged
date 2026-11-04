// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {render} from '@testing-library/react'
import {allTypes, categoryName, setLibrary, symbolName, typeOf} from '../../symbols/symbolLibrary.js'
import {arcPath, placedShapesOf, socketShapes, socketStackOf, waterproofMark} from '../../symbols/symbolShapes.js'
import SymbolGraphic from '../../symbols/SymbolGraphic.jsx'
import {connectionReach} from '../../model/boardLayout.js'
import {setLanguage} from '../../i18n/translate.js'
import standard from '../fixtures/standardSymbols.js'

// the symbols come from the backend; these tests use its standard catalog (see setup.js)
const BUILTIN = standard

test('keys unique and parents refer to existing types', () => {
    const ks = BUILTIN.map((t) => t.k)
    expect(new Set(ks).size).toBe(ks.length)
    BUILTIN.forEach((t) => t.parents.forEach((k) => expect(ks).toContain(k)))
})
test('the library has no connection symbol: the built-in connection type is the only root and the meter may hang under it', () => {
    expect(BUILTIN.some((t) => t.k === 'aansluiting')).toBe(false)
    expect(typeOf({}, 'aansluiting')).toMatchObject({name: 'Aansluiting net', parents: [], place: false})
    expect(typeOf({}, 'teller').parents).toContain('aansluiting')
    expect(typeOf({}, 'bord').parents).toContain('aansluiting')
    expect(typeOf({}, 'stopcontact').parents).not.toContain('aansluiting')
})
test('allTypes adds custom types and handles missing custom', () => {
    expect(allTypes({})).toHaveLength(BUILTIN.length)
    const p = {custom: [{id: '1', name: 'Mijn', shapes: []}]}
    const t = allTypes(p).at(-1)
    expect(t).toMatchObject({k: 'custom:1', cat: 'Eigen', place: true, parents: expect.arrayContaining(['kring'])})
})
test('typeOf falls back to the placeholder for an unknown (e.g. deleted) symbol, also when there is no library', () => {
    expect(typeOf({custom: []}, 'nope').name).toBe('Onbekend symbool')
    expect(typeOf({custom: []}, 'oven').name).toBe('Oven')
    setLibrary(null)
    expect(typeOf({custom: []}, 'nope')).toMatchObject({k: '?', parents: []})
    expect(allTypes({})).toEqual([])
})
test('Sym renders every shape kind', () => {
    const {container} = render(
        <svg>
            <SymbolGraphic
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
                <SymbolGraphic shapes={t.shapes} />
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
            <SymbolGraphic
                shapes={[
                    {t: 'arc', cx: 9, cy: 12, r: 6, a1: -90, a2: 90},
                    {t: 'text', x: 1, y: 1, s: 'kWh', fs: 8},
                    {t: 'text', x: 1, y: 1, s: 'X'},
                ]}
                strokeWidth={0.6}
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
    BUILTIN.filter((t) => t.place).forEach((t) => expect(connectionReach(t.shapes), t.k).not.toBeNull())
})
test('switch lines touch: the hinge circle sits on the line, the lever starts on its edge and a flag sits on the end of the lever', () => {
    const [hinge, lever, ...flags] = typeOf({}, 'schakelaar').shapes
    expect(hinge).toMatchObject({t: 'circle', cy: 12})
    expect(Math.hypot(lever.x1 - hinge.cx, lever.y1 - hinge.cy)).toBeCloseTo(hinge.r, 0)
    flags.forEach((f) => {
        expect([f.x1, f.y1]).toEqual([lever.x2, lever.y2])
        // perpendicular to the lever
        expect(Math.abs((f.x2 - f.x1) * (lever.x2 - lever.x1) + (f.y2 - f.y1) * (lever.y2 - lever.y1))).toBeLessThan(0.1) // (coordinates are rounded to 0.01)
    })
    expect(flags).toHaveLength(1)
    expect(typeOf({}, 'schakelaar2').shapes).toHaveLength(typeOf({}, 'schakelaar').shapes.length + 1)
    expect(typeOf({}, 'schakelaar3').shapes).toHaveLength(typeOf({}, 'schakelaar').shapes.length + 2)
})
test('multi-way switches have a lever with a flag on both sides of the hinge circle', () => {
    const levers = (k) => typeOf({}, k).shapes.filter((h) => h.t === 'line' && h.x1 !== h.x2 && Math.abs(h.y2 - h.y1) > 4)
    expect(levers('wissel')).toHaveLength(2)
    expect(levers('omschakelaar')).toHaveLength(2)
    expect(levers('kruis')).toHaveLength(4)
})
test('lichtpunt is a cross centred on the line', () => {
    const [a, b] = typeOf({}, 'lichtpunt').shapes
    expect((a.x1 + a.x2) / 2).toBeCloseTo((b.x1 + b.x2) / 2, 5)
    expect([(a.y1 + a.y2) / 2, (b.y1 + b.y2) / 2]).toEqual([12, 12])
})
test('filled shapes are drawn with a fill, all others without', () => {
    const {container} = render(
        <svg>
            <SymbolGraphic shapes={[{t: 'circle', cx: 1, cy: 1, r: 1, f: 1}, {t: 'circle', cx: 1, cy: 1, r: 1}, {t: 'rect', x: 0, y: 0, w: 2, h: 2, f: 1}, {t: 'rect', x: 0, y: 0, w: 2, h: 2}]} stroke="#123" />
        </svg>,
    )
    const fills = [...container.querySelectorAll('circle, rect')].map((e) => e.getAttribute('fill'))
    expect(fills).toEqual(['#123', null, '#123', null])
})
test('every standard symbol is marked as builtin and unmodified', () => BUILTIN.forEach((t) => expect([t.builtin, t.modified], t.k).toEqual([true, false])))
test('connectionReach follows arcs that cross the centre line', () => {
    expect(connectionReach([{t: 'arc', cx: 9, cy: 12, r: 6, a1: -90, a2: 90}])).toEqual([15, 15])
    expect(connectionReach([{t: 'arc', cx: 9, cy: 12, r: 6, a1: 90, a2: 270}])).toEqual([3, 3])
    expect(connectionReach([{t: 'arc', cx: 12, cy: 17, r: 7, a1: 180, a2: 360}])[0]).toBeCloseTo(7.1, 1)
    expect(connectionReach([{t: 'arc', cx: 12, cy: 17, r: 7, a1: 0, a2: 90}])).toBeNull()
    expect(connectionReach([{t: 'arc', cx: 12, cy: 40, r: 7, a1: 0, a2: 360}])).toBeNull()
})

test('socket variants: bar for the protective conductor, feet for kinderveiligheid, stacked arcs when horizontal', () => {
    const lines = (s) => s.filter((h) => h.t === 'line').length
    const plain = socketShapes({pe: false}),
        pe = socketShapes({pe: true}),
        kid = socketShapes({pe: true, kid: true})
    expect(lines(pe)).toBe(lines(plain) + 1)
    expect(lines(kid)).toBe(lines(pe) + 2)
    expect(socketShapes({n: 3}, false)).toContainEqual(expect.objectContaining({s: '3'}))
    const h = socketShapes({kid: true, n: 3}, true)
    expect(h.filter((s) => s.t === 'arc')).toHaveLength(3)
    // an arch is the left half of its circle: it ends at cx, and all of them fit the grid
    expect(h.filter((s) => s.t === 'arc').every((a) => a.cx <= 24)).toBe(true)
    for (const n of [1, 2, 3, 4, 6]) expect(Math.max(...socketShapes({n}, true).filter((s) => s.t === 'arc').map((a) => a.cx))).toBeLessThanOrEqual(23.4)
    // stacked sockets are chained every 6 units, longer stacks are pressed together to fit; the bar of a socket crosses the line, the ticks do not
    const apex = (n) => socketShapes({pe: true, n}, true).filter((s) => s.t === 'line' && s.x1 === s.x2 && s.y1 < 12 && s.y2 > 12).map((s) => s.x1)
    expect(apex(2)[1] - apex(2)[0]).toBeCloseTo(6, 5)
    // the second socket starts behind the end of the first arch: a visible gap
    expect(apex(2)[1] - socketShapes({n: 2}, true).find((s) => s.t === 'arc').cx).toBeGreaterThan(1.5)
    expect(apex(4)[1] - apex(4)[0]).toBeLessThan(6)
    // double, triple, quadruple, ...: every stack keeps the same proportion between the gap and the width of an arch, and stays inside the grid
    for (const n of [2, 3, 4, 6]) {
        const sh = socketShapes({pe: true, n}, true),
            ap = apex(n),
            arcs = sh.filter((h) => h.t === 'arc'),
            gap = ap[1] - arcs[0].cx
        expect(ap, 'bars ' + n).toHaveLength(n)
        expect(gap / arcs[0].r, 'gap ' + n).toBeCloseTo(0.5, 1)
        arcs.forEach((a, k) => k && expect(ap[k] - arcs[k - 1].cx, 'even ' + n).toBeCloseTo(gap, 1))
        expect(Math.max(...arcs.map((a) => a.cx))).toBeLessThanOrEqual(23.4)
        // a tick above and below every arch
        expect(sh.filter((h) => h.t === 'line' && h.x1 === h.x2 && (h.y2 <= 12 - arcs[0].r || h.y1 >= 12 + arcs[0].r)), 'ticks ' + n).toHaveLength(2 * n)
    }
    expect(socketShapes({h: true}, true)).toContainEqual(expect.objectContaining({s: 'h'}))
    expect(socketShapes({h: true})).toContainEqual(expect.objectContaining({s: 'h'}))
    expect(connectionReach(socketShapes({n: 4}, true))).not.toBeNull()
})
test('socketStackOf only applies to sockets and multiplies the type count with p.aantal', () => {
    expect(socketStackOf(typeOf({}, 'lichtpunt'), {aantal: 3})).toBeNull()
    expect(socketStackOf(typeOf({}, 'stopcontact'))).toEqual({n: 1, hor: true})
    expect(socketStackOf(typeOf({}, 'stopcontact2'), {aantal: 2})).toEqual({n: 4, hor: true})
    expect(socketStackOf(typeOf({}, 'stopcontact'), {aantal: 2, hor: false})).toEqual({n: 2, hor: false})
})
test('symbols are drawn with round joins so lever and flag touch', () => {
    const {container} = render(<svg><SymbolGraphic shapes={typeOf({}, 'schakelaar').shapes} /></svg>)
    expect(container.querySelector('g').getAttribute('stroke-linejoin')).toBe('round')
    expect(container.querySelector('g').getAttribute('stroke-linecap')).toBe('round')
})

const sockets = () => BUILTIN.filter((t) => t.sock)
// the parts of a horizontal socket drawing: arches, bars (vertical lines through the line y = 12), ticks (other vertical lines) and how far the
// supply line (horizontal lines on y = 12) reaches
const socketParts = (shapes) => {
    const sorted = (list) => list.map((shape) => JSON.stringify(shape)).sort(),
        vertical = shapes.filter((h) => h.t === 'line' && h.x1 === h.x2).map((h) => ({x: h.x1, from: Math.min(h.y1, h.y2), to: Math.max(h.y1, h.y2)})),
        supply = shapes.filter((h) => h.t === 'line' && h.y1 === 12 && h.y2 === 12)
    return {
        arcs: sorted(shapes.filter((h) => h.t === 'arc').map(({cx, cy, r, a1, a2}) => ({cx, cy, r, a1, a2}))),
        bars: sorted(vertical.filter((v) => v.from < 12 && v.to > 12)),
        ticks: sorted(vertical.filter((v) => !(v.from < 12 && v.to > 12))),
        supply: [Math.min(...supply.flatMap((h) => [h.x1, h.x2])), Math.max(...supply.flatMap((h) => [h.x1, h.x2]))],
    }
}
test('stacked sockets are drawn like the double and triple socket of the catalog: the same arches, bars, ticks and supply line', () => {
    for (const k of ['stopcontact2', 'stopcontact3']) {
        const t = typeOf({}, k)
        expect(socketParts(socketShapes(t.sock)), k).toEqual(socketParts(t.shapes))
    }
})
test('sockets lie in the line: the supply reaches the apex of the arches, which open away from it; nothing hangs below the line', () => {
    expect(sockets().length).toBeGreaterThanOrEqual(6)
    sockets().forEach((t) => {
        const arcs = t.shapes.filter((h) => h.t === 'arc'),
            {supply} = socketParts(t.shapes),
            apexes = arcs.map((a) => a.cx - a.r)
        expect(arcs.length, t.k).toBe(t.sock.n || 1)
        arcs.forEach((a) => expect([a.cy, a.a1, a.a2], t.k).toEqual([12, 90, 270]))
        expect(supply[0], t.k).toBe(1)
        expect(supply[1], t.k).toBeGreaterThanOrEqual(Math.min(...apexes) - 0.01)
        // symmetric around the line y = 12 (apart from the little 'h' of the waterproof socket)
        const ys = t.shapes.filter((h) => h.t !== 'text').flatMap((h) => (h.t === 'line' ? [h.y1, h.y2] : [h.cy - h.r, h.cy + h.r]))
        expect(Math.min(...ys) + Math.max(...ys), t.k).toBeCloseTo(24, 5)
    })
})
test('a waterproof socket keeps its own drawing: the h comes above the apex of its first arch, clear of the highest line', () => {
    const pe = typeOf({}, 'stopcontact')
    expect(waterproofMark(pe.shapes)).toEqual(socketShapes({pe: true, h: true}).find((h) => h.t === 'text'))
    expect(waterproofMark(pe.shapes)).toEqual({t: 'text', x: 4, y: 5, s: 'h', fs: 4.5})
    // a drawing that already has its h gets no second one
    const marked = {...pe, sock: {...pe.sock, h: true}, shapes: [...pe.shapes, waterproofMark(pe.shapes)]}
    expect(placedShapesOf(marked)).toBe(marked.shapes)
    // the h follows the first (leftmost) arch, also when the arches are listed in another order
    const arches = [{t: 'arc', cx: 14, cy: 12, r: 4, a1: 90, a2: 270}, {t: 'arc', cx: 8, cy: 12, r: 4, a1: 90, a2: 270}]
    expect(waterproofMark(arches)).toMatchObject({x: 4, y: 6.2})
})
test('a socket is drawn as stored, stacked when there are more, and vertically (hanging) on request', () => {
    const sc = typeOf({}, 'stopcontact')
    expect(placedShapesOf(sc)).toBe(sc.shapes)
    expect(placedShapesOf(sc, {aantal: 1})).toBe(sc.shapes)
    expect(placedShapesOf(sc, {aantal: 3}).filter((h) => h.t === 'arc')).toHaveLength(3)
    expect(placedShapesOf(typeOf({}, 'stopcontact2'), {aantal: 2}).filter((h) => h.t === 'arc')).toHaveLength(4)
    expect(placedShapesOf(sc, {hor: false})).toEqual(socketShapes(sc.sock, false))
    expect(placedShapesOf(sc, {hor: false}).some((h) => h.t === 'arc' && h.a1 === 180)).toBe(true)
    const lp = typeOf({}, 'lichtpunt')
    expect(placedShapesOf(lp, {aantal: 3})).toBe(lp.shapes)
})
test('switches lean like in the eendraadschema (10 to the side for 20 up), with the hinge on the line', () => {
    for (const k of ['schakelaar', 'schakelaar2', 'schakelaar3', 'verklikker']) {
        const t = typeOf({}, k),
            lever = t.shapes.find((h) => h.t === 'line' && h.x1 !== h.x2 && Math.abs(h.y2 - h.y1) > 6)
        const deg = (Math.atan2(lever.x2 - lever.x1, lever.y1 - lever.y2) * 180) / Math.PI
        expect(deg, k).toBeCloseTo(26.57, 1)
        expect(t.shapes.find((h) => h.t === 'circle'), k).toMatchObject({cy: 12})
    }
})
test('Sym draws paths, line weights relative to the drawing, shapes filled with the paper and bold text', () => {
    const {container} = render(
        <svg>
            <SymbolGraphic
                shapes={[
                    {t: 'path', d: 'M1 1 L5 1 L5 5 Z', f: 1, sw: 2},
                    {t: 'path', d: 'M1 1 L5 5'},
                    {t: 'path', d: 'M2 2 L9 9 Z', f: 2},
                    {t: 'line', x1: 0, y1: 0, x2: 4, y2: 4, sw: 1.5},
                    {t: 'arc', cx: 9, cy: 12, r: 3, a1: 90, a2: 270, sw: 1.5},
                    {t: 'circle', cx: 1, cy: 1, r: 1, f: 2},
                    {t: 'rect', x: 0, y: 0, w: 2, h: 2, f: 2},
                    {t: 'text', x: 5, y: 5, s: 'M', fs: 4, b: 1},
                    {t: 'text', x: 5, y: 5, s: 'x'},
                ]}
                stroke="#123"
                strokeWidth={1}
            />
        </svg>,
    )
    const paths = container.querySelectorAll('path')
    expect([paths[0].getAttribute('d'), paths[0].getAttribute('fill'), paths[0].getAttribute('stroke-width')]).toEqual(['M1 1 L5 1 L5 5 Z', '#123', '2'])
    expect([paths[1].getAttribute('fill'), paths[1].getAttribute('stroke-width')]).toEqual([null, null])
    expect(paths[2].getAttribute('fill')).toBe('#fff')
    expect(container.querySelector('line').getAttribute('stroke-width')).toBe('1.5')
    expect(paths[3].getAttribute('stroke-width')).toBe('1.5')
    expect(container.querySelector('circle').getAttribute('fill')).toBe('#fff')
    expect(container.querySelector('rect').getAttribute('fill')).toBe('#fff')
    const [bold, plain] = container.querySelectorAll('text')
    expect([bold.getAttribute('font-weight'), plain.getAttribute('font-weight')]).toEqual(['bold', null])
})
test('standard symbols are drawn like the eendraadschema: the same weights, fills and shapes come back from the catalog', () => {
    const kinds = new Set(BUILTIN.flatMap((t) => t.shapes.map((h) => h.t)))
    expect([...kinds].sort()).toEqual(['arc', 'circle', 'line', 'path', 'rect', 'text'])
    const find = (k, f) => typeOf({}, k).shapes.filter(f)
    expect(find('motor', (h) => h.t === 'text')[0]).toMatchObject({s: 'M', b: 1})
    expect(find('dimmer', (h) => h.t === 'path')[0]).toMatchObject({f: 1}) // the filled triangle of the dimmer
    expect(find('omvormer', (h) => h.t === 'path')).toHaveLength(1) // the sine wave
    expect(find('lichtpunt', (h) => h.t === 'line')[0].sw).toBe(1.5) // the heavier cross
    expect(find('kring', (h) => h.t === 'path')[0]).toMatchObject({f: 1}) // the block on the lever
    // a path touches the connection line like any other shape (a bell made of arcs needs it); one that stays off the line does not count
    expect(connectionReach([{t: 'path', d: 'M0 12 L24 12'}])).toEqual([0, 24])
    expect(connectionReach([{t: 'path', d: 'M0 3 L24 3'}])).toBeNull()
})
test('there is no waterproof socket symbol: waterproof is a property that draws the little h next to any socket', () => {
    expect(typeOf({}, 'stopcontact_h').k).toBe('?')
    const h = (t, pr) => placedShapesOf(t, pr).filter((s) => s.t === 'text' && s.s === 'h').length
    for (const k of ['stopcontact', 'stopcontact_pekid', 'stopcontact2', 'stopcontact3']) {
        const t = typeOf({}, k)
        expect(h(t, {}), k).toBe(0)
        expect(h(t, {h: true}), k).toBe(1)
        expect(h(t, {h: true, hor: false}), k).toBe(1)
    }
    const sc = typeOf({}, 'stopcontact')
    expect(placedShapesOf(sc, {h: false})).toBe(sc.shapes)
    // only the 'h' is added, nothing else changes
    expect(placedShapesOf(sc, {h: true}).filter((s) => s.t !== 'text')).toEqual(sc.shapes)
    const lp = typeOf({}, 'lichtpunt')
    expect(placedShapesOf(lp, {h: true})).toBe(lp.shapes) // not a socket: no 'h'
})

test('Sym keeps texts upright when the symbol is rotated', () => {
    const shapes = socketShapes({h: true}, true)
    const text = (rot) => render(<SymbolGraphic shapes={shapes} rotation={rot} />).container.querySelector('text')
    expect(text(0).getAttribute('transform')).toBeNull()
    expect(text(360).getAttribute('transform')).toBeNull()
    for (const r of [90, 180, 270, -90, 45]) expect(text(r).getAttribute('transform')).toMatch(new RegExp('^rotate\\(' + -r + ' '))
})
test('standard symbols and categories are shown in the active language; names the user typed are not translated', () => {
    const socket = typeOf({}, 'stopcontact')
    expect(symbolName(socket)).toBe('Stopcontact (aarding)')
    expect(categoryName('Stopcontacten')).toBe('Stopcontacten')
    setLanguage('fr')
    expect(symbolName(socket)).toBe('Prise de courant (terre)')
    expect(categoryName('Stopcontacten')).toBe('Prises de courant')
    expect(symbolName(typeOf({}, 'aansluiting'))).toBe('Raccordement au réseau')
    setLanguage('en')
    expect(symbolName(socket)).toBe('Socket outlet (earth)')
    expect(categoryName('Verlichting & bediening')).toBe('Lighting & controls')
    // a renamed standard symbol and an own category keep the name the user gave them
    expect(symbolName({...socket, name: 'Keukenstopcontact'})).toBe('Keukenstopcontact')
    expect(categoryName('Mijn categorie')).toBe('Mijn categorie')
    expect(symbolName(null)).toBe('')
})
