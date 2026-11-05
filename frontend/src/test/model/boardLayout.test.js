// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {
    circuitLetter,
    circuitInfo,
    nextCircuitLetter,
    defaultProperties,
    defaultTree,
    layoutCircuit,
    layoutBoard,
    NESTED_HEIGHT,
    NESTED_MIN_SCALE,
    sheetSlices,
    sheetPlan,
    pageNumbering,
    MAX_SHEET_WIDTH,
    MM_PER_UNIT,
    DRAWING_HEIGHT,
    sheetScale,
    MAX_SHEET_HEIGHT,
    HEAD_DEPTH,
    DETAIL_FONT_SIZE,
    CIRCUIT_SPACING,
    SYMBOL_SIZE,
    BUS_START_X,
    detailLines,
    DETAIL_LINE_HEIGHT,
    PLACEMENT_WIDTH,
    placementOf,
    isDiffCircuit,
    connectionReach,
} from '../../model/boardLayout.js'
import {setLanguage} from '../../i18n/translate.js'
import {flatten} from '../../model/tree.js'
import {FOOTER_TITLE_FONT_SIZE} from '../../components/Sheet.jsx'
import {baseProject, node} from '../utils.jsx'

const kring = (id, kids = [], p = {}, extra = {}) =>
    node(id, 'kring', kids, {p: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', kortsl: 3, tekst: '', ...p}, ...extra})
const tree = (krings, q = {}) => [
    node('A', 'aansluiting', [node('T', 'teller', [node('B', 'bord', krings, {p: {geaard: true}})])], {
        p: {teller: true, bescherming: 'differentieel', delta: 300, polen: 4, amp: 40, diffType: 'A', kabel: '4x16', ...q},
    }),
]
const proj = (t) => ({...baseProject(), een: [{id: 'e1', name: 'Blad 1', tree: t}]})
const chain = (n) => {
    let c = []
    for (let i = n; i > 0; i--) c = [node('c' + i, 'stopcontact', c)]
    return c
}
const syms = (it) => it.filter((i) => i.kind === 'sym' && !i.breaker),
    texts = (it) => it.filter((i) => i.kind === 'text')
test('circuitLetter sequence', () => {
    expect([0, 25, 26, 27, 51, 52].map(circuitLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
})
test('circuitInfo builds the spec string', () => {
    expect(circuitInfo({curve: 'C', amp: 6, polen: 2, kabel: 'XVB Cca 3G2,5'})).toBe('C6 2P XVB Cca 3G2,5')
    expect(circuitInfo()).toBe('')
    expect(circuitInfo({amp: 16})).toBe('16')
})
test('nextCircuitLetter fills the first free circuitLetter', () => {
    expect(nextCircuitLetter([])).toBe('A')
    expect(nextCircuitLetter(tree([kring('x', [], {}, {label: 'A'}), kring('y', [], {}, {label: 'C'})]))).toBe('B')
    expect(nextCircuitLetter(tree([kring('x', [], {}, {label: 'A'}), kring('y', [], {}, {label: 'B'})]))).toBe('C')
})
test('default props and default tree', () => {
    expect(defaultProperties('kring')).toMatchObject({polen: 2, amp: 16, curve: 'B', bescherming: 'automatisch'})
    expect(defaultProperties('aansluiting')).toMatchObject({teller: true, delta: 300, kabel: '4x16'})
    expect(defaultProperties('bord')).toEqual({geaard: true})
    expect(defaultProperties('oven')).toBeUndefined()
    const t = defaultTree()
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({type: 'aansluiting'})
    expect(t[0].children[0]).toMatchObject({type: 'bord'})
    expect(defaultTree()[0].id).not.toBe(t[0].id)
})
test('layoutCircuit draws stem, breaker, circuitLetter, specs and cable', () => {
    const c = layoutCircuit(baseProject(), kring('K1', [node('s', 'stopcontact')], {tekst: 'Keuken'}, {label: 'K1'}))
    const t = texts(c.items).map((x) => x.text)
    expect(t).toEqual(expect.arrayContaining(['K1', 'Keuken', '2P - 16A', 'Curve B', '3000', 'XVB Cca 3G2,5', '1']))
    // the breaker: the stem stops at the lower contact (no line through it), the library symbol kring (lever with its block beside it), the line carries on above
    expect(c.items.filter((i) => i.breaker)).toHaveLength(1)
    expect(c.items.some((i) => i.kind === 'line' && i.x1 === 30 && i.y1 === 0 && i.y2 === -30)).toBe(true)
    expect(c.items.some((i) => i.kind === 'line' && i.x1 === 30 && i.x2 === 30 && Math.abs(i.y1 + 58.19) < 0.01)).toBe(true)
    expect(c.items.some((i) => i.kind === 'line' && i.x1 === 30 && i.x2 === 30 && i.y1 === 0 && i.y2 < -58.19)).toBe(false)
    expect(c.items.some((i) => i.kind === 'line' && i.x1 === 30 && i.y1 === 0)).toBe(true)
    expect(syms(c.items)).toHaveLength(1)
    expect(c.minY).toBeLessThan(-215)
    expect(c.w).toBeGreaterThanOrEqual(86)
})
test('layoutCircuit without protection has no breaker or specs; info is the fallback spec text', () => {
    const none = layoutCircuit(baseProject(), kring('K', [], {bescherming: 'geen'}, {label: 'K'}))
    expect(none.items.some((i) => i.fill)).toBe(false)
    expect(texts(none.items).map((x) => x.text)).not.toContain('Curve B')
    const old = layoutCircuit(baseProject(), node('K', 'kring', [], {info: 'B16 2,5mm²'}))
    expect(texts(old.items).map((x) => x.text)).toContain('B16 2,5mm²')
})
test('long layoutCircuit names are written rotated and the name moves up', () => {
    const c = layoutCircuit(baseProject(), kring('K', [], {tekst: 'Naam'}, {label: 'LAADPAAL'}))
    const l = texts(c.items).find((x) => x.text === 'LAADPAAL'),
        n = texts(c.items).find((x) => x.text === 'Naam')
    expect(l.vertical).toBe(1)
    expect(n.y).toBeLessThan(-72)
})
test('chains make circuits wider and push following circuits to the right', () => {
    const w = (k) => layoutCircuit(baseProject(), kring('K', chain(k))).w
    expect(w(3)).toBeGreaterThan(w(1))
    const x2 = (n) => layoutBoard(proj(tree([kring('K1', chain(n)), kring('K2')])), proj(tree([])).een[0]).circuits
    const a = layoutBoard(proj(tree([kring('K1', chain(1)), kring('K2')])), proj(tree([kring('K1', chain(1)), kring('K2')])).een[0]),
        b = layoutBoard(proj(tree([kring('K1', chain(4)), kring('K2')])), proj(tree([kring('K1', chain(4)), kring('K2')])).een[0])
    expect(b.circuits[1].x).toBeGreaterThan(a.circuits[1].x)
})
test('multiple children are stacked upwards, counts and labels are shown', () => {
    const c = layoutCircuit(
        baseProject(),
        kring('K', [node('s', 'stopcontact', [], {p: {aantal: 3, nr: '7', hor: false}}), node('l', 'lichtpunt', [], {label: 'Gang'})]),
    )
    const ys = syms(c.items).map((i) => i.y)
    expect(ys[1]).toBeLessThan(ys[0] - 60)
    const t = texts(c.items)
    expect(t.map((x) => x.text)).toEqual(expect.arrayContaining(['x3', '7', '2']))
    expect(t.find((x) => x.text === 's').italic).toBe(1)
})
test('a node with children continues to the right; extra children branch with a connector', () => {
    const c = layoutCircuit(baseProject(), kring('K', [node('m', 'motor', [node('a', 'bel'), node('b', 'bel')])]))
    const s = syms(c.items)
    expect(s).toHaveLength(3)
    expect(s[1].x).toBeGreaterThan(s[0].x)
    expect(s[2].y).toBeLessThan(s[1].y)
})
test('box elements place their children in columns above the box', () => {
    const box = node('D', 'domotica', [kring('k1', [node('m1', 'motor')]), node('s1', 'stopcontact')], {p: {tekst: 'Domotica'}})
    const c = layoutCircuit(baseProject(), kring('K', [box]))
    const r = c.items.find((i) => i.kind === 'rect' && i.id === 'D')
    expect(r.w).toBeGreaterThanOrEqual(100)
    expect(texts(c.items).find((x) => x.text === 'Domotica').bold).toBe(1)
    syms(c.items).forEach((s) => expect(s.y).toBeLessThan(r.y))
    const empty = layoutCircuit(baseProject(), kring('K', [node('E', 'subbord', [], {label: 'X'})]))
    expect(empty.items.find((i) => i.kind === 'rect' && i.id === 'E').w).toBe(100)
    const named = layoutCircuit(baseProject(), kring('K', [node('E', 'domotica', [], {label: ''})]))
    expect(texts(named.items).map((x) => x.text)).toContain('Domotica (kast)')
})
test('nested kring is transparent', () => {
    const c = layoutCircuit(baseProject(), kring('K', [node('k2', 'kring', [node('m', 'motor'), node('b', 'bel')])]))
    expect(syms(c.items)).toHaveLength(2)
})
test('layoutBoard finds the bus through the chain, flattens differentials and ignores other children', () => {
    const t = tree([node('D', 'diff', [kring('K1'), kring('K2')]), kring('K3'), node('E', 'aarding'), node('Z', 'zekering', [kring('K4')])])
    const p = proj(t),
        b = layoutBoard(p, p.een[0])
    expect(b.circuits.map((c) => c.node.id)).toEqual(['K1', 'K2', 'K3', 'K4'])
    expect(b.bus.id).toBe('B')
    expect(b.head).toMatchObject({kwh: true, main: 'differentieel', ground: true})
    expect(b.circuits[0].x).toBe(BUS_START_X)
    b.circuits.slice(1).forEach((c, i) => expect(c.x).toBe(b.circuits[i].x + b.circuits[i].w + CIRCUIT_SPACING))
    expect(b.end).toBe(b.circuits[3].x + b.circuits[3].w + CIRCUIT_SPACING)
})
test('a differentieel that feeds sub boards is drawn as one layoutCircuit with a breaker; a plain sub layoutBoard is an anonymous layoutCircuit', () => {
    const d = node('D', 'diff', [node('S', 'subbord', [kring('U')]), node('S2', 'subbord')], {label: 'ZB', info: '2P C40 30mA type A', p: {kabel: 'XVB Cca 3G6'}})
    const p = proj(tree([d, node('S3', 'subbord')])),
        b = layoutBoard(p, p.een[0])
    expect(b.circuits.map((c) => c.node.id)).toEqual(['D', 'S3~'])
    const c = b.circuits[0]
    expect(c.node).toMatchObject({diff: true, label: 'ZB'})
    expect(c.node.children.map((x) => x.id)).toEqual(['S', 'S2'])
    expect(texts(c.items).map((x) => x.text)).toEqual(expect.arrayContaining(['ZB', '2P C40 30mA type A', 'XVB Cca 3G6']))
    expect(c.items.some((i) => i.breaker)).toBe(true)
    // both boards are drawn above it
    expect(c.items.filter((i) => i.kind === 'rect' && ['S', 'S2'].includes(i.id))).toHaveLength(2)
    expect(b.circuits[1].items.some((i) => i.breaker)).toBe(false)
})
test('a differentieel with circuits under it only groups them; one without circuits is a layoutCircuit; an empty one is not drawn', () => {
    const group = node('G', 'diff', [kring('K1'), node('S', 'subbord')]),
        own = node('O', 'diff', [node('m', 'motor')]),
        chain = node('C', 'diff', [node('C2', 'diff', [node('m2', 'motor')])]),
        empty = node('E', 'diff')
    expect(isDiffCircuit(group)).toBe(false)
    expect(isDiffCircuit(own)).toBe(true)
    expect(isDiffCircuit(chain)).toBe(true)
    expect(isDiffCircuit(empty)).toBe(false)
    expect(isDiffCircuit(node('M', 'diff', [node('B', 'bord')]))).toBe(false)
    const p = proj(tree([group, own, chain, empty])),
        b = layoutBoard(p, p.een[0])
    expect(b.circuits.map((c) => c.node.id)).toEqual(['K1', 'S~', 'O', 'C'])
    // the element hangs under its differentieel; a differentieel under a differentieel is a second breaker in series
    expect(syms(b.circuits[2].items)).toHaveLength(1)
    expect(b.circuits[3].items.filter((i) => i.breaker)).toHaveLength(2)
})
test('a layoutCircuit or differentieel under another one is a breaker on the line: lying on its side, with name above and specs under it', () => {
    const c = layoutCircuit(baseProject(), kring('AC', [node('K2', 'kring', [node('V', 'subbord')], {label: 'K2', p: {polen: 4, amp: 40, curve: 'C', kabel: 'XVB Cca 5G4'}})]))
    const br = c.items.filter((i) => i.breaker && i.id === 'K2')
    expect(br).toHaveLength(1)
    expect(br[0].rotation).toBe(90)
    expect(texts(c.items).filter((x) => x.id === 'K2').map((x) => x.text)).toEqual(['4P - 40A', 'Curve C', 'XVB Cca 5G4', 'K2'])
    // the line between the two stops at the contact and carries on after the lever; the sub layoutBoard is drawn after it
    const box = c.items.find((i) => i.kind === 'rect' && i.id === 'V')
    expect(box.x).toBeGreaterThan(br[0].x + 30)
})
test('a differentieel with specs is drawn on separate lines like the differentieel of the aansluiting, without the short-layoutCircuit box', () => {
    const d = node('D', 'diff', [node('S', 'subbord')], {label: 'ZB', info: '2P C40 30mA type A', p: {polen: 2, amp: 40, curve: 'C', delta: 30, diffType: 'A', kabel: 'XVB Cca 3G6', kortsl: '3'}})
    const p = proj(tree([d])),
        c = layoutBoard(p, p.een[0]).circuits[0]
    const s = texts(c.items).map((x) => x.text)
    expect(s).toEqual(expect.arrayContaining(['Δ30mA', '2P - 40A', 'Curve C', 'Type A', 'XVB Cca 3G6']))
    expect(s).not.toContain('2P C40 30mA type A')
    expect(s).not.toContain('3000')
    expect(c.items.filter((i) => i.kind === 'rect')).toHaveLength(1)
})
test('inside a sub layoutBoard a differentieel shows its breaker and specs, and a layoutCircuit under a layoutCircuit keeps its name', () => {
    const d = node('D', 'diff', [node('S', 'subbord')], {label: 'ZB', p: {polen: 2, amp: 40, delta: 30, diffType: 'A', kabel: 'XVB Cca 3G6'}})
    const c = layoutCircuit(baseProject(), kring('K', [node('X', 'subbord', [d, kring('Z', [kring('ZA', [node('S2', 'subbord')])])])]))
    expect(texts(c.items).map((x) => x.text)).toEqual(expect.arrayContaining(['Δ30mA', '2P - 40A', 'Type A', 'XVB Cca 3G6', 'ZB', 'ZA']))
    // the layoutCircuit K itself, the differentieel ZB, the layoutCircuit Z in the sub layoutBoard and the breaker ZA on the line under it
    expect(c.items.filter((i) => i.breaker)).toHaveLength(4)
})
test('circuits inside a sub layoutBoard are drawn like the circuits on the bus: breaker, specs, numbers, plaatsing and in buis', () => {
    const u = kring('U', [node('c1', 'stopcontact'), node('c2', 'stopcontact')], {plaatsing: 'inwand', inbuis: true, curve: 'C', amp: 20, kortsl: 3})
    const k = kring('K', [node('X', 'subbord', [u])])
    const c = layoutCircuit(baseProject(), k),
        t = texts(c.items)
    // the same texts as on the bus: specs, short-layoutCircuit box, cable, the numbers of the elements next to the line
    expect(t.filter((x) => x.text === '2P - 20A')).toHaveLength(1)
    expect(t.filter((x) => x.text === 'Curve C')).toHaveLength(1)
    expect(t.filter((x) => x.text === '3000')).toHaveLength(2)
    expect(t.filter((x) => ['1', '2'].includes(x.text)).map((x) => x.text).sort()).toEqual(['1', '1', '2'])
    // the breaker of U and the symbols of the plaatsing (E's) and the circle of 'in buis'
    expect(c.items.filter((i) => i.breaker)).toHaveLength(2)
    expect(c.items.filter((i) => i.kind === 'circ')).toHaveLength(1)
    // the same drawing as the layoutCircuit on the bus, only moved onto the sub layoutBoard
    const bus = layoutCircuit(baseProject(), u)
    const lines = (it) => it.filter((i) => i.kind === 'line').length
    expect(lines(c.items)).toBeGreaterThan(lines(bus.items))
    expect(texts(bus.items).length).toBeLessThan(t.length)
    expect(c.minY).toBeLessThan(bus.minY)
})
test('a sub layoutBoard makes room for its circuits (they are as tall as the circuits on the bus)', () => {
    const p = proj(tree([kring('K', [node('X', 'subbord', [kring('U', [node('c1', 'stopcontact')])])])])),
        b = layoutBoard(p, p.een[0])
    expect(b.circuits[0].minY).toBeLessThan(-215 - 100)
})
test('circuits inside a sub layoutBoard get a click area and a latch zone over their stem, like the circuits on the bus', () => {
    const c = layoutCircuit(baseProject(), kring('K', [node('X', 'subbord', [kring('U', [node('m', 'motor')], {kabel: 'XVB'}), node('D', 'diff', [node('S', 'subbord')])])]))
    for (const id of ['U', 'D']) {
        const hit = c.items.find((i) => i.kind === 'hit' && i.id === id),
            stem = c.items.find((i) => i.kind === 'stem' && i.id === id)
        expect(hit).toBeDefined()
        expect(stem).toBeDefined()
        expect(hit.h).toBeGreaterThan(50)
        expect(hit.w).toBeGreaterThan(30)
        // behind the drawing: before the stem line and the texts of its layoutCircuit
        expect(c.items.indexOf(hit)).toBeLessThan(c.items.findIndex((i) => i.kind === 'text' && i.id === id))
    }
})
test('a differentieel inside a sub layoutBoard is a layoutCircuit of that layoutBoard', () => {
    const d = node('D', 'diff', [node('S', 'subbord')], {label: 'ZB', p: {kabel: 'XVB Cca 3G6'}})
    const c = layoutCircuit(baseProject(), kring('K', [node('X', 'subbord', [d])]))
    expect(texts(c.items).map((x) => x.text)).toEqual(expect.arrayContaining(['ZB', 'XVB Cca 3G6']))
})
test('layoutBoard head variants', () => {
    const mk = (t) => {
        const p = proj(t)
        return layoutBoard(p, p.een[0]).head
    }
    expect(mk(tree([], {bescherming: 'automatisch'})).main).toBe('automatisch')
    expect(mk(tree([], {bescherming: 'geen', teller: false}))).toMatchObject({main: null, kwh: false})
    const old = [node('A', 'aansluiting', [node('T', 'teller', [node('B', 'bord', [kring('K')]), node('E', 'aarding')])])]
    expect(mk(old)).toMatchObject({kwh: true, main: null, ground: true})
    expect(mk([node('A', 'aansluiting', [node('B', 'bord', [])])]).kwh).toBe(false)
    expect(mk([node('B', 'bord', [kring('K')])])).toMatchObject({kwh: false, ground: false})
    const none = proj([])
    expect(layoutBoard(none, none.een[0])).toMatchObject({circuits: [], bus: null, head: {kwh: false, ground: false}})
})
test('sheetSlices split on sheet width and keep order', () => {
    const ks = Array.from({length: 40}, (_, i) => kring('K' + i, chain(1)))
    const p = proj(tree(ks)),
        b = layoutBoard(p, p.een[0]),
        s = sheetSlices(b)
    expect(s.length).toBeGreaterThan(1)
    expect(s[0].first).toBe(true)
    expect(s.at(-1).last).toBe(true)
    expect(s.map((x) => x.to - x.from).reduce((a, c) => a + c)).toBe(40)
    s.forEach((x, i) => {
        if (i) expect(x.from).toBe(s[i - 1].to)
        expect(x.x1 - x.x0).toBeLessThanOrEqual(MAX_SHEET_WIDTH + CIRCUIT_SPACING + 260)
    })
    expect(s[0].x0).toBe(0)
    expect(s[1].x0).toBe(b.circuits[s[1].from].x - 10)
    expect(s[0].x1).toBe(b.circuits[s[0].to - 1].x + b.circuits[s[0].to - 1].w)
})
test('an oversized single layoutCircuit still gets its own slice; empty boards get one', () => {
    const wide = kring('W', chain(30)),
        p = proj(tree([wide, kring('K')])),
        s = sheetSlices(layoutBoard(p, p.een[0]))
    expect(s).toHaveLength(2)
    expect(s[0].to - s[0].from).toBe(1)
    const e = sheetSlices(layoutBoard(proj([]), proj([]).een[0]))
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({first: true, last: true, from: 0, to: 0})
    expect(e[0].x1).toBeGreaterThanOrEqual(260)
})
test('a high sheet is drawn smaller anyway: circuits that fit at that size join it instead of starting a nearly empty sheet', () => {
    // one element with a long stack under it is too high for a sheet and cannot go on in a next column: the sheet is drawn smaller
    const high = kring('H', [node('h', 'stopcontact', Array.from({length: 14}, (_, i) => node('h' + i, 'stopcontact')))]),
        narrow = Array.from({length: 14}, (_, i) => kring('K' + i, chain(1))),
        p = proj(tree([high, ...narrow])),
        b = layoutBoard(p, p.een[0]),
        s = sheetSlices(b),
        scaleOf = (slice) => sheetScale(slice.x1 - slice.x0, -slice.minY)
    expect((-s[0].minY + HEAD_DEPTH) * MM_PER_UNIT).toBeGreaterThan(DRAWING_HEIGHT)
    // the first sheet is wider than a full-size sheet, but every circuit on it is drawn at the size the high circuit needs anyway
    expect(s[0].x1 - s[0].x0).toBeGreaterThan(MAX_SHEET_WIDTH)
    expect(scaleOf(s[0])).toBeCloseTo(DRAWING_HEIGHT / (-s[0].minY + HEAD_DEPTH), 9)
    // the circuit that starts the next sheet would have made the first one smaller
    if (s.length > 1) {
        const next = b.circuits[s[1].from]
        expect(sheetScale(next.x + next.w + CIRCUIT_SPACING - s[0].x0, -s[0].minY)).toBeLessThan(scaleOf(s[0]))
    }
    // the same circuits without the high one: a full-size sheet, split at MAX_SHEET_WIDTH as before
    const low = proj(tree(narrow)),
        lowSlices = sheetSlices(layoutBoard(low, low.een[0]))
    lowSlices.forEach((slice) => expect(slice.x1 - slice.x0).toBeLessThanOrEqual(MAX_SHEET_WIDTH + CIRCUIT_SPACING + 260))
})
test('a high circuit does not join a sheet that it would make smaller', () => {
    // a full sheet of full size (as many narrow circuits as fit on one), then a high circuit: it would shrink the sheet, so it gets a sheet
    // of its own
    const narrowCircuits = (n) => Array.from({length: n}, (_, i) => kring('K' + i, chain(1))),
        sheetsOf = (circuits) => {
            const board = proj(tree(circuits))
            return sheetSlices(layoutBoard(board, board.een[0])).length
        }
    let count = 1
    while (sheetsOf(narrowCircuits(count + 1)) === 1) count++
    const narrow = narrowCircuits(count),
        high = kring('H', [node('h', 'stopcontact', Array.from({length: 14}, (_, i) => node('h' + i, 'stopcontact')))]),
        p = proj(tree([...narrow, high])),
        b = layoutBoard(p, p.een[0]),
        s = sheetSlices(b)
    expect(b.circuits.at(-1).newSheet).toBe(true)
    expect(sheetScale(s[0].x1 - s[0].x0, -s[0].minY)).toBe(MM_PER_UNIT)
})
test('sheetPlan numbers every printed sheet, een first then situatie', () => {
    const p = proj(tree(Array.from({length: 40}, (_, i) => kring('K' + i, chain(1)))))
    p.een.push({id: 'e2', name: '2', tree: []})
    p.sit.push({id: 's2', name: 'S2', walls: [], items: []})
    const pl = sheetPlan(p)
    expect(pl.map((e) => e.number)).toEqual(pl.map((_, i) => i + 1))
    expect(new Set(pl.map((e) => e.total))).toEqual(new Set([pl.length]))
    expect(pl.slice(-2).map((e) => e.kind)).toEqual(['sit', 'sit'])
    expect(pl.filter((e) => e.kind === 'een').at(-1).page.id).toBe('e2')
    expect(pageNumbering(p, p.sit[1])).toEqual({number: 2, total: 2})
    expect(pageNumbering(p, p.een[0]).number).toBe(1)
})
test('scoped sheetPlan numbers eendraad sheets and situatie pages separately', () => {
    const p = proj(tree(Array.from({length: 40}, (_, i) => kring('K' + i, chain(1)))))
    p.een.push({id: 'e2', name: '2', tree: []})
    p.sit.push({id: 's2', name: 'S2', walls: [], items: []})
    const all = sheetPlan(p),
        pl = sheetPlan(p, true),
        een = pl.filter((e) => e.kind === 'een'),
        sit = pl.filter((e) => e.kind === 'sit')
    expect(een.map((e) => e.number)).toEqual(een.map((_, i) => i + 1))
    expect(new Set(een.map((e) => e.total))).toEqual(new Set([een.length]))
    expect(een.length + sit.length).toBe(all.length)
    expect(sit.map((e) => [e.number, e.total])).toEqual([
        [1, 2],
        [2, 2],
    ])
    expect(pageNumbering(p, p.een[1])).toEqual({number: een.length, total: een.length})
})
const symBoxes = (c) => c.items.filter((i) => i.kind === 'sym').map((i) => [c.x + i.x - SYMBOL_SIZE / 2, i.y - SYMBOL_SIZE / 2, c.x + i.x + SYMBOL_SIZE / 2, i.y + SYMBOL_SIZE / 2]),
    overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
// (low enough to stay in one column: a higher circuit goes on in a second column, see drawColumns)
const tallWide = () =>
    kring('M', [
        ...['a', 'b', 'c', 'd', 'e'].map((id) => node(id, 'stopcontact')),
        node('g', 'stopcontact', chain(5)),
    ])
test('a lower layoutCircuit slides left underneath the overhang of the previous one', () => {
    const p = proj(tree([tallWide(), kring('N', [node('s', 'stopcontact'), node('t', 'stopcontact')])])),
        b = layoutBoard(p, p.een[0]),
        [m, n] = b.circuits
    expect(n.x).toBeLessThan(m.x + m.w + CIRCUIT_SPACING)
    expect(n.x).toBeGreaterThan(m.x)
    symBoxes(m).forEach((a) => symBoxes(n).forEach((c) => expect(overlap(a, c)).toBe(false)))
    expect(b.end).toBe(Math.max(m.x + m.w, n.x + n.w) + CIRCUIT_SPACING)
})
test('a layoutCircuit that is as tall as the overhang is not tucked in', () => {
    const p = proj(tree([tallWide(), kring('T', Array.from({length: 12}, (_, i) => node('t' + i, 'stopcontact')))])),
        [m, n] = layoutBoard(p, p.een[0]).circuits
    expect(n.x).toBe(m.x + m.w + CIRCUIT_SPACING)
})
test('tucking in saves width so more circuits fit on a sheet', () => {
    const ks = Array.from({length: 24}, (_, i) => (i % 2 ? kring('N' + i, [node('s', 'stopcontact')]) : tallWide()))
    const p = proj(tree(ks)),
        b = layoutBoard(p, p.een[0]),
        s = sheetSlices(b)
    expect(s.map((x) => x.to - x.from).reduce((a, c) => a + c)).toBe(24)
    s.forEach((x) => expect(x.x1 - x.x0).toBeLessThanOrEqual(MAX_SHEET_WIDTH + CIRCUIT_SPACING + 260))
    const plain = b.circuits.reduce((a, c) => a + c.w + CIRCUIT_SPACING, 0)
    expect(b.circuits.at(-1).x + b.circuits.at(-1).w).toBeLessThan(plain)
})
test('a sub-layoutBoard directly under the bus is drawn as an unprotected column', () => {
    const p = proj(tree([node('S', 'subbord', [kring('k', [node('m', 'motor')])], {label: 'Veranda'}), kring('K2')]))
    const b = layoutBoard(p, p.een[0])
    expect(b.circuits).toHaveLength(2)
    expect(b.circuits[0].node).toMatchObject({id: 'S~', type: 'kring'})
    expect(b.circuits[0].items.some((i) => i.kind === 'rect' && i.id === 'S')).toBe(true)
    expect(b.circuits[0].items.some((i) => i.fill)).toBe(false)
})

test('sockets stack horizontally from two on, unless p.hor says otherwise', () => {
    const arcs = (p) => syms(layoutCircuit(baseProject(), kring('K', [node('s', 'stopcontact', [], {p})])).items)[0].shapes.filter((h) => h.t === 'arc').length
    expect(arcs({})).toBe(1)
    expect(arcs({aantal: 3})).toBe(3)
    expect(arcs({aantal: 3, hor: false})).toBe(1)
    expect(arcs({hor: true})).toBe(1)
    const txt = texts(layoutCircuit(baseProject(), kring('K', [node('s', 'stopcontact', [], {p: {aantal: 2}})])).items).map((x) => x.text)
    expect(txt).not.toContain('x2')
})
test('detailLines splits on new lines and on |, trims and drops empty entries', () => {
    expect(detailLines('Merk: A |Type: B\r\nS/N: 1\n\n | Pmax: 2 kW ')).toEqual(['Merk: A', 'Type: B', 'S/N: 1', 'Pmax: 2 kW'])
    expect(detailLines(undefined)).toEqual([])
    expect(detailLines('')).toEqual([])
})

test('details are drawn line by line under the symbol and give the element more room', () => {
    const lines = ['Merk: Huawei', 'Type: SUN2000L-6KTL-M1', 'S/N: HV1234'],
        withDet = (extra = {}) => layoutCircuit(proj([]), kring('K', [node('i', 'omvormer', [], {label: '', p: {aantal: 1, details: lines.join('\n'), ...extra}})])),
        plain = layoutCircuit(proj([]), kring('K', [node('i', 'omvormer', [], {label: '', p: {aantal: 1}})]))
    const texts = withDet().items.filter((it) => it.kind === 'text' && lines.includes(it.text))
    expect(texts.map((t) => t.text)).toEqual(lines)
    expect(texts.every((t) => t.id === 'i' && t.anchor === undefined && t.x === texts[0].x)).toBe(true)
    expect(texts[1].y - texts[0].y).toBe(DETAIL_LINE_HEIGHT)
    // the node gets as wide as its longest line, and the details are also found when they are separated with |
    expect(withDet().w).toBeGreaterThan(plain.w)
    expect(withDet({details: lines.join('|')}).items.filter((it) => it.kind === 'text' && lines.includes(it.text))).toHaveLength(3)
    // a count and a name come first, the details hang below them
    const both = layoutCircuit(proj([]), kring('K', [node('i', 'omvormer', [], {label: 'Huawei', p: {aantal: 3, details: 'Pmax: 6 kW'}})])).items,
        y = (s) => both.find((it) => it.kind === 'text' && it.text === s).y
    expect(y('x3')).toBeLessThan(y('Huawei'))
    expect(y('Huawei')).toBeLessThan(y('Pmax: 6 kW'))
    // two elements with details in one layoutCircuit do not overlap vertically
    const two = layoutCircuit(proj([]), kring('K', ['a', 'b'].map((id) => node(id, 'batterij', [], {label: '', p: {aantal: 1, details: lines.join('\n')}})))).items
    const ys = two.filter((it) => it.kind === 'sym').map((it) => it.y)
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(66 + 3 * DETAIL_LINE_HEIGHT)
})

test('plaatsing: symbols left of the stem, name moves left, click area over the stem', () => {
    const plain = layoutCircuit(baseProject(), kring('K', [], {tekst: 'Naam'}, {label: 'K'}))
    expect(plain.items.some((i) => i.kind === 'circ')).toBe(false)
    expect(plain.items[0]).toMatchObject({kind: 'hit', id: 'K'})
    const xs = 30 + PLACEMENT_WIDTH
    const g = layoutCircuit(baseProject(), kring('K', [], {tekst: 'Naam', plaatsing: 'ondergronds', inbuis: true}, {label: 'K'}))
    expect(g.items.filter((i) => i.kind === 'line' && i.x1 === xs - 16 && i.x2 === xs - 16)).toHaveLength(1)
    expect(g.items.filter((i) => i.kind === 'circ')).toHaveLength(1)
    expect(texts(g.items).find((x) => x.text === 'Naam').x).toBe(xs - 14 - PLACEMENT_WIDTH)
    // op wand: two E's with the teeth to the left; in wand: the mirror image, teeth towards the stem
    const teeth = (pl, x1, x2) => layoutCircuit(baseProject(), kring('K', [], {plaatsing: pl}, {label: 'K'})).items.filter((i) => i.kind === 'line' && i.x1 === x1 && i.x2 === x2)
    expect(teeth('opwand', xs - 6, xs - 19)).toHaveLength(6)
    expect(teeth('inwand', xs - 19, xs - 6)).toHaveLength(6)
    // luchtleiding: a circle on the stem, never in buis, no shift
    const l = layoutCircuit(baseProject(), kring('K', [], {plaatsing: 'luchtleiding', inbuis: true}, {label: 'K'}))
    expect(l.items.filter((i) => i.kind === 'circ')).toEqual([expect.objectContaining({x: 30})])
    // in buis without a placement draws nothing
    expect(layoutCircuit(baseProject(), kring('K', [], {inbuis: true}, {label: 'K'})).items.some((i) => i.kind === 'circ')).toBe(false)
    expect(layoutCircuit(baseProject(), node('K~', 'kring', [], {p: {bescherming: 'geen'}})).items.some((i) => i.kind === 'hit')).toBe(false)
})
test('placementOf normalises imported values', () => {
    expect(placementOf('In wand')).toBe('inwand')
    expect(placementOf('Op_wand')).toBe('opwand')
    expect(placementOf('N/A')).toBe('')
    expect(placementOf(undefined)).toBe('')
})

test('circuits under an empty element (made by the insert buttons) are still drawn', () => {
    const p = baseProject()
    p.een[0].tree = [node('N', 'aansluiting', [node('B', 'bord', [node('X', 'leeg', [node('K1', 'kring', [node('S', 'stopcontact')])])])])]
    expect(layoutBoard(p, p.een[0]).circuits.map((c) => c.node.id)).toEqual(['K1'])
})

test('a layoutCircuit has a latch zone along its stem, above the click area, reaching above the top branch', () => {
    const c = layoutCircuit(baseProject(), kring('K', [node('a', 'batterij'), node('b', 'batterij')], {}, {label: 'K'})),
        z = c.items.find((i) => i.kind === 'stem'),
        top = Math.min(...c.items.filter((i) => i.kind === 'sym' && i.id).map((i) => i.y))
    expect(c.items[0]).toMatchObject({kind: 'hit', id: 'K'})
    expect(c.items[1]).toBe(z)
    expect(z.y).toBeLessThan(top - 100) // room for the next branch
    expect(z.y + z.h).toBeLessThan(0) // stays above the breaker
    expect(z.x + z.w / 2).toBe(30) // centred on the stem
    expect(layoutCircuit(baseProject(), node('K~', 'kring', [], {p: {bescherming: 'geen'}})).items.some((i) => i.kind === 'stem')).toBe(false)
})

// the connecting line of the diagram runs up to where the drawing touches the centre line (y = 12), whatever the drawing is made of
describe('connectionReach: any shape that touches the centre line', () => {
    test('a lamp made of two crossing diagonal lines (no horizontal leg) reaches its centre', () => {
        const lamp = [
            {t: 'line', x1: 7.44, y1: 8.29, x2: 14.86, y2: 15.71, sw: 1.5},
            {t: 'line', x1: 7.44, y1: 15.71, x2: 14.86, y2: 8.29, sw: 1.5},
        ]
        const [left, right] = connectionReach(lamp)
        expect(left).toBeCloseTo(11.15, 1)
        expect(right).toBeCloseTo(11.15, 1)
    })
    test('a bell made of two path arcs and a vertical line reaches from the vertical line to the points of the arcs', () => {
        const bell = [
            {t: 'path', d: 'M15 12 A5.25 5.25 0 0 1 8 17.25', sw: 1.5},
            {t: 'path', d: 'M15 12 A5.25 5.25 0 0 0 8 6.75', sw: 1.5},
            {t: 'line', x1: 8, y1: 17.25, x2: 8, y2: 6.75, sw: 1.5},
        ]
        expect(connectionReach(bell)).toEqual([8, 15])
    })
    test('a line that only touches the centre line with its end, a path that stays off it and a horizontal line are handled', () => {
        expect(connectionReach([{t: 'line', x1: 5, y1: 12, x2: 9, y2: 4}])).toEqual([5, 5])
        expect(connectionReach([{t: 'line', x1: 5, y1: 4, x2: 9, y2: 6}])).toBeNull()
        expect(connectionReach([{t: 'path', d: 'M2 3 L8 3 L8 9 Z'}])).toBeNull()
        expect(connectionReach([{t: 'line', x1: 9, y1: 12, x2: 1, y2: 12}])).toEqual([1, 9])
    })
    test('a path that crosses the line in the middle of a curve or an arc', () => {
        const [left, right] = connectionReach([{t: 'path', d: 'M10 6 C14 8 14 16 10 18'}])
        expect(left).toBeCloseTo(right, 5)
        expect(left).toBeGreaterThan(12)
        const [arcLeft] = connectionReach([{t: 'path', d: 'M12 6 A6 6 0 0 1 12 18'}]) // a half circle that bulges to the right: x = 18 at y = 12
        expect(arcLeft).toBeCloseTo(18, 0)
    })
})

// ---- readable when printed: never smaller than full size, long circuits in columns, big sub boards on sheets of their own ----

const textsOf = (circuits) => circuits.flatMap((circuit) => circuit.items.filter((item) => item.kind === 'text'))
test('printed at full size the smallest text of the drawing is as large as the titles of the footer', () => {
    expect(DETAIL_FONT_SIZE * MM_PER_UNIT).toBeGreaterThanOrEqual(FOOTER_TITLE_FONT_SIZE - 1e-9)
    const p = proj(tree(Array.from({length: 30}, (_, i) => kring('K' + i, [node('s' + i, 'stopcontact', [], {label: 'Keuken', p: {aantal: 2, details: 'Merk: X\nType: Y'}})], {kabel: 'XVB 3G2,5', amp: 16, curve: 'C', kortsl: 3}))))
    const slices = sheetSlices(layoutBoard(p, p.een[0]))
    expect(slices.length).toBeGreaterThan(1)
    slices.forEach((slice) => expect(sheetScale(slice.x1 - slice.x0, -slice.minY)).toBe(MM_PER_UNIT))
    const sizes = textsOf(layoutBoard(p, p.een[0]).circuits).map((item) => item.fontSize || 13)
    expect(Math.min(...sizes) * MM_PER_UNIT).toBeGreaterThanOrEqual(FOOTER_TITLE_FONT_SIZE - 1e-9)
})
test('a circuit holds at most 8 points: 8 of any symbol, each with a name or a count, always fit straight on a sheet at full size', () => {
    const library = baseProject().symbols ?? []
    const keys = (library.length ? library.map((symbol) => symbol.k) : ['stopcontact', 'lichtpunt', 'schakelaar', 'wissel', 'tl', 'motor', 'kookplaat', 'laadpaal']).filter(
        (key) => !['kring', 'diff', 'bord', 'subbord', 'domotica', 'aansluiting', 'teller', 'hoofdschakelaar', 'aarding', 'zekering', 'leeg', 'overspanning'].includes(key),
    )
    expect(keys.length).toBeGreaterThan(5)
    for (const key of keys)
        for (const extra of [{label: 'Slaapkamer 2'}, {label: '', p: {aantal: 4}}, {label: '', p: {aantal: 1}}]) {
            const points = Array.from({length: 8}, (_, i) => node(key + i, key, [], extra))
            const p = proj(tree([kring('K', points, {kabel: 'XVB Cca 5G2,5', kortsl: 10, polen: 4, amp: 20, curve: 'C'})])),
                [circuit] = layoutBoard(p, p.een[0]).circuits
            expect(-circuit.minY, key).toBeLessThanOrEqual(MAX_SHEET_HEIGHT)
            expect(sheetScale(circuit.w, -circuit.minY), key).toBe(MM_PER_UNIT)
            // in one column: no bend
            expect(new Set(textsOf([circuit]).filter((item) => item.anchor === 'end').map((item) => item.x)).size, key).toBe(1)
        }
    // a switch with lamps behind it on every point (8 horizontal lines with a chain each) fits as well
    const chained = Array.from({length: 8}, (_, i) => node('w' + i, 'schakelaar', [node('l' + i, 'lichtpunt', [], {label: '', p: {aantal: 3}})], {label: 'Gang'}))
    const p = proj(tree([kring('K', chained)]))
    expect(-layoutBoard(p, p.een[0]).circuits[0].minY).toBeLessThanOrEqual(MAX_SHEET_HEIGHT)
})
test('the specs and short-circuit rating stand next to each other right of the stem, a bit above the bus; the cable stands above them', () => {
    const p = proj(tree([kring('K', [node('s', 'stopcontact')], {kabel: 'XVB Cca 3G2,5', kortsl: 3, polen: 2, amp: 16, curve: 'C'})])),
        [circuit] = layoutBoard(p, p.een[0]).circuits,
        vertical = textsOf([circuit]).filter((item) => item.vertical),
        drawnTop = (item) => item.y - item.text.length * 13 * 0.6
    expect(vertical.map((item) => item.text)).toEqual(['2P - 16A', 'Curve C', '3000', 'XVB Cca 3G2,5'])
    const [rating, curve, shortCircuit, cable] = vertical,
        stem = circuit.items.find((item) => item.kind === 'line' && item.x1 === item.x2 && item.y1 === 0).x1
    // the specs: on one height a bit above the bus, the first column clear of the stem (text stands left of its x when vertical)
    expect(new Set([rating, curve, shortCircuit].map((item) => item.y))).toEqual(new Set([-10]))
    expect(rating.x - 11).toBeGreaterThan(stem + 3)
    expect(curve.x).toBeGreaterThan(rating.x + 10)
    // the cable: along the stem above the specs
    expect(cable.x).toBe(rating.x)
    expect(cable.y).toBeLessThan(Math.min(drawnTop(rating), drawnTop(curve), drawnTop(shortCircuit)))
    // the first point is above all of them, with its name (48 below its line) clear of the cable
    const first = circuit.items.find((item) => item.kind === 'sym' && !item.breaker)
    expect(first.y + 48).toBeLessThan(drawnTop(cable) - 6)
    // without a breaker only the cable stands there
    const bare = proj(tree([kring('K', [node('s', 'stopcontact')], {bescherming: 'geen', kabel: 'XVB Cca 3G2,5'})]))
    expect(textsOf(layoutBoard(bare, bare.een[0]).circuits).filter((item) => item.vertical).map((item) => item.text)).toEqual(['XVB Cca 3G2,5'])
})
test('the head below the bus stays within HEAD_DEPTH, so the bus can go down to just above the footer', () => {
    const p = proj(tree([kring('K')], {kabel: '4x16'})),
        head = layoutBoard(p, p.een[0]).head
    expect(head.kwh && head.main).toBeTruthy()
    head.items.forEach((item) => {
        const bottom = item.kind === 'line' ? Math.max(item.y1, item.y2) : item.kind === 'sym' ? item.y + 25 : item.y + 4
        expect(bottom).toBeLessThanOrEqual(HEAD_DEPTH)
    })
})

test('the long name of a circuit (and its extra text) left of the stem stays below the number of the first point', () => {
    const p = proj(tree([kring('K', [node('s', 'stopcontact')], {tekst: 'Zolder en badkamer boven'}, {label: 'Verlichting garage achteraan'})])),
        [circuit] = layoutBoard(p, p.een[0]).circuits,
        name = textsOf([circuit]).filter((item) => item.vertical && item.x < 30),
        number = textsOf([circuit]).find((item) => item.anchor === 'end' && item.text === '1')
    expect(name.map((item) => item.text)).toEqual(['Verlichting garage achteraan', 'Zolder en badkamer boven'])
    const nameTop = Math.min(...name.map((item) => item.y - item.text.length * 13 * 0.6))
    expect(number.y + 3).toBeLessThan(nameTop)
})

test('more points than fit with the bus at its lowest: the line bends over the top into a next column, where the numbering goes on upwards', () => {
    const points = Array.from({length: 13}, (_, i) => node('s' + i, 'lichtpunt', [], {label: 'Gang', p: {aantal: 2}})),
        p = proj(tree([kring('K', points)])),
        [circuit] = layoutBoard(p, p.een[0]).circuits,
        numbers = textsOf([circuit]).filter((item) => item.anchor === 'end'),
        stems = [...new Set(numbers.map((item) => item.x))]
    expect(-circuit.minY).toBeLessThanOrEqual(MAX_SHEET_HEIGHT)
    expect(numbers.map((item) => item.text)).toEqual(Array.from({length: 13}, (_, i) => String(i + 1)))
    expect(stems).toHaveLength(2)
    const first = numbers.filter((item) => item.x === stems[0]),
        second = numbers.filter((item) => item.x === stems[1])
    // the first column is as full as a sheet allows (one more point would not fit), the second one starts at the bottom again and goes up
    expect(first.length).toBeGreaterThanOrEqual(7)
    expect(first.at(-1).y + 10 - 96 - 28).toBeLessThan(-MAX_SHEET_HEIGHT)
    expect(second[0].y).toBe(first[0].y)
    second.forEach((item, index) => index && expect(item.y).toBeLessThan(second[index - 1].y))
    // the bend: up the first stem, over the top of both columns, down the second stem
    const top = Math.min(...numbers.map((item) => item.y))
    const over = circuit.items.find((item) => item.kind === 'line' && item.y1 === item.y2 && item.x1 < stems[1] && item.x2 > stems[1] - 10 && item.y1 < top)
    expect(over).toBeDefined()
    expect(circuit.items.some((item) => item.kind === 'line' && item.x1 === item.x2 && item.y1 === over.y1 && item.y2 > item.y1 && item.x1 > stems[0])).toBe(true)
})


// a board in a board in a board: Hoofdbord (U..Y and Z) -> Z -> ZA -> Tuinhuis (ZB and ZF with a Verdeelbord each, ZP) -> Verdeelbord (circuits)
const subboard = (id, label, children) => node(id, 'subbord', children, {label})
const verdeelbord = (prefix) =>
    subboard(prefix + 'V', 'Verdeelbord', Array.from({length: 6}, (_, i) => kring(prefix + i, Array.from({length: 4}, (_, j) => node(prefix + i + 's' + j, 'stopcontact')))))
const hoofdbord = () =>
    subboard('HB', 'Hoofdbord', [
        ...['U', 'V', 'W', 'X', 'Y'].map((letter) => kring(letter, [node(letter + 's', 'stopcontact')])),
        kring('Z', [
            node('ZA', 'diff', [subboard('TH', 'Tuinhuis', [kring('ZB', [verdeelbord('ZB')]), kring('ZF', [verdeelbord('ZF')]), kring('ZP', [node('ZPs', 'stopcontact')])])], {label: 'ZA', p: {amp: 40}}),
        ]),
    ])
const idsIn = (circuit) => new Set(flatten([circuit.node]).map((n) => n.id))
test('a circuit with sub boards that is too wide for a sheet is cut into parts; every part repeats the way down to what it holds', () => {
    const p = proj(tree([kring('A1', [node('a', 'stopcontact')]), kring('H', [hoofdbord()])])),
        board = layoutBoard(p, p.een[0]),
        parts = board.circuits.filter((circuit) => circuit.node.id === 'H')
    expect(parts).toHaveLength(2)
    const [left, right] = parts.map(idsIn)
    // the first part: U..Y and Z down to Tuinhuis with ZB and its Verdeelbord, not ZF
    ;['U', 'V', 'W', 'X', 'Y', 'Z', 'ZA', 'TH', 'ZB', 'ZBV', 'ZB0', 'ZB5'].forEach((id) => expect(left.has(id), id).toBe(true))
    ;['ZF', 'ZFV', 'ZP'].forEach((id) => expect(left.has(id), id).toBe(false))
    // the second part repeats the way down (H, Hoofdbord, Z, ZA, Tuinhuis) with only ZF (whole, with its Verdeelbord) and ZP
    ;['H', 'HB', 'Z', 'ZA', 'TH', 'ZF', 'ZFV', 'ZF0', 'ZF5', 'ZP'].forEach((id) => expect(right.has(id), id).toBe(true))
    ;['U', 'Y', 'ZB', 'ZBV'].forEach((id) => expect(right.has(id), id).toBe(false))
    // each part on a sheet of its own, the second one following the first
    expect(parts[1].newSheet).toBe(true)
    const slices = sheetSlices(board)
    const sheetOf = (circuit) => slices.findIndex((slice) => board.circuits.indexOf(circuit) >= slice.from && board.circuits.indexOf(circuit) < slice.to)
    expect(sheetOf(parts[1])).toBe(sheetOf(parts[0]) + 1)
    // a part is not wider than its height allows (it is not made smaller for its width)
    parts.forEach((part) => expect(sheetScale(part.w + 60, -part.minY)).toBeCloseTo(sheetScale(1, -part.minY), 2))
    // the tree itself is untouched
    expect(p.een[0].tree[0].children[0].children[0].children[1].children[0].children).toHaveLength(6)
})
test('a sub board that fits is not cut, and a circuit without sub boards is never cut', () => {
    const small = proj(tree([kring('H', [subboard('S', 'Klein', [kring('k1', [node('s', 'stopcontact')]), kring('k2', [node('t', 'stopcontact')])])])]))
    expect(layoutBoard(small, small.een[0]).circuits.map((circuit) => circuit.node.id)).toEqual(['H'])
    const wide = proj(tree([kring('W', Array.from({length: 1}, () => node('w', 'stopcontact', [chain(40)].flat())))]))
    expect(layoutBoard(wide, wide.een[0]).circuits).toHaveLength(1)
})

test('in a sub board deep down a circuit bends into a next column when its points would make the sheet smaller than NESTED_MIN_SCALE', () => {
    // Hoofdbord -> Z -> ZA -> Tuinhuis -> ZB -> Verdeelbord -> circuit ZE with n points
    const deep = (n) => {
        const ze = kring('ZE', Array.from({length: n}, (_, i) => node('ze' + i, 'stopcontact', [], {label: '', p: {aantal: i % 2 ? 2 : 1, nr: 'e' + (i + 1)}})))
        const p = proj(
            tree([
                kring('H', [
                    subboard('HB', 'Hoofdbord', [
                        kring('Z', [node('ZA', 'diff', [subboard('TH', 'Tuinhuis', [kring('ZB', [subboard('VB', 'Verdeelbord', [ze])])])], {label: 'ZA', p: {amp: 40}})]),
                    ]),
                ]),
            ]),
        )
        const [circuit] = layoutBoard(p, p.een[0]).circuits,
            numbers = circuit.items.filter((item) => item.kind === 'text' && item.anchor === 'end' && /^e\d+$/.test(item.text))
        return {height: -circuit.minY, stems: new Set(numbers.map((item) => Math.round(item.x))).size, numbers: numbers.length}
    }
    let n = 1
    while (deep(n + 1).stems === 1) n++
    // the most points that stay in one column: they fit within the height of a sheet at NESTED_MIN_SCALE
    expect(n).toBeGreaterThanOrEqual(5)
    expect(deep(n).height).toBeLessThanOrEqual(NESTED_HEIGHT)
    // one more bends into a second column, and still fits
    const bent = deep(n + 1)
    expect(bent.stems).toBe(2)
    expect(bent.numbers).toBe(n + 1)
    expect(bent.height).toBeLessThanOrEqual(NESTED_HEIGHT)
    expect(sheetScale(1, bent.height)).toBeGreaterThanOrEqual(NESTED_MIN_SCALE - 1e-9)
    // on the bus of the sheet the same points stay straight (there the full height of a sheet at full size counts)
    const flat = proj(tree([kring('ZE', Array.from({length: n + 1}, (_, i) => node('ze' + i, 'stopcontact', [], {label: '', p: {aantal: i % 2 ? 2 : 1}})))]))
    expect(new Set(layoutBoard(flat, flat.een[0]).circuits[0].items.filter((item) => item.anchor === 'end').map((item) => item.x)).size).toBe(1)
})
