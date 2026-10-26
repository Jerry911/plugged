// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Busbar-style layout of an eendraadschema: a horizontal bus with circuits placed left to right (units ~ px, see U for mm).
import {shapesOf, stackOf, typeOf} from './symbols'
import {flat, uid} from './util.jsx'

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
// Details of an element (brand, type, serial number, Pmax, Umax, ...): one line per entry. Lines are separated by Enter (a real new line)
// or by '|' (how the eendraadschema stores them), so both a typed text area and an imported file give the same lines.
export const DET_SIZE = 11,
    DET_LINE = 13
export const detailLines = (s) =>
    String(s ?? '')
        .split(/\r?\n|\|/)
        .map((x) => x.trim())
        .filter(Boolean)
const dw = (s) => String(s || '').length * DET_SIZE * 0.56
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
// Lever of an automatic breaker, drawn like the eendraadschema (zekering_automatisch): a lever of 30 units tilted 20 degrees to the left
// of the vertical, pivoting on (x, y); the filled block (4 wide, the outer third of the lever) sits to the LEFT of the lever, not on its axis.
// Returns the lever, the block (a polygon) and the y of the lever tip, where the line above carries on.
const rd2 = (v) => Math.round(v * 100) / 100
export const breakerLever = (x, y) => {
    const c = Math.cos((20 * Math.PI) / 180),
        s = Math.sin((20 * Math.PI) / 180),
        pt = (u, v) => [rd2(x + u * c + v * s), rd2(y - u * s + v * c)]
    return {
        tipY: rd2(y - 30 * c),
        lever: {k: 'line', x1: x, y1: y, x2: pt(0, -30)[0], y2: pt(0, -30)[1]},
        block: {k: 'poly', pts: [pt(-4, -30), pt(0, -30), pt(0, -20), pt(-4, -20)]},
    }
}
const line = (x1, y1, x2, y2) => ({k: 'line', x1, y1, x2, y2}),
    text = (x, y, s, o = {}) => ({k: 'text', x, y, s, ...o})
export const reach = (shapes) => {
    let l = Infinity,
        r = -Infinity
    const hit = (a, b) => {
        l = Math.min(l, a)
        r = Math.max(r, b)
    }
    shapes.forEach((h) => {
        if (h.t === 'circle' && Math.abs(h.cy - 12) <= h.r) {
            const d = Math.sqrt(h.r ** 2 - (h.cy - 12) ** 2)
            hit(h.cx - d, h.cx + d)
        } else if (h.t === 'rect' && h.y <= 12 && 12 <= h.y + h.h) hit(h.x, h.x + h.w)
        else if (h.t === 'line' && h.y1 === 12 && h.y2 === 12) hit(Math.min(h.x1, h.x2), Math.max(h.x1, h.x2))
        else if (h.t === 'arc' && Math.abs(12 - h.cy) <= h.r) {
            const dy = 12 - h.cy,
                d = Math.sqrt(h.r ** 2 - dy ** 2),
                span = (((h.a2 - h.a1) % 360) + 360) % 360
            ;[h.cx - d, h.cx + d].forEach((x) => {
                const ang = (Math.atan2(dy, x - h.cx) * 180) / Math.PI
                if ((((ang - h.a1) % 360) + 360) % 360 <= span + 1e-9) hit(x, x)
            })
        }
    })
    return l <= r ? [l, r] : null
}
// vertical room of an element in a stack: the symbol, its count (x3), its label and one line per detail
const own = (n) => (n.label ? 100 : Number(n.p?.aantal) > 1 ? 80 : 66) + detailLines(n.p?.details).length * DET_LINE
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
            if (c.type === 'kring') {
                if (c.p?.kabel) out.push(text(sx + 13, y - 38, c.p.kabel, {rot: 1}))
                if (c.label) out.push(text(sx - 5, y - 38, c.label, {rot: 1, bold: 1, size: 13, id: c.id}))
            }
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
    const stacked = stackOf(t, pr)?.hor,
        shapes = shapesOf(t, pr),
        cnt = Number(pr.aantal) > 1 && !stacked ? 'x' + pr.aantal : '',
        det = detailLines(pr.details),
        w = Math.max(SYM + 6, tw(lab) + 8, tw(cnt) + 8, ...det.map((d) => dw(d) + 8))
    out.push({k: 'sym', shapes, x: x + w / 2, y, s: SYM, id: n.id, ...(n.r ? {r: n.r} : {})})
    const rc = reach(shapes),
        mid = x + w / 2
    if (rc) {
        const a = mid + ((rc[0] - 12) * SYM) / 24,
            b = mid + ((rc[1] - 12) * SYM) / 24
        if (a > x) out.push(line(x, y, a, y))
        if (n.children.length && b < x + w) out.push(line(b, y, x + w, y))
    }
    if (cnt) out.push(text(x + w / 2, y + 38, cnt, {anchor: 'middle'}))
    if (lab) out.push(text(x + w / 2, y + (cnt ? 54 : 40), lab, {anchor: 'middle', italic: 1}))
    // the details hang below the count and the name, one line each, clickable like the symbol itself
    const below = lab ? (cnt ? 54 : 40) : cnt ? 38 : 26
    det.forEach((d, i) => out.push(text(x + w / 2, y + below + DET_LINE * (i + 1) + 2, d, {anchor: 'middle', size: DET_SIZE, id: n.id})))
    let r = x + w,
        top = y - 28,
        bot = y + Math.max(lab ? (cnt ? 62 : 48) : cnt ? 46 : 30, det.length ? below + DET_LINE * det.length + 6 : 0)
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
// Bounding box [x1, y1, x2, y2] of a drawn item (text sizes are estimated), used to pack circuits tighter.
const box = (it) => {
    if (it.k === 'line') return [Math.min(it.x1, it.x2) - 2, Math.min(it.y1, it.y2) - 2, Math.max(it.x1, it.x2) + 2, Math.max(it.y1, it.y2) + 2]
    if (it.k === 'poly') return [Math.min(...it.pts.map((q) => q[0])) - 2, Math.min(...it.pts.map((q) => q[1])) - 2, Math.max(...it.pts.map((q) => q[0])) + 2, Math.max(...it.pts.map((q) => q[1])) + 2]
    if (it.k === 'rect') return [it.x - 2, it.y - 2, it.x + it.w + 2, it.y + it.h + 2]
    if (it.k === 'sym') {
        // a turned symbol needs more room: half the width of its turned bounding square
        const a = ((it.r || 0) * Math.PI) / 180,
            h = (SYM / 2) * (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))) + 4
        return [it.x - h, it.y - h, it.x + h, it.y + h]
    }
    if (it.k !== 'text') return null
    const size = it.size || 13,
        w = String(it.s ?? '').length * size * (it.bold ? 0.7 : 0.62),
        up = size * 0.85,
        dn = size * 0.3
    if (it.rot) {
        // rotated -90 degrees: the text runs upwards from (x, y)
        const [a, b] = it.anchor === 'middle' ? [it.y - w / 2, it.y + w / 2] : it.anchor === 'end' ? [it.y, it.y + w] : [it.y - w, it.y]
        return [it.x - up, a, it.x + dn, b]
    }
    const [a, b] = it.anchor === 'middle' ? [it.x - w / 2, it.x + w / 2] : it.anchor === 'end' ? [it.x - w, it.x] : [it.x, it.x + w]
    return [a, it.y - up, b, it.y + dn]
}
export function circuit(p, n) {
    const out = [],
        pr = n.p || {},
        xs = 30,
        none = pr.bescherming === 'geen',
        cable = pr.kabel || '',
        y0 = -Math.max(215, 150 + tw(cable) + 40)
    const st = stack(p, n.children, xs, y0, out, STUB, true)
    if (none) out.push(line(xs, 0, xs, y0))
    else {
        // the line does not run through the breaker: it stops at the lower contact, the lever swings up and to the left,
        // the filled block sits beside the lever (to its left), the line carries on above the lever
        const br = breakerLever(xs, -30)
        out.push(line(xs, 0, xs, -30), br.lever, br.block, line(xs, br.tipY, xs, y0))
    }
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
    // Circuits are placed left to right. A circuit that is lower than the overhang of earlier circuits on the same sheet
    // (their wide rows sit higher up) slides left underneath that overhang, which saves width (and sometimes a whole sheet).
    // Without such an overhang the spacing is exactly `previous width + SP`. `brk` marks the first circuit of a new sheet.
    let x0 = 0,
        right = 0,
        placed = []
    const circuits = cs.map((c, i) => {
        const l = circuit(p, c),
            bx = l.items.map(box).filter(Boolean),
            px = bx.reduce((a, b) => Math.max(a, b[2]), 0),
            m = {x: 0, bx, pad: Math.max(0, l.w - px)}
        let x = i ? right + SP : BUSX0,
            brk = false
        if (placed.length) {
            let lo = placed.at(-1).x + SP
            for (const q of placed) {
                let reach = -Infinity
                for (const b of q.bx) if (b[3] >= l.minY - 12 && b[1] <= 6) reach = Math.max(reach, b[2])
                if (reach > -Infinity) lo = Math.max(lo, q.x + reach + q.pad + SP)
            }
            x = Math.min(x, lo)
            if (Math.max(right, x + l.w) - x0 > MAXW) {
                x = right + SP
                x0 = x - 10
                placed = []
                brk = true
            }
        }
        m.x = x
        placed.push(m)
        right = brk || i === 0 ? x + l.w : Math.max(right, x + l.w)
        return {...l, x, brk}
    })
    const end = cs.length ? right + SP : BUSX0,
        q = root?.p
    return {
        circuits,
        end,
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
        if (!cur || c.brk) {
            cur = {from: i, to: i, x0: cur ? c.x - 10 : 0, x1: 0, minY: -120}
            out.push(cur)
        }
        cur.to = i + 1
        cur.x1 = Math.max(cur.x1, c.x + c.w)
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
// `scoped`: number the eendraad sheets and the situatieschema pages separately (as shown in their own tab: Blad 6/6 and Blad 1/1);
// otherwise one continuous numbering over all printed sheets (PDF export).
export function sheetPlan(p, scoped = false) {
    const plan = [
        ...p.een.flatMap((pg) => {
            const b = board(p, pg)
            return slices(b).map((sl) => ({kind: 'een', pg, b, sl}))
        }),
        ...p.sit.map((pg) => ({kind: 'sit', pg})),
    ]
    if (!scoped) return plan.map((e, i) => ({...e, no: i + 1, total: plan.length}))
    const seen = {},
        total = {}
    plan.forEach((e) => (total[e.kind] = (total[e.kind] || 0) + 1))
    return plan.map((e) => ({...e, no: (seen[e.kind] = (seen[e.kind] || 0) + 1), total: total[e.kind]}))
}
// numbering of a page within its own tab
export const numbering = (p, pg) => {
    const e = sheetPlan(p, true).find((x) => x.pg === pg)
    return e ? {no: e.no, total: e.total} : {no: 0, total: 0}
}