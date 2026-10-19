// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Busbar-style layout of an eendraadschema: a horizontal bus with circuits placed left to right (units ~ px, see U for mm).
import {typeOf} from './symbols'
import {flat, uid} from './util'

export const U = 0.16,
    MAXW = 1700,
    BUSX0 = 20,
    SP = 24,
    STUB = 24,
    SYM = 46,
    GAP = 20,
    ROWH = 100,
    BOXUP = 120
export const BOXT = new Set(['domotica', 'subbord'])
const tw = (s) => String(s || '').length * 6.6
export const letter = (i) =>
    i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26))
export const infoOf = (q = {}) => [(q.curve || '') + (q.amp || ''), q.polen ? q.polen + 'P' : '', q.kabel || ''].filter(Boolean).join(' ')
export const nextLetter = (tree) => {
    const used = new Set(
        flat(tree)
            .filter((n) => n.type === 'kring')
            .map((n) => n.label),
    )
    let i = 0
    while (used.has(letter(i))) i++
    return letter(i)
}
export const defaultProps = (k) =>
    ({
        kring: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', kortsl: 3, bescherming: 'automatisch', tekst: ''},
        aansluiting: {teller: true, polen: 4, amp: 40, bescherming: 'differentieel', delta: 300, diffType: 'A', kabel: '4x16', kortsl: 3},
        bord: {geaard: true},
    })[k]
export const defaultTree = () => [
    {
        id: uid(),
        type: 'aansluiting',
        label: 'Aansluiting net',
        info: '',
        p: defaultProps('aansluiting'),
        children: [{id: uid(), type: 'bord', label: 'Verdeelbord', info: '', p: defaultProps('bord'), children: []}],
    },
]
const line = (x1, y1, x2, y2) => ({k: 'line', x1, y1, x2, y2}),
    text = (x, y, s, o = {}) => ({k: 'text', x, y, s, ...o})
const own = (n) => (n.label ? 100 : Number(n.p?.aantal) > 1 ? 80 : 66)
const ext = (n) =>
    BOXT.has(n.type)
        ? n.children.length
            ? 300
            : 100
        : Math.max(
              own(n),
              n.children.reduce((a, c) => a + ext(c), 0),
          )
function stack(p, kids, sx, y, out, stub, num) {
    let acc = 0,
        r = sx,
        top = y - 30,
        bot = y + 30,
        last = y
    kids.forEach((c, i) => {
        const yi = y - acc
        acc += ext(c)
        last = yi
        out.push(line(sx, yi, sx + stub, yi))
        if (num) out.push(text(sx + 4, yi - 10, c.p?.nr || String(i + 1), {size: 13}))
        const e = node(p, c, sx + stub, yi, out)
        r = Math.max(r, e.r)
        top = Math.min(top, e.top)
        bot = Math.max(bot, e.bot)
    })
    if (last !== y) out.push(line(sx, y, sx, last))
    return {r, top, bot}
}
function node(p, n, x, y, out) {
    const t = typeOf(p, n.type),
        pr = n.p || {},
        lab = n.label || ''
    if (n.type === 'kring') return stack(p, n.children, x, y, out, STUB, false)
    if (BOXT.has(n.type)) {
        const title = pr.tekst || lab || t.name,
            up = y - 26 - BOXUP
        let cx = x + 14,
            top = y - 26
        n.children.forEach((c) => {
            const sx = cx
            out.push(line(sx, y - 25, sx, up))
            const st = stack(p, c.type === 'kring' ? c.children : [c], sx, up, out, STUB, false)
            top = Math.min(top, st.top)
            cx = Math.max(st.r, sx + STUB + SYM) + GAP
        })
        const w = Math.max(100, tw(title) * 1.4 + 30, n.children.length ? cx - x - GAP + 16 : 0)
        out.push(
            {k: 'rect', x, y: y - 25, w, h: 50, id: n.id},
            text(x + w / 2, y + 5, title, {bold: 1, anchor: 'middle', size: 14, id: n.id}),
        )
        return {r: x + w, top, bot: y + 30}
    }
    const cnt = Number(pr.aantal) > 1 ? 'x' + pr.aantal : '',
        w = Math.max(SYM + 6, tw(lab) + 8, tw(cnt) + 8)
    out.push({k: 'sym', shapes: t.shapes, x: x + w / 2, y, s: SYM, id: n.id})
    if (cnt) out.push(text(x + w / 2, y + 38, cnt, {anchor: 'middle'}))
    if (lab) out.push(text(x + w / 2, y + (cnt ? 54 : 40), lab, {anchor: 'middle', italic: 1}))
    let r = x + w,
        top = y - 28,
        bot = y + (lab ? (cnt ? 62 : 48) : cnt ? 46 : 30)
    if (n.children.length) {
        const sx = r + GAP / 2
        out.push(line(r, y, sx, y))
        const st = stack(p, n.children, sx, y, out, GAP / 2, false)
        r = st.r
        top = Math.min(top, st.top)
        bot = Math.max(bot, st.bot)
    }
    return {r, top, bot}
}
export function circuit(p, n) {
    const out = [],
        pr = n.p || {},
        xs = 30,
        none = pr.bescherming === 'geen',
        cable = pr.kabel || '',
        y0 = -Math.max(215, 150 + tw(cable) + 40)
    const st = stack(p, n.children, xs, y0, out, STUB, true)
    out.push(line(xs, 0, xs, y0))
    if (!none) out.push(line(xs, -30, xs - 9, -52), {k: 'rect', x: xs - 14, y: -60, w: 7, h: 9, fill: 1})
    const long = (n.label || '').length > 3
    out.push(
        long
            ? text(xs - 14, -6, n.label, {bold: 1, size: 14, rot: 1, id: n.id})
            : text(xs - 14, -6, n.label || '', {bold: 1, size: 16, anchor: 'middle', id: n.id}),
    )
    if (pr.tekst) out.push(text(xs - 14, long ? -12 - tw(n.label) - 8 : -72, pr.tekst, {bold: 1, size: 14, rot: 1, id: n.id}))
    if (!none) {
        const sp = pr.amp ? [`${pr.polen || 2}P - ${pr.amp}A`, pr.curve ? `Curve ${pr.curve}` : null] : [n.info || null],
            k = pr.kortsl ? `${pr.kortsl}000` : null
        sp.filter(Boolean).forEach((s, i) => out.push(text(xs + 13 + 13 * i, -62, s, {rot: 1})))
        if (k) out.push({k: 'rect', x: xs + 33, y: -66 - tw(k) - 4, w: 15, h: tw(k) + 8}, text(xs + 44, -66, k, {rot: 1}))
    }
    if (cable) out.push(text(xs + 13, -150, cable, {rot: 1}))
    return {n, w: Math.max(st.r + 14, xs + 56), items: out, minY: Math.min(st.top, y0 - 60)}
}
export function board(p, pg) {
    const tree = pg.tree,
        root = tree.find((n) => n.type === 'aansluiting') || null
    const findBus = (n) => {
        if (n.type === 'bord') return n
        for (const c of n.children)
            if (['teller', 'hoofdschakelaar', 'diff', 'bord'].includes(c.type)) {
                const r = findBus(c)
                if (r) return r
            }
        return null
    }
    const bus = (root && findBus(root)) || flat(tree).find((n) => n.type === 'bord') || null
    const circs = (n) =>
        n.children.flatMap((c) =>
            c.type === 'kring'
                ? [c]
                : c.type === 'subbord'
                  ? [{id: c.id + '~', type: 'kring', label: '', info: '', p: {bescherming: 'geen'}, children: [c]}]
                  : ['diff', 'zekering', 'hoofdschakelaar'].includes(c.type)
                    ? circs(c)
                    : [],
        )
    const cs = bus ? circs(bus) : []
    let x = BUSX0
    const circuits = cs.map((c) => {
        const l = circuit(p, c),
            o = {...l, x}
        x += l.w + SP
        return o
    })
    const q = root?.p
    return {
        circuits,
        end: x,
        bus,
        head: {
            q,
            kwh: !!root && (q ? q.teller !== false : flat([root]).some((n) => n.type === 'teller')),
            main: q?.bescherming === 'differentieel' || q?.bescherming === 'automatisch' ? q.bescherming : null,
            ground: !!bus && (!!bus.p?.geaard || flat(tree).some((n) => n.type === 'aarding')),
        },
    }
}
export function slices(b) {
    const out = []
    let cur = null
    b.circuits.forEach((c, i) => {
        if (!cur || (c.x + c.w - cur.x0 > MAXW && cur.to > cur.from)) {
            cur = {from: i, to: i, x0: cur ? c.x - 10 : 0, x1: 0, minY: -120}
            out.push(cur)
        }
        cur.to = i + 1
        cur.x1 = c.x + c.w
        cur.minY = Math.min(cur.minY, c.minY)
    })
    if (!out.length) out.push({from: 0, to: 0, x0: 0, x1: 0, minY: -120})
    out.forEach((s, i) => {
        s.first = i === 0
        s.last = i === out.length - 1
        if (s.last) s.x1 = Math.max(s.x1, b.end)
        if (s.first) s.x1 = Math.max(s.x1, 260)
    })
    return out
}
export function sheetPlan(p) {
    const plan = [
        ...p.een.flatMap((pg) => {
            const b = board(p, pg)
            return slices(b).map((sl) => ({kind: 'een', pg, b, sl}))
        }),
        ...p.sit.map((pg) => ({kind: 'sit', pg})),
    ]
    return plan.map((e, i) => ({...e, no: i + 1, total: plan.length}))
}
export const numbering = (p, pg) => {
    const pl = sheetPlan(p)
    return {no: pl.findIndex((e) => e.pg === pg) + 1, total: pl.length}
}
