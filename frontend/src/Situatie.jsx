// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useRef, useState} from 'react'
import {Sym, typeOf} from './symbols'
import {Sheet} from './Footer'
import ZoomPane from './ZoomPane.jsx'
import {allNodes, nameOf, uid, unplacedOf} from './util'
import {numbering} from './boardModel'
import {dirTo, fmtLen, hitsInBox, itemBox, parseDims, parseLen, r2, rectWalls, scaleOf, suggestScale, toSheet, unionBox, wallBox} from './geometry'

const dflt = {sym: 7, text: 4, door: 10, window: 10}
const BLUE = '#0a6cff'

// length label next to a segment (always upright, left of the direction of travel)
const Dim = ({a, b, sc, color = '#555', off = 3}) => {
    const flip = b.x < a.x || (b.x === a.x && b.y < a.y),
        [p, q] = flip ? [b, a] : [a, b],
        dx = q.x - p.x,
        dy = q.y - p.y,
        L = Math.hypot(dx, dy)
    if (L < 2) return null
    const mx = (p.x + q.x) / 2 + (dy / L) * off,
        my = (p.y + q.y) / 2 - (dx / L) * off
    return (
        <text
            x={mx}
            y={my}
            fontSize="2.4"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={color}
            transform={`rotate(${(Math.atan2(dy, dx) * 180) / Math.PI} ${mx} ${my})`}
            pointerEvents="none"
        >
            {fmtLen(L, sc)}
        </text>
    )
}

export const SitSheet = ({p, pg, no, total, ed, onFooter}) => {
    const nodes = allNodes(p),
        {walls, items} = pg,
        E = ed || {},
        sc = scaleOf(p.footer),
        showDims = pg.dims !== false,
        isSel = (id) => !!ed && E.sel.some((s) => s.id === id)
    return (
        <Sheet p={p} page={no} total={total} onFooter={onFooter} name={'Situatieschema – ' + pg.name} svgRef={E.ref} {...(E.h || {})}>
            {ed && (
                <>
                    <defs>
                        {[
                            ['gMinor', E.snap, Math.min(0.25, E.snap * 0.12), '#8a8a8a'],
                            ['gMajor', Math.max(10, E.snap), 0.35, '#444'],
                        ].map(([id, s, r, c]) => (
                            <pattern key={id} id={id} x={-s / 2} y={-s / 2} width={s} height={s} patternUnits="userSpaceOnUse">
                                <circle cx={s / 2} cy={s / 2} r={r} fill={c} />
                            </pattern>
                        ))}
                    </defs>
                    <rect x="5" y="5" width="287" height="180" fill="url(#gMinor)" />
                    <rect x="5" y="5" width="287" height="180" fill="url(#gMajor)" />
                </>
            )}
            {walls.map((w) => (
                <g key={w.id}>
                    <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#000" strokeWidth="1.6" strokeLinecap="square" />
                    {isSel(w.id) && (
                        <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={BLUE} strokeWidth="2.6" opacity=".4" pointerEvents="none" />
                    )}
                    {ed && (
                        <line {...E.ep('wall', w.id, 'm')} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="transparent" strokeWidth="7" />
                    )}
                    {isSel(w.id) &&
                        E.sel.length === 1 &&
                        [
                            ['a', w.x1, w.y1],
                            ['b', w.x2, w.y2],
                        ].map(([pt, x, y]) => <circle key={pt} {...E.ep('wall', w.id, pt)} cx={x} cy={y} r="1.8" fill={BLUE} />)}
                </g>
            ))}
            {showDims && walls.map((w) => <Dim key={'d' + w.id} a={{x: w.x1, y: w.y1}} b={{x: w.x2, y: w.y2}} sc={sc} />)}
            {items.map((i) => {
                const sz = i.s || i.w || dflt[i.kind],
                    hl = isSel(i.id),
                    g = {...(ed ? E.ep('item', i.id) : {})}
                const hi = hl && (
                    <circle
                        r={Math.max(sz, 8) / 1.5}
                        fill="none"
                        stroke={BLUE}
                        strokeWidth=".4"
                        strokeDasharray="1 1"
                        pointerEvents="none"
                    />
                )
                if (i.kind === 'sym') {
                    const n = nodes.find((n) => n.id === i.node)
                    return (
                        <g key={i.id} {...g}>
                            <g transform={`translate(${i.x},${i.y})`}>
                                {ed && <circle r={Math.max(sz / 2 + 1.5, 4.5)} fill="transparent" />}
                                {hi}
                                <g transform={`rotate(${i.r || 0})`}>
                                    {n ? <Sym shapes={typeOf(p, n.type).shapes} s={sz} /> : <circle r="3" fill="none" stroke="red" />}
                                </g>
                            </g>
                            <text x={i.x} y={i.y + sz / 2 + 2.5} fontSize="2.2" textAnchor="middle">
                                {n ? nameOf(p, n) : '(verwijderd)'}
                            </text>
                        </g>
                    )
                }
                if (i.kind === 'text')
                    return (
                        <g key={i.id} {...g}>
                            <g transform={`rotate(${i.r || 0} ${i.x} ${i.y})`}>
                                {ed && (
                                    <rect
                                        x={i.x - 1}
                                        y={i.y - sz - 1}
                                        width={Math.max(sz, String(i.txt || '').length * sz * 0.55) + 2}
                                        height={sz * 1.3 + 2}
                                        fill="transparent"
                                    />
                                )}
                                <text x={i.x} y={i.y} fontSize={sz}>
                                    {i.txt}
                                </text>
                            </g>
                            {hl && <circle cx={i.x} cy={i.y} r="2" fill="none" stroke={BLUE} />}
                        </g>
                    )
                const w = i.w || 10,
                    h = w / 2
                return (
                    <g
                        key={i.id}
                        {...g}
                        transform={`translate(${i.x},${i.y}) rotate(${i.r || 0}) scale(${i.m ? -1 : 1},${i.f ? -1 : 1})`}
                        stroke="#000"
                        strokeWidth=".4"
                    >
                        {ed && (
                            <rect
                                x={-h - 1}
                                y={i.kind === 'door' ? -w - 1 : -3}
                                width={w + 2}
                                height={i.kind === 'door' ? w + 4 : 6}
                                fill="transparent"
                                stroke="none"
                            />
                        )}
                        {hi}
                        <rect x={-h} y="-1.3" width={w} height="2.6" fill="#fff" stroke="none" />
                        {i.kind === 'door' ? (
                            <>
                                <line x1={-h} y1="0" x2={-h} y2={-w} strokeWidth=".6" />
                                <path d={`M${-h},${-w} A${w},${w} 0 0 1 ${h},0`} fill="none" />
                            </>
                        ) : (
                            <>
                                <line x1={-h} y1="-1" x2={h} y2="-1" />
                                <line x1={-h} y1="1" x2={h} y2="1" />
                            </>
                        )}
                    </g>
                )
            })}
            {E.pend && <circle cx={E.pend.x} cy={E.pend.y} r="1" fill="red" />}
            {E.pend && E.typedEnd && (
                <>
                    {E.tool === 'wall' ? (
                        <>
                            <line x1={E.pend.x} y1={E.pend.y} x2={E.typedEnd.x} y2={E.typedEnd.y} stroke={BLUE} strokeWidth="1.2" opacity=".6" pointerEvents="none" />
                            <Dim a={E.pend} b={E.typedEnd} sc={sc} color={BLUE} />
                        </>
                    ) : (
                        <rect
                            x={Math.min(E.pend.x, E.typedEnd.x)}
                            y={Math.min(E.pend.y, E.typedEnd.y)}
                            width={Math.abs(E.typedEnd.x - E.pend.x)}
                            height={Math.abs(E.typedEnd.y - E.pend.y)}
                            fill="none"
                            stroke={BLUE}
                            strokeWidth="1.2"
                            opacity=".6"
                            pointerEvents="none"
                        />
                    )}
                </>
            )}
            {E.pend && E.cur && E.tool === 'wall' && (
                <>
                    <line
                        x1={E.pend.x}
                        y1={E.pend.y}
                        x2={E.cur.x}
                        y2={E.cur.y}
                        stroke={BLUE}
                        strokeWidth=".6"
                        strokeDasharray="1.5 1"
                        pointerEvents="none"
                    />
                    <Dim a={E.pend} b={E.cur} sc={sc} color={BLUE} />
                </>
            )}
            {E.pend && E.cur && E.tool === 'room' && (
                <>
                    <rect
                        x={Math.min(E.pend.x, E.cur.x)}
                        y={Math.min(E.pend.y, E.cur.y)}
                        width={Math.abs(E.cur.x - E.pend.x)}
                        height={Math.abs(E.cur.y - E.pend.y)}
                        fill="none"
                        stroke={BLUE}
                        strokeWidth=".6"
                        strokeDasharray="1.5 1"
                        pointerEvents="none"
                    />
                    <Dim a={E.pend} b={{x: E.cur.x, y: E.pend.y}} sc={sc} color={BLUE} />
                    <Dim a={E.pend} b={{x: E.pend.x, y: E.cur.y}} sc={sc} color={BLUE} />
                </>
            )}
            {E.cur && (
                <g pointerEvents="none" stroke={BLUE} strokeWidth=".35" fill="none">
                    <circle cx={E.cur.x} cy={E.cur.y} r="1.4" />
                    <line x1={E.cur.x - 2.6} y1={E.cur.y} x2={E.cur.x + 2.6} y2={E.cur.y} />
                    <line x1={E.cur.x} y1={E.cur.y - 2.6} x2={E.cur.x} y2={E.cur.y + 2.6} />
                </g>
            )}
            {E.box && (
                <rect
                    x={Math.min(E.box.a.x, E.box.b.x)}
                    y={Math.min(E.box.a.y, E.box.b.y)}
                    width={Math.abs(E.box.b.x - E.box.a.x)}
                    height={Math.abs(E.box.b.y - E.box.a.y)}
                    fill={BLUE}
                    fillOpacity=".08"
                    stroke={BLUE}
                    strokeWidth=".4"
                    strokeDasharray="1.5 1"
                    pointerEvents="none"
                />
            )}
            {E.del && (
                <g
                    role="button"
                    aria-label="Verwijder selectie"
                    transform={`translate(${E.del.x},${E.del.y})`}
                    style={{cursor: 'pointer'}}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation()
                        E.del.onClick()
                    }}
                >
                    <title>Verwijder (Del)</title>
                    <circle r="3.2" fill="#fff" stroke="#c62828" strokeWidth=".5" />
                    <path
                        d="M-1.5,-1.3 H1.5 M-.7,-1.3 V-2 H.7 V-1.3 M-1.2,-.7 L-.95,2.1 H.95 L1.2,-.7"
                        fill="none"
                        stroke="#c62828"
                        strokeWidth=".35"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </g>
            )}
        </Sheet>
    )
}
export const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4]
export default function Situatie({p, setP, idx, onFooter}) {
    const pg = p.sit[idx],
        {walls, items} = pg,
        [tool, setTool] = useState('select'),
        [node, setNode] = useState(null),
        [pend, setPend] = useState(null),
        [snap, setSnap] = useState(5),
        [free, setFree] = useState(false),
        [zoom, setZoom] = useState(1),
        [cur, setCur] = useState(null),
        [sel, setSel] = useState([]),
        [drag, setDrag] = useState(null),
        [box, setBox] = useState(null),
        [dimText, setDimText] = useState(''),
        [, bump] = useState(0),
        [panelOpen, setPanelOpen] = useState(true),
        ref = useRef(),
        dimRef = useRef(),
        justBoxed = useRef(false),
        aim = useRef(null) // last cursor position while drawing: survives the mouse leaving the sheet, gives the direction of a typed length
    const sc = scaleOf(p.footer),
        showDims = pg.dims !== false
    const setPg = (patch) => setP({...p, sit: p.sit.map((g, i) => (i === idx ? {...g, ...patch} : g))})
    const nodes = allNodes(p),
        unplaced = unplacedOf(p),
        placed = pg.items.filter((i) => i.kind === 'sym').length
    const raw = (e) => {
        const s = ref.current,
            m = s.createSVGPoint()
        m.x = e.clientX
        m.y = e.clientY
        return m.matrixTransform(s.getScreenCTM().inverse())
    }
    const sn = (v) => (free ? Math.round(v * 10) / 10 : Math.round(v / snap) * snap)
    const pt = (e) => {
        const r = raw(e)
        return {x: sn(r.x), y: sn(r.y)}
    }
    const nearest = (q) => {
        let b = {d: 1e9, r: 0}
        walls.forEach((w) => {
            const dx = w.x2 - w.x1,
                dy = w.y2 - w.y1,
                t = Math.max(0, Math.min(1, ((q.x - w.x1) * dx + (q.y - w.y1) * dy) / (dx * dx + dy * dy || 1))),
                d = Math.hypot(w.x1 + t * dx - q.x, w.y1 + t * dy - q.y)
            if (d < b.d) b = {d, r: (Math.atan2(dy, dx) * 180) / Math.PI, x: w.x1 + t * dx, y: w.y1 + t * dy}
        })
        return b
    }
    const ids = new Set(sel.map((s) => s.id))
    const del = (k, id) => setPg(k === 'wall' ? {walls: walls.filter((w) => w.id !== id)} : {items: items.filter((i) => i.id !== id)})
    const removeSel = () => {
        if (!sel.length) return
        setPg({walls: walls.filter((w) => !ids.has(w.id)), items: items.filter((i) => !ids.has(i.id))})
        setSel([])
    }
    const shiftOne = (k, id, dx, dy) =>
        k === 'wall'
            ? setPg({walls: walls.map((w) => (w.id !== id ? w : {...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy}))})
            : setPg({
                  items: items.map((i) => {
                      if (i.id !== id) return i
                      const t = {x: i.x + dx, y: i.y + dy}
                      if (i.kind === 'door' || i.kind === 'window') {
                          const n = nearest(t)
                          if (n.d < 8) return {...i, x: n.x, y: n.y, r: n.r}
                      }
                      return {...i, ...t}
                  }),
              })
    const moveSel = (dx, dy) =>
        sel.length === 1
            ? shiftOne(sel[0].k, sel[0].id, dx, dy)
            : setPg({
                  walls: walls.map((w) => (ids.has(w.id) ? {...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy} : w)),
                  items: items.map((i) => (ids.has(i.id) ? {...i, x: i.x + dx, y: i.y + dy} : i)),
              })
    const rotateSel = (deg) => setPg({items: items.map((i) => (ids.has(i.id) ? {...i, r: (i.r || 0) + deg} : i))})
    const duplicateSel = () => {
        const nw = walls
                .filter((w) => ids.has(w.id))
                .map((w) => ({...w, id: uid(), x1: w.x1 + 5, y1: w.y1 + 5, x2: w.x2 + 5, y2: w.y2 + 5})),
            ni = items.filter((i) => ids.has(i.id)).map((i) => ({...i, id: uid(), x: i.x + 5, y: i.y + 5}))
        setPg({walls: [...walls, ...nw], items: [...items, ...ni]})
        setSel([...nw.map((w) => ({k: 'wall', id: w.id})), ...ni.map((i) => ({k: 'item', id: i.id}))])
    }
    const ep = (k, id, part = 'm') => ({
        onPointerDown: (e) => {
            if (tool !== 'select') return
            e.stopPropagation()
            const inSel = sel.some((s) => s.id === id)
            if (e.shiftKey && part === 'm') return setSel(inSel ? sel.filter((s) => s.id !== id) : [...sel, {k, id}])
            const ns = inSel && part === 'm' ? sel : [{k, id}],
                origs = {}
            if (ns !== sel) setSel(ns)
            ns.forEach((s) => (origs[s.id] = (s.k === 'wall' ? walls : items).find((x) => x.id === s.id)))
            setDrag({k, id, part, start: raw(e), orig: origs[id], origs, single: ns.length === 1})
        },
        onClick: (e) => {
            if (tool === 'select') e.stopPropagation()
            else if (tool === 'erase') {
                e.stopPropagation()
                del(k, id)
            }
        },
        style: {cursor: tool === 'select' ? 'move' : tool === 'erase' ? 'not-allowed' : undefined},
    })
    const addRoom = (a, b) => setPg({walls: [...walls, ...rectWalls(a, b).map((w) => ({id: uid(), ...w}))]})
    const click = (e) => {
        if (justBoxed.current) {
            justBoxed.current = false
            return
        }
        const q = pt(e)
        if (q.y > 180) return
        if (tool === 'select') setSel([])
        else if (tool === 'wall') {
            if (!pend) setPend(q)
            else if (pend.x === q.x && pend.y === q.y) setPend(null)
            else {
                setPg({walls: [...walls, {id: uid(), x1: pend.x, y1: pend.y, x2: q.x, y2: q.y}]})
                setPend(q)
            }
        } else if (tool === 'room') {
            if (!pend) setPend(q)
            else {
                if (pend.x !== q.x && pend.y !== q.y) addRoom(pend, q)
                setPend(null)
            }
        } else if (tool === 'door' || tool === 'window') {
            const n = nearest(q),
                on = n.d < 8
            setPg({items: [...items, {id: uid(), kind: tool, x: on ? n.x : q.x, y: on ? n.y : q.y, r: on ? n.r : 0, w: 10}]})
        } else if (tool === 'sym' && node) setPg({items: [...items, {id: uid(), kind: 'sym', node, x: q.x, y: q.y, r: 0, s: 7}]})
        else if (tool === 'text') {
            const t = prompt('Tekst')
            t && setPg({items: [...items, {id: uid(), kind: 'text', x: q.x, y: q.y, txt: t, s: 4, r: 0}]})
        }
    }
    const dragTo = (d, r) => {
        const dx = r.x - d.start.x,
            dy = r.y - d.start.y,
            o = d.orig
        if (d.part === 'a' || d.part === 'b') {
            const k = d.part === 'a' ? ['x1', 'y1'] : ['x2', 'y2']
            return setPg({walls: walls.map((w) => (w.id !== d.id ? w : {...w, [k[0]]: sn(r.x), [k[1]]: sn(r.y)}))})
        }
        const rx = d.k === 'wall' ? o.x1 : o.x,
            ry = d.k === 'wall' ? o.y1 : o.y,
            mx = sn(rx + dx) - rx,
            my = sn(ry + dy) - ry
        setPg({
            walls: walls.map((w) => {
                const q = d.origs[w.id]
                return q ? {...w, x1: r2(q.x1 + mx), y1: r2(q.y1 + my), x2: r2(q.x2 + mx), y2: r2(q.y2 + my)} : w
            }),
            items: items.map((i) => {
                const q = d.origs[i.id]
                if (!q) return i
                const t = {x: r2(q.x + mx), y: r2(q.y + my)}
                if (d.single && (i.kind === 'door' || i.kind === 'window')) {
                    const n = nearest(t)
                    if (n.d < 8) return {...i, x: n.x, y: n.y, r: n.r}
                }
                return {...i, ...t}
            }),
        })
    }
    const pm = (e) => {
        if (box) return setBox({...box, b: raw(e)})
        if (drag) return dragTo(drag, raw(e))
        if (tool !== 'select' && tool !== 'erase') {
            const c = pt(e)
            aim.current = c
            if (!cur || cur.x !== c.x || cur.y !== c.y) setCur(c)
        }
    }
    const startBox = (e) => {
        justBoxed.current = false
        if (tool !== 'select' || e.button === 2) return
        const r = raw(e)
        if (r.y <= 185) setBox({a: r, b: r, add: e.shiftKey})
    }
    const finishBox = () => {
        if (!box) return
        const r = {
            x0: Math.min(box.a.x, box.b.x),
            y0: Math.min(box.a.y, box.b.y),
            x1: Math.max(box.a.x, box.b.x),
            y1: Math.max(box.a.y, box.b.y),
        }
        setBox(null)
        if (r.x1 - r.x0 < 1.5 && r.y1 - r.y0 < 1.5) return
        justBoxed.current = true
        const hits = hitsInBox(r, walls, items)
        setSel(box.add ? [...sel, ...hits.filter((h) => !ids.has(h.id))] : hits)
    }
    const reset = () => {
        setPend(null)
        setCur(null)
        setBox(null)
        setDimText('')
        aim.current = null
    }
    // typed dimensions while drawing: a wall length, or "width x height" for a room (metres unless a unit is typed).
    // The direction comes from the last known cursor position (kept while the mouse is over the input).
    const onSheet = (q) => q.x >= 0 && q.x <= 297 && q.y >= 0 && q.y <= 185
    const typed = (() => {
        if (!pend) return null
        if (tool === 'wall') {
            const m = parseLen(dimText),
                len = m != null ? toSheet(m, sc) : null
            if (!len) return null
            const u = dirTo(pend, aim.current || {x: pend.x + 1, y: pend.y})
            return {end: {x: r2(pend.x + u.x * len), y: r2(pend.y + u.y * len)}}
        }
        if (tool === 'room') {
            const d = parseDims(dimText),
                w = d && toSheet(d.w, sc),
                h = d && toSheet(d.h, sc)
            if (!w || !h) return null
            return {end: {x: r2(pend.x + (aim.current && aim.current.x < pend.x ? -w : w)), y: r2(pend.y + (aim.current && aim.current.y < pend.y ? -h : h))}}
        }
        return null
    })()
    const parsed = tool === 'room' ? !!parseDims(dimText) : parseLen(dimText) != null
    const needM = tool === 'room' ? Math.max(parseDims(dimText)?.w ?? 0, parseDims(dimText)?.h ?? 0) : (parseLen(dimText) ?? 0),
        bigger = parsed ? suggestScale(needM, sc) : null
    const dimValid = parsed && !!typed && onSheet(typed.end)
    const dimErr = !dimText ? '' : !parsed ? 'Ongeldige waarde' : !typed || bigger ? 'Past niet op het blad bij 1:' + sc : !onSheet(typed.end) ? 'Valt buiten het blad: richt de muis anders' : ''
    const commitDim = () => {
        if (!pend || !dimValid) return
        if (tool === 'wall') {
            setPg({walls: [...walls, {id: uid(), x1: pend.x, y1: pend.y, x2: typed.end.x, y2: typed.end.y}]})
            setPend(typed.end)
            setDimText('')
        } else if (tool === 'room') {
            addRoom(pend, typed.end)
            reset()
        }
    }
    useEffect(() => {
        if (pend && dimRef.current) dimRef.current.focus()
    }, [pend])
    const one = sel.length === 1 ? sel[0] : null,
        it = one?.k === 'item' && items.find((i) => i.id === one.id),
        wl = one?.k === 'wall' && walls.find((w) => w.id === one.id)
    const upI = (patch) => setPg({items: items.map((i) => (i.id === it.id ? {...i, ...patch} : i))})
    const setWallLen = (text) => {
        const m = parseLen(text),
            len = m != null ? toSheet(m, sc) : null
        if (!len) return
        const u = dirTo({x: wl.x1, y: wl.y1}, {x: wl.x2, y: wl.y2}),
            x2 = r2(wl.x1 + u.x * len),
            y2 = r2(wl.y1 + u.y * len)
        if (x2 !== wl.x2 || y2 !== wl.y2) setPg({walls: walls.map((w) => (w.id === wl.id ? {...w, x2, y2} : w))})
    }
    const setWidth = (text) => {
        const m = parseLen(text),
            w = m != null ? toSheet(m, sc) : null
        if (w && Math.abs(w - (it.w || 10)) > 0.005) upI({w: r2(w)})
    }
    useEffect(() => {
        const f = (e) => {
            if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !sel.length) return
            const d = {ArrowLeft: [-snap, 0], ArrowRight: [snap, 0], ArrowUp: [0, -snap], ArrowDown: [0, snap]}[e.key]
            if (e.key === 'Delete' || e.key === 'Backspace') {
                removeSel()
                e.preventDefault()
            } else if (d) {
                moveSel(...d)
                e.preventDefault()
            } else if (e.key === 'r') rotateSel(15)
        }
        addEventListener('keydown', f)
        return () => removeEventListener('keydown', f)
    })
    const auto = () =>
        setPg({
            items: [
                ...items,
                ...unplaced.map((n, i) => ({
                    id: uid(),
                    kind: 'sym',
                    node: n.id,
                    x: 15 + (i % 26) * 10,
                    y: 170 - Math.floor(i / 26) * 12,
                    r: 0,
                    s: 7,
                })),
            ],
        })
    const Tool = ({k, l}) => (
        <button
            className={tool === k ? 'on' : ''}
            onClick={() => {
                setTool(k)
                reset()
            }}
        >
            {l}
        </button>
    )
    const sk = it && (it.kind === 'sym' || it.kind === 'text' ? 's' : 'w'),
        [mn, mx] = it?.kind === 'text' ? [2, 12] : it?.kind === 'sym' ? [4, 20] : [6, 20]
    const selBox = unionBox([...walls.filter((w) => ids.has(w.id)).map(wallBox), ...items.filter((i) => ids.has(i.id)).map(itemBox)])
    const ed = {
        ref,
        sel,
        ep,
        pend,
        typedEnd: dimValid ? typed.end : null,
        snap,
        tool,
        box,
        cur: tool === 'select' || tool === 'erase' ? null : cur,
        del:
            tool === 'select' && selBox && !drag && !box
                ? {x: Math.min(289, selBox.x1 + 3), y: Math.max(8, selBox.y0 - 3), onClick: removeSel}
                : null,
        h: {
            onClick: click,
            onPointerDown: startBox,
            onPointerMove: pm,
            onPointerUp: () => {
                setDrag(null)
                finishBox()
            },
            onPointerLeave: () => {
                setDrag(null)
                setCur(null)
                setBox(null)
            },
            onContextMenu: (e) => {
                e.preventDefault()
                reset()
                setTool('select')
            },
            style: {touchAction: 'none'},
        },
    }
    const lenKey = (w) => `${w.id}:${w.x1},${w.y1},${w.x2},${w.y2}`
    return (
        <div className="row">
            <div className="side ui">
                <div className="tb">
                    <Tool k="select" l="Selecteer" />
                    <Tool k="wall" l="Muur" />
                    <Tool k="room" l="Kamer" />
                    <Tool k="door" l="Deur" />
                    <Tool k="window" l="Raam" />
                    <Tool k="sym" l="Symbool" />
                    <Tool k="text" l="Tekst" />
                    <Tool k="erase" l="Wis" />
                </div>
                <p>
                    Muur: klik punten, klik zelfde punt om te stoppen; typ de lengte en druk Enter. Rechtsklik: terug naar Selecteer.
                    Selecteer: sleep een kader (Shift = toevoegen), pijltjes, Del, R. Raster, vrij tekenen, maten en zoom: in de tekening.
                </p>
                {it && (
                    <div className="warn">
                        <b>Geselecteerd: {it.kind}</b>
                        <div className="tb">
                            <button onClick={() => upI({r: (it.r || 0) - 15})}>⟲15°</button>
                            <button onClick={() => upI({r: (it.r || 0) + 15})}>⟳15°</button>
                            <button onClick={() => upI({r: (it.r || 0) + 90})}>⟳90°</button>
                        </div>
                        <label>
                            Grootte{' '}
                            <input
                                type="range"
                                min={mn}
                                max={mx}
                                step=".5"
                                value={it[sk] || dflt[it.kind]}
                                onChange={(e) => upI({[sk]: +e.target.value})}
                            />
                        </label>
                        {(it.kind === 'door' || it.kind === 'window') && (
                            <>
                                <div className="tb">
                                    <button onClick={() => upI({f: !it.f})}>⇅ spiegel</button>
                                    <button onClick={() => upI({m: !it.m})}>⇄ spiegel</button>
                                </div>
                                <label>
                                    Breedte{' '}
                                    <input
                                        key={`${it.id}:${it.w}`}
                                        defaultValue={fmtLen(it.w || 10, sc)}
                                        onKeyDown={(e) => e.key === 'Enter' && setWidth(e.target.value)}
                                        onBlur={(e) => setWidth(e.target.value)}
                                        style={{width: 80}}
                                    />
                                </label>
                            </>
                        )}
                        {it.kind === 'text' && <input value={it.txt} onChange={(e) => upI({txt: e.target.value})} />}
                        <div className="tb">
                            <button onClick={duplicateSel}>⧉</button>
                        </div>
                    </div>
                )}
                {wl && (
                    <div className="warn">
                        <b>Muur</b>
                        <label>
                            Lengte{' '}
                            <input
                                key={lenKey(wl)}
                                defaultValue={fmtLen(Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1), sc)}
                                onKeyDown={(e) => e.key === 'Enter' && setWallLen(e.target.value)}
                                onBlur={(e) => setWallLen(e.target.value)}
                                style={{width: 80}}
                            />
                        </label>
                    </div>
                )}
                {sel.length > 1 && (
                    <div className="warn">
                        <b>{sel.length} elementen geselecteerd</b>
                        <div className="tb">
                            <button onClick={() => rotateSel(-15)}>⟲15°</button>
                            <button onClick={() => rotateSel(15)}>⟳15°</button>
                            <button onClick={duplicateSel}>⧉</button>
                        </div>
                    </div>
                )}
                <div className="pal">
                    <b>Componenten ({placed} op dit blad)</b>
                    <div className="pallist">
                    {nodes.map((n) => (
                        <button
                            key={n.id}
                            style={{background: node === n.id ? '#cfe3ff' : ''}}
                            onClick={() => {
                                setNode(n.id)
                                setTool('sym')
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20">
                                <Sym shapes={typeOf(p, n.type).shapes} x={10} y={10} s={18} />
                            </svg>
                            {unplaced.includes(n) ? '⚠' : '✓'} {nameOf(p, n)}
                        </button>
                    ))}
                </div>
                </div>
            </div>
            <div className="main">
                <div style={{position: 'relative', maxWidth: panelOpen ? 1100 : 1480}}>
                    <ZoomPane zoom={zoom} rightPan>
                        <div style={{width: `${zoom * 100}%`}}>
                            <SitSheet p={p} pg={pg} {...numbering(p, pg)} ed={ed} onFooter={onFooter} />
                        </div>
                    </ZoomPane>
                    <div className="ui zoomctl">
                        <button
                            className={showDims ? 'on' : ''}
                            aria-pressed={showDims}
                            title="Maten tonen/verbergen"
                            onClick={() => setPg({dims: !showDims})}
                        >
                            📏 Maten
                        </button>
                        <button
                            title="Uitzoomen"
                            disabled={zoom <= ZOOMS[0]}
                            onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)])}
                        >
                            −
                        </button>
                        <button title="Zoom terugzetten (100%)" onClick={() => setZoom(1)}>
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            title="Inzoomen"
                            disabled={zoom >= ZOOMS.at(-1)}
                            onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)])}
                        >
                            +
                        </button>
                    </div>
                    {pend && (tool === 'wall' || tool === 'room') && (
                        <div className="ui dimbox">
                            <label>
                                {tool === 'room' ? 'Breedte x hoogte' : 'Lengte'}{' '}
                                <input
                                    ref={dimRef}
                                    className={dimText && !dimValid ? 'bad' : ''}
                                    title={dimErr}
                                    value={dimText}
                                    placeholder={tool === 'room' ? 'bv. 4x3,5 (m)' : 'bv. 3,5 of 350cm'}
                                    aria-description="Pijltjestoetsen kiezen de richting"
                                    onChange={(e) => setDimText(e.target.value)}
                                    onKeyDown={(e) => {
                                        const dir = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[e.key]
                                        if (e.key === 'Enter') commitDim()
                                        else if (e.key === 'Escape') reset()
                                        else if (dir) {
                                            // arrow keys choose the direction of the typed length
                                            e.preventDefault()
                                            aim.current = {x: pend.x + dir[0], y: pend.y + dir[1]}
                                            bump((n) => n + 1)
                                        }
                                    }}
                                />
                            </label>{' '}
                            <button onClick={commitDim}>OK</button>
                            {bigger && (
                                <button onClick={() => setP({...p, footer: {...p.footer, schaal: '1:' + bigger}})}>Schaal 1:{bigger}</button>
                            )}
                            <div>
                                {dimErr ? <span className="dimerr"> {dimErr}</span> : <span className="dimhint"> ←↑↓→ richting</span>}
                            </div>
                        </div>
                    )}
                    <div className="ui gridsel" style={zoom === 1 ? undefined : {bottom: 12}}>
                        <label>
                            Raster{' '}
                            <select value={snap} onChange={(e) => setSnap(+e.target.value)}>
                                {[1, 2.5, 5, 10].map((v) => (
                                    <option key={v} value={v}>
                                        {v} mm
                                    </option>
                                ))}
                            </select>
                        </label>{' '}
                        <label>
                            <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> Vrij tekenen
                        </label>
                    </div>
                </div>
            </div>
            <div className={'rightpanel ui' + (panelOpen ? '' : ' closed')}>
                <button
                    className="paneltoggle"
                    aria-label={panelOpen ? 'Nergens geplaatst inklappen' : 'Nergens geplaatst openen'}
                    title={panelOpen ? 'Inklappen' : `Nergens geplaatst openen (${unplaced.length})`}
                    onClick={() => setPanelOpen((o) => !o)}
                >
                    {panelOpen ? '>' : '<'}
                    {!panelOpen && unplaced.length > 0 && <span className="badge">{unplaced.length}</span>}
                </button>
                {panelOpen &&
                    (unplaced.length ? (
                        <div className="warn">
                            ⚠ Nergens geplaatst ({unplaced.length}):
                            <ul>
                                {unplaced.map((n) => (
                                    <li key={n.id}>{nameOf(p, n)}</li>
                                ))}
                            </ul>
                            <button onClick={auto}>Plaats ontbrekende op dit blad</button>
                        </div>
                    ) : (
                        <div className="ok">✓ Alle componenten geplaatst</div>
                    ))}
            </div>
        </div>
    )
}
