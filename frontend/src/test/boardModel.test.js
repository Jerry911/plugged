// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {
    letter,
    infoOf,
    nextLetter,
    defaultProps,
    defaultTree,
    circuit,
    board,
    slices,
    sheetPlan,
    numbering,
    MAXW,
    SP,
    SYM,
    BUSX0,
} from '../boardModel.jsx'
import {base, node} from './utils.jsx'

const kring = (id, kids = [], p = {}, extra = {}) =>
    node(id, 'kring', kids, {p: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', kortsl: 3, tekst: '', ...p}, ...extra})
const tree = (krings, q = {}) => [
    node('A', 'aansluiting', [node('T', 'teller', [node('B', 'bord', krings, {p: {geaard: true}})])], {
        p: {teller: true, bescherming: 'differentieel', delta: 300, polen: 4, amp: 40, diffType: 'A', kabel: '4x16', ...q},
    }),
]
const proj = (t) => ({...base(), een: [{id: 'e1', name: 'Blad 1', tree: t}]})
const chain = (n) => {
    let c = []
    for (let i = n; i > 0; i--) c = [node('c' + i, 'stopcontact', c)]
    return c
}
const syms = (it) => it.filter((i) => i.k === 'sym'),
    texts = (it) => it.filter((i) => i.k === 'text')
test('letter sequence', () => {
    expect([0, 25, 26, 27, 51, 52].map(letter)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
})
test('infoOf builds the spec string', () => {
    expect(infoOf({curve: 'C', amp: 6, polen: 2, kabel: 'XVB Cca 3G2,5'})).toBe('C6 2P XVB Cca 3G2,5')
    expect(infoOf()).toBe('')
    expect(infoOf({amp: 16})).toBe('16')
})
test('nextLetter fills the first free letter', () => {
    expect(nextLetter([])).toBe('A')
    expect(nextLetter(tree([kring('x', [], {}, {label: 'A'}), kring('y', [], {}, {label: 'C'})]))).toBe('B')
    expect(nextLetter(tree([kring('x', [], {}, {label: 'A'}), kring('y', [], {}, {label: 'B'})]))).toBe('C')
})
test('default props and default tree', () => {
    expect(defaultProps('kring')).toMatchObject({polen: 2, amp: 16, curve: 'B', bescherming: 'automatisch'})
    expect(defaultProps('aansluiting')).toMatchObject({teller: true, delta: 300, kabel: '4x16'})
    expect(defaultProps('bord')).toEqual({geaard: true})
    expect(defaultProps('oven')).toBeUndefined()
    const t = defaultTree()
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({type: 'aansluiting'})
    expect(t[0].children[0]).toMatchObject({type: 'bord'})
    expect(defaultTree()[0].id).not.toBe(t[0].id)
})
test('circuit draws stem, breaker, letter, specs and cable', () => {
    const c = circuit(base(), kring('K1', [node('s', 'stopcontact')], {tekst: 'Keuken'}, {label: 'K1'}))
    const t = texts(c.items).map((x) => x.s)
    expect(t).toEqual(expect.arrayContaining(['K1', 'Keuken', '2P - 16A', 'Curve B', '3000', 'XVB Cca 3G2,5', '1']))
    // the breaker: the stem stops at the lower contact (no line through it), a lever and a filled block along the lever, the line carries on above
    expect(c.items.some((i) => i.k === 'line' && i.fill)).toBe(true)
    expect(c.items.some((i) => i.k === 'line' && i.x1 === 30 && i.y1 === 0 && i.y2 === -30)).toBe(true)
    expect(c.items.some((i) => i.k === 'line' && i.x1 === 30 && i.x2 === 30 && i.y1 === -52)).toBe(true)
    expect(c.items.some((i) => i.k === 'line' && i.x1 === 30 && i.x2 === 30 && i.y1 === 0 && i.y2 < -52)).toBe(false)
    expect(c.items.some((i) => i.k === 'line' && i.x1 === 30 && i.y1 === 0)).toBe(true)
    expect(syms(c.items)).toHaveLength(1)
    expect(c.minY).toBeLessThan(-215)
    expect(c.w).toBeGreaterThanOrEqual(86)
})
test('circuit without protection has no breaker or specs; info is the fallback spec text', () => {
    const none = circuit(base(), kring('K', [], {bescherming: 'geen'}, {label: 'K'}))
    expect(none.items.some((i) => i.fill)).toBe(false)
    expect(texts(none.items).map((x) => x.s)).not.toContain('Curve B')
    const old = circuit(base(), node('K', 'kring', [], {info: 'B16 2,5mm²'}))
    expect(texts(old.items).map((x) => x.s)).toContain('B16 2,5mm²')
})
test('long circuit names are written rotated and the name moves up', () => {
    const c = circuit(base(), kring('K', [], {tekst: 'Naam'}, {label: 'LAADPAAL'}))
    const l = texts(c.items).find((x) => x.s === 'LAADPAAL'),
        n = texts(c.items).find((x) => x.s === 'Naam')
    expect(l.rot).toBe(1)
    expect(n.y).toBeLessThan(-72)
})
test('chains make circuits wider and push following circuits to the right', () => {
    const w = (k) => circuit(base(), kring('K', chain(k))).w
    expect(w(3)).toBeGreaterThan(w(1))
    const x2 = (n) => board(proj(tree([kring('K1', chain(n)), kring('K2')])), proj(tree([])).een[0]).circuits
    const a = board(proj(tree([kring('K1', chain(1)), kring('K2')])), proj(tree([kring('K1', chain(1)), kring('K2')])).een[0]),
        b = board(proj(tree([kring('K1', chain(4)), kring('K2')])), proj(tree([kring('K1', chain(4)), kring('K2')])).een[0])
    expect(b.circuits[1].x).toBeGreaterThan(a.circuits[1].x)
})
test('multiple children are stacked upwards, counts and labels are shown', () => {
    const c = circuit(
        base(),
        kring('K', [node('s', 'stopcontact', [], {p: {aantal: 3, nr: '7', hor: false}}), node('l', 'lichtpunt', [], {label: 'Gang'})]),
    )
    const ys = syms(c.items).map((i) => i.y)
    expect(ys[1]).toBeLessThan(ys[0] - 60)
    const t = texts(c.items)
    expect(t.map((x) => x.s)).toEqual(expect.arrayContaining(['x3', '7', '2']))
    expect(t.find((x) => x.s === 's').italic).toBe(1)
})
test('a node with children continues to the right; extra children branch with a connector', () => {
    const c = circuit(base(), kring('K', [node('m', 'motor', [node('a', 'bel'), node('b', 'bel')])]))
    const s = syms(c.items)
    expect(s).toHaveLength(3)
    expect(s[1].x).toBeGreaterThan(s[0].x)
    expect(s[2].y).toBeLessThan(s[1].y)
})
test('box elements place their children in columns above the box', () => {
    const box = node('D', 'domotica', [kring('k1', [node('m1', 'motor')]), node('s1', 'stopcontact')], {p: {tekst: 'Domotica'}})
    const c = circuit(base(), kring('K', [box]))
    const r = c.items.find((i) => i.k === 'rect' && i.id === 'D')
    expect(r.w).toBeGreaterThanOrEqual(100)
    expect(texts(c.items).find((x) => x.s === 'Domotica').bold).toBe(1)
    syms(c.items).forEach((s) => expect(s.y).toBeLessThan(r.y))
    const empty = circuit(base(), kring('K', [node('E', 'subbord', [], {label: 'X'})]))
    expect(empty.items.find((i) => i.k === 'rect' && i.id === 'E').w).toBe(100)
    const named = circuit(base(), kring('K', [node('E', 'domotica', [], {label: ''})]))
    expect(texts(named.items).map((x) => x.s)).toContain('Domotica (kast)')
})
test('nested kring is transparent', () => {
    const c = circuit(base(), kring('K', [node('k2', 'kring', [node('m', 'motor'), node('b', 'bel')])]))
    expect(syms(c.items)).toHaveLength(2)
})
test('board finds the bus through the chain, flattens differentials and ignores other children', () => {
    const t = tree([node('D', 'diff', [kring('K1'), kring('K2')]), kring('K3'), node('E', 'aarding'), node('Z', 'zekering', [kring('K4')])])
    const p = proj(t),
        b = board(p, p.een[0])
    expect(b.circuits.map((c) => c.n.id)).toEqual(['K1', 'K2', 'K3', 'K4'])
    expect(b.bus.id).toBe('B')
    expect(b.head).toMatchObject({kwh: true, main: 'differentieel', ground: true})
    expect(b.circuits[0].x).toBe(BUSX0)
    b.circuits.slice(1).forEach((c, i) => expect(c.x).toBe(b.circuits[i].x + b.circuits[i].w + SP))
    expect(b.end).toBe(b.circuits[3].x + b.circuits[3].w + SP)
})
test('board head variants', () => {
    const mk = (t) => {
        const p = proj(t)
        return board(p, p.een[0]).head
    }
    expect(mk(tree([], {bescherming: 'automatisch'})).main).toBe('automatisch')
    expect(mk(tree([], {bescherming: 'geen', teller: false}))).toMatchObject({main: null, kwh: false})
    const old = [node('A', 'aansluiting', [node('T', 'teller', [node('B', 'bord', [kring('K')]), node('E', 'aarding')])])]
    expect(mk(old)).toMatchObject({kwh: true, main: null, ground: true})
    expect(mk([node('A', 'aansluiting', [node('B', 'bord', [])])]).kwh).toBe(false)
    expect(mk([node('B', 'bord', [kring('K')])])).toMatchObject({kwh: false, ground: false})
    const none = proj([])
    expect(board(none, none.een[0])).toMatchObject({circuits: [], bus: null, head: {kwh: false, ground: false}})
})
test('slices split on sheet width and keep order', () => {
    const ks = Array.from({length: 40}, (_, i) => kring('K' + i, chain(1)))
    const p = proj(tree(ks)),
        b = board(p, p.een[0]),
        s = slices(b)
    expect(s.length).toBeGreaterThan(1)
    expect(s[0].first).toBe(true)
    expect(s.at(-1).last).toBe(true)
    expect(s.map((x) => x.to - x.from).reduce((a, c) => a + c)).toBe(40)
    s.forEach((x, i) => {
        if (i) expect(x.from).toBe(s[i - 1].to)
        expect(x.x1 - x.x0).toBeLessThanOrEqual(MAXW + SP + 260)
    })
    expect(s[0].x0).toBe(0)
    expect(s[1].x0).toBe(b.circuits[s[1].from].x - 10)
    expect(s[0].x1).toBe(b.circuits[s[0].to - 1].x + b.circuits[s[0].to - 1].w)
})
test('an oversized single circuit still gets its own slice; empty boards get one', () => {
    const wide = kring('W', chain(30)),
        p = proj(tree([wide, kring('K')])),
        s = slices(board(p, p.een[0]))
    expect(s).toHaveLength(2)
    expect(s[0].to - s[0].from).toBe(1)
    const e = slices(board(proj([]), proj([]).een[0]))
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({first: true, last: true, from: 0, to: 0})
    expect(e[0].x1).toBeGreaterThanOrEqual(260)
})
test('sheetPlan numbers every printed sheet, een first then situatie', () => {
    const p = proj(tree(Array.from({length: 40}, (_, i) => kring('K' + i, chain(1)))))
    p.een.push({id: 'e2', name: '2', tree: []})
    p.sit.push({id: 's2', name: 'S2', walls: [], items: []})
    const pl = sheetPlan(p)
    expect(pl.map((e) => e.no)).toEqual(pl.map((_, i) => i + 1))
    expect(new Set(pl.map((e) => e.total))).toEqual(new Set([pl.length]))
    expect(pl.slice(-2).map((e) => e.kind)).toEqual(['sit', 'sit'])
    expect(pl.filter((e) => e.kind === 'een').at(-1).pg.id).toBe('e2')
    expect(numbering(p, p.sit[1])).toEqual({no: 2, total: 2})
    expect(numbering(p, p.een[0]).no).toBe(1)
})
test('scoped sheetPlan numbers eendraad sheets and situatie pages separately', () => {
    const p = proj(tree(Array.from({length: 40}, (_, i) => kring('K' + i, chain(1)))))
    p.een.push({id: 'e2', name: '2', tree: []})
    p.sit.push({id: 's2', name: 'S2', walls: [], items: []})
    const all = sheetPlan(p),
        pl = sheetPlan(p, true),
        een = pl.filter((e) => e.kind === 'een'),
        sit = pl.filter((e) => e.kind === 'sit')
    expect(een.map((e) => e.no)).toEqual(een.map((_, i) => i + 1))
    expect(new Set(een.map((e) => e.total))).toEqual(new Set([een.length]))
    expect(een.length + sit.length).toBe(all.length)
    expect(sit.map((e) => [e.no, e.total])).toEqual([
        [1, 2],
        [2, 2],
    ])
    expect(numbering(p, p.een[1])).toEqual({no: een.length, total: een.length})
})
const symBoxes = (c) => c.items.filter((i) => i.k === 'sym').map((i) => [c.x + i.x - SYM / 2, i.y - SYM / 2, c.x + i.x + SYM / 2, i.y + SYM / 2]),
    overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
const tallWide = () =>
    kring('M', [
        ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => node(id, 'stopcontact')),
        node('g', 'stopcontact', chain(5)),
    ])
test('a lower circuit slides left underneath the overhang of the previous one', () => {
    const p = proj(tree([tallWide(), kring('N', [node('s', 'stopcontact'), node('t', 'stopcontact')])])),
        b = board(p, p.een[0]),
        [m, n] = b.circuits
    expect(n.x).toBeLessThan(m.x + m.w + SP)
    expect(n.x).toBeGreaterThan(m.x)
    symBoxes(m).forEach((a) => symBoxes(n).forEach((c) => expect(overlap(a, c)).toBe(false)))
    expect(b.end).toBe(Math.max(m.x + m.w, n.x + n.w) + SP)
})
test('a circuit that is as tall as the overhang is not tucked in', () => {
    const p = proj(tree([tallWide(), kring('T', Array.from({length: 12}, (_, i) => node('t' + i, 'stopcontact')))])),
        [m, n] = board(p, p.een[0]).circuits
    expect(n.x).toBe(m.x + m.w + SP)
})
test('tucking in saves width so more circuits fit on a sheet', () => {
    const ks = Array.from({length: 24}, (_, i) => (i % 2 ? kring('N' + i, [node('s', 'stopcontact')]) : tallWide()))
    const p = proj(tree(ks)),
        b = board(p, p.een[0]),
        s = slices(b)
    expect(s.map((x) => x.to - x.from).reduce((a, c) => a + c)).toBe(24)
    s.forEach((x) => expect(x.x1 - x.x0).toBeLessThanOrEqual(MAXW + SP + 260))
    const plain = b.circuits.reduce((a, c) => a + c.w + SP, 0)
    expect(b.circuits.at(-1).x + b.circuits.at(-1).w).toBeLessThan(plain)
})
test('a sub-board directly under the bus is drawn as an unprotected column', () => {
    const p = proj(tree([node('S', 'subbord', [kring('k', [node('m', 'motor')])], {label: 'Veranda'}), kring('K2')]))
    const b = board(p, p.een[0])
    expect(b.circuits).toHaveLength(2)
    expect(b.circuits[0].n).toMatchObject({id: 'S~', type: 'kring'})
    expect(b.circuits[0].items.some((i) => i.k === 'rect' && i.id === 'S')).toBe(true)
    expect(b.circuits[0].items.some((i) => i.fill)).toBe(false)
})

test('sockets stack horizontally from two on, unless p.hor says otherwise', () => {
    const arcs = (p) => syms(circuit(base(), kring('K', [node('s', 'stopcontact', [], {p})])).items)[0].shapes.filter((h) => h.t === 'arc').length
    expect(arcs({})).toBe(1)
    expect(arcs({aantal: 3})).toBe(3)
    expect(arcs({aantal: 3, hor: false})).toBe(1)
    expect(arcs({hor: true})).toBe(1)
    const txt = texts(circuit(base(), kring('K', [node('s', 'stopcontact', [], {p: {aantal: 2}})])).items).map((x) => x.s)
    expect(txt).not.toContain('x2')
})