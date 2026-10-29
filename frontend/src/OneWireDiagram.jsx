// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useRef, useState} from 'react'
import {allTypes, EMPTY_TYPE, shapesOf, stackOf, Sym, typeOf} from './symbols'
import {BoardSheet} from './Board.jsx'
import {defaultProps, detailLines, hasPlacement, infoOf, nextLetter, PLAATSING, sheetPlan} from './boardModel.jsx'
import {flat, nameOf, reid, uid} from './util.jsx'
import {addSibling, circuitOf, emptyChoices, insertAt, insertTypes, parentOf, siblingTypes} from './insertion.js'
import {ZOOMS} from './SituationSchema.jsx'
import ZoomPane from "./ZoomPane.jsx";

export const upd = (ns, id, f) => ns.flatMap((n) => (n.id === id ? f(n) : [{...n, children: upd(n.children, id, f)}]))
export const find = (ns, id) => {
    for (const n of ns) {
        if (n.id === id) return n
        const r = find(n.children, id)
        if (r) return r
    }
}
export const mv = (ns, id, d) => {
    const i = ns.findIndex((n) => n.id === id)
    if (i < 0) return ns.map((n) => ({...n, children: mv(n.children, id, d)}))
    const j = i + d
    if (j < 0 || j >= ns.length) return ns
    const a = [...ns]
    ;[a[i], a[j]] = [a[j], a[i]]
    return a
}
export const indent = (ns, id) => {
    const i = ns.findIndex((n) => n.id === id)
    if (i < 0) return ns.map((n) => ({...n, children: indent(n.children, id)}))
    if (!i) return ns
    const a = [...ns],
        [x] = a.splice(i, 1)
    a[i - 1] = {...a[i - 1], children: [...a[i - 1].children, x]}
    return a
}
export const outdent = (ns, id) =>
    ns.flatMap((n) => {
        const c = n.children.find((x) => x.id === id)
        return c ? [{...n, children: n.children.filter((x) => x !== c)}, c] : [{
            ...n,
            children: outdent(n.children, id)
        }]
    })
// rotation step (degrees) of the turn buttons; an element can be turned a full 360 degrees in both directions
export const ROT_STEP = 15
export const rotate = (ns, id, deg) =>
    upd(ns, id, (x) => [{...x, r: (((x.r || 0) + deg) % 360 + 360) % 360}])
// small line icons for the toolbar buttons (stroke follows the text colour)
const Ico = ({children}) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round"
         strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
)
const ICONS = {
    // move to an earlier / later position among the elements of the same group
    earlier: <Ico>
        <path d="M12 19V5"/>
        <path d="M5 12l7-7 7 7"/>
    </Ico>,
    later: <Ico>
        <path d="M12 5v14"/>
        <path d="M19 12l-7 7-7-7"/>
    </Ico>,
    // one level up (out of its group) / one level down (into the previous element)
    outdent: <Ico>
        <path d="M21 6H11"/>
        <path d="M21 12h-6"/>
        <path d="M21 18H11"/>
        <path d="M7 8l-4 4 4 4"/>
    </Ico>,
    indent: <Ico>
        <path d="M21 6H11"/>
        <path d="M21 12h-6"/>
        <path d="M21 18H11"/>
        <path d="M3 8l4 4-4 4"/>
    </Ico>,
    ccw: <Ico>
        <path d="M3 12a9 9 0 1 0 3-6.7"/>
        <path d="M3 4v5h5"/>
    </Ico>,
    trash: <Ico>
        <path d="M3 6h18"/>
        <path d="M8 6V4h8v2"/>
        <path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6"/>
        <path d="M14 11v6"/>
    </Ico>,
    cw: <Ico>
        <path d="M21 12a9 9 0 1 1-3-6.7"/>
        <path d="M21 4v5h-5"/>
    </Ico>,
    // insert an empty symbol before / after the selected one: a box (the symbol) with a plus at the side where the new one comes
    before: <Ico>
        <rect x="13" y="6" width="8" height="12" rx="1"/>
        <path d="M3 12h7"/>
        <path d="M6.5 8.5v7"/>
    </Ico>,
    after: <Ico>
        <rect x="3" y="6" width="8" height="12" rx="1"/>
        <path d="M14 12h7"/>
        <path d="M17.5 8.5v7"/>
    </Ico>,
    // the next branch: a stem with the existing branch (a box) below and a plus on the new branch above it
    branch: <Ico>
        <path d="M5 3v18"/>
        <path d="M5 18h5"/>
        <rect x="10" y="15" width="9" height="6" rx="1"/>
        <path d="M5 7h5"/>
        <path d="M14.5 4v6"/>
        <path d="M11.5 7h6"/>
    </Ico>,
}
// id of the element that is drawn (in blue) while a symbol from the palette is dragged over the drawing
const GHOST = '~ghost~'
// ids of the ancestors of a node (to unfold them when the node gets selected)
const ancestorsOf = (ns, id, acc = []) => {
    for (const n of ns) {
        if (n.id === id) return acc
        const r = ancestorsOf(n.children, id, [...acc, n.id])
        if (r) return r
    }
}
// markers in the Opbouw list: 'main' = arrow of a main level (distribution part) under its parent, open/closed = fold state
const Mark = ({kind}) => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor" stroke="none">
        {kind === 'main' && (
            <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2v7h7"/>
                <path d="M7.5 5.5L10.5 9l-3 3.5"/>
            </g>
        )}
        {kind === 'open' && <path d="M3 5l4 5 4-5z"/>}
        {kind === 'closed' && <path d="M5 3l5 4-5 4z"/>}
    </svg>
)
const DIST = ['aansluiting', 'teller', 'hoofdschakelaar', 'bord', 'diff', 'kring', 'domotica', 'subbord']
// optional 3rd entry = max number of characters of a short field: it is drawn on one line with its label, as wide as its content,
// and consecutive short fields are stacked in one block with aligned inputs (Polen is one digit, Curve one letter, Beveiliging at most 9999 A)
const FIELDS = {
    kring: [
        ['tekst', 'Naam (tekst)'],
        ['polen', 'Polen', 1],
        ['amp', 'Beveiliging (A)', 4],
        ['curve', 'Curve', 1],
        ['kabel', 'Kabel'],
        ['plaatsing', 'Plaatsing'],
        ['kortsl', 'Kortsluitvermogen (kA)'],
    ],
    aansluiting: [
        ['polen', 'Polen', 1],
        ['amp', 'Beveiliging (A)', 4],
        ['delta', 'Differentieel (mA)'],
        ['diffType', 'Type'],
        ['kabel', 'Kabel na teller'],
        ['kortsl', 'Kortsluitvermogen (kA)'],
    ],
}
// a circuit that is protected by a differentieel has Δ mA and Type instead of the curve
const kringFields = (q) =>
    q?.bescherming === 'differentieel'
        ? FIELDS.kring.flatMap((f) => (f[0] === 'curve' ? [['delta', 'Differentieel (mA)', 4], ['diffType', 'Type', 2]] : [f]))
        : FIELDS.kring
const OTHER = [
    ['aantal', 'Aantal (x)'],
    ['nr', 'Nr'],
]
// Centers an element in the part of the screen that is really visible: scrolls its own scroll containers (zoomed drawing),
// then the page, leaving out the sticky check popup (.verify) that covers the top of the screen.
function centerInView(el) {
    if (!el) return
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a)
        if (/(auto|scroll)/.test(o.overflowY + o.overflowX) && (a.scrollHeight > a.clientHeight || a.scrollWidth > a.clientWidth)) {
            const r = el.getBoundingClientRect(),
                c = a.getBoundingClientRect()
            a.scrollTo({
                left: a.scrollLeft + (r.left + r.width / 2) - (c.left + c.width / 2),
                top: a.scrollTop + (r.top + r.height / 2) - (c.top + c.height / 2),
                behavior: 'instant',
            })
        }
    }
    const pop = document.querySelector('.verify'),
        top = pop ? Math.max(0, pop.getBoundingClientRect().bottom) : 0,
        r = el.getBoundingClientRect(),
        mid = top + (innerHeight - top) / 2
    scrollBy({top: r.top + r.height / 2 - mid, behavior: 'smooth'})
}
export default function OneWireDiagram({p, setP, idx, focus, onFocused, onFooter}) {
    const pg = p.een[idx],
        tree = pg.tree,
        T = allTypes(p),
        [sel, setSel] = useState(null),
        [free, setFree] = useState(false),
        [q, setQ] = useState(''),
        [zoom, setZoom] = useState(1),
        [folded, setFolded] = useState(() => new Set()),
        // drag & drop from the palette: the symbol type that is being dragged and where it would land ({id, mode: 'before' | 'after', no: sheet})
        [dragT, setDragT] = useState(null),
        [drop, setDrop] = useState(null),
        drawing = useRef(null)
    // a focus (e.g. the message of a check): select the element and scroll the drawing to it (when it is drawn on this sheet), then report it as handled
    useEffect(() => {
        if (!focus) return
        setSel(focus.id)
        const find = () => drawing.current?.querySelector(`[data-nid="${String(focus.id).replace(/["\\]/g, '\\$&')}"]`)
        if (find()) {
            // wait until the selection has changed the layout, otherwise the scroll target moves while scrolling
            // (no cleanup: onFocused() resets the focus at once, which would cancel this timer)
            setTimeout(() => centerInView(find()), 50)
        }
        onFocused?.()
    }, [focus])
    const unfold = (ids) => setFolded((f) => (ids.some((i) => f.has(i)) ? new Set([...f].filter((i) => !ids.includes(i))) : f))
    // a selected element (e.g. clicked in the drawing) is never hidden inside a folded level
    useEffect(() => {
        if (sel) unfold(ancestorsOf(tree, sel) || [])
    }, [sel])
    const set = (t) => setP({...p, een: p.een.map((g, i) => (i === idx ? {...g, tree: t} : g))}),
        s = sel && find(tree, sel)
    const remove = () => {
        if (s) {
            set(upd(tree, s.id, () => []))
            setSel(null)
        }
    }
    useEffect(() => {
        const f = (e) => {
            if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !s) return
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault()
                remove()
            }
        }
        addEventListener('keydown', f)
        return () => removeEventListener('keydown', f)
    })
    const all = flat(tree)
    const parentFor = (t) => {
        if (s && (free || t.parents.includes(s.type)) && !(t.k === 'kring' && s.type === 'kring')) return s
        for (const pt of t.parents) {
            const m = all.filter((n) => n.type === pt)
            if (m.length) return m.at(-1)
        }
        return null
    }
    const tp = (k) => typeOf(p, k)
    // a new element of the given symbol type (a circuit gets the next free letter, a distribution part its default properties; the text of any other element starts empty)
    const mk = (t) => {
        const n = {id: uid(), type: t.k, label: t.k === 'kring' ? nextLetter(tree) : '', info: '', children: []},
            dp = defaultProps(t.k)
        if (dp) {
            n.p = {...dp}
            if (t.k === 'kring') n.info = infoOf(n.p)
        }
        return n
    }
    const add = (t) => {
        const n = mk(t)
        if (!t.parents.length) return set([...tree, n])
        const par = parentFor(t)
        if (!par) {
            if (free && !s) return set([...tree, n])
            return alert(
                s
                    ? `'${t.name}' kan enkel onder: ${t.parents.map((k) => typeOf(p, k).name).join(', ')}. (Of vink \"Vrije hiërarchie\" aan.)`
                    : 'Selecteer eerst een element waaronder dit past.',
            )
        }
        set(upd(tree, par.id, (x) => [{...x, children: [...x.children, n]}]))
        unfold([par.id])
        if (DIST.includes(t.k)) setSel(n.id)
    }
    // insert a symbol type before / after the element `id` and select it
    // dropped from the palette: a differentieel makes a new circuit (a kring) that is protected by a differentieel, just like an automaat makes a circuit
    const mkDrop = (t) => {
        if (t.k !== 'diff') return mk(t)
        const n = mk(tp('kring')),
            q = {...n.p, bescherming: 'differentieel', amp: 25, curve: '', delta: 30, diffType: 'A', kortsl: ''}
        return {...n, p: q, info: infoOf(q)}
    }
    const insertSym = (id, mode, t) => {
        const n = mkDrop(t)
        set(insertAt(tree, id, mode, n))
        unfold([id])
        setSel(n.id)
    }
    // the buttons in Eigenschappen: insert an empty element (type 'leeg') before / after the selected one; its Type dropdown lists what fits there
    // mode 'branch' = the next branch: a new element next to the selected one under the same parent (B1 -> B2), drawn above it
    const insertEmpty = (mode) => {
        if (!s) return
        const n = {id: uid(), type: EMPTY_TYPE.k, label: '', info: '', children: []}
        set(mode === 'branch' ? addSibling(tree, s.id, n) : insertAt(tree, s.id, mode, n))
        unfold([s.id])
        setSel(n.id)
    }
    const setProp = (k, v) =>
        set(
            upd(tree, s.id, (x) => {
                const np = {...x.p, [k]: v}
                return [{...x, p: np, ...(x.type === 'kring' ? {info: infoOf(np)} : {})}]
            }),
        )
    // change the type of the selected element; the name follows when it was still the default one
    const changeType = (k) =>
        set(
            upd(tree, s.id, (x) => {
                const old = typeOf(p, x.type),
                    nu = typeOf(p, k)
                // an empty element becomes a real one: it gets the default properties of a new element of that type (and, like a new element, an empty text)
                if (x.type === EMPTY_TYPE.k) {
                    const dp = defaultProps(k)
                    return [{...x, type: k, label: k === 'kring' ? nextLetter(tree) : '', ...(dp ? {p: {...dp}, info: k === 'kring' ? infoOf(dp) : x.info} : {})}]
                }
                return [{...x, type: k, label: x.label === old.name || (!x.label && k === 'kring') ? nu.name : x.label}]
            }),
        )
    // the types the selected element can become: same kind (not a distribution part) that fits under its parent
    const isEmpty = s?.type === EMPTY_TYPE.k
    const swapTypes = (() => {
        if (!s) return []
        // an empty element: everything that may hang under its parent (the "kan geplaatst worden na" list) and accepts what hangs under it
        if (isEmpty) return emptyChoices(tp, tree, T, s, free)
        if (DIST.includes(s.type)) return []
        const par = parentOf(tree, s.id)
        return T.filter((t) => t.place && !DIST.includes(t.k) && (t.k === s.type || free || !par || t.parents.includes(par.type)))
    })()
    // can anything be inserted before / after the selected element? (the buttons in Eigenschappen)
    const canBefore = !!s && insertTypes(tp, tree, T, s, 'before', free).length > 0,
        canAfter = !!s && insertTypes(tp, tree, T, s, 'after', free).length > 0,
        canBranch = !!s && siblingTypes(tree, T, s, free).length > 0
    // drag & drop: any symbol can be dropped anywhere. It does not check whether the symbol "fits" there, it just does it and the user corrects a mistake.
    // Where it lands depends on what the pointer is over:
    // - a symbol inside a circuit: before it (left half) or after it (right half)
    // - the free area or the stem of a circuit: a circuit (kring, differentieel) comes next to it (left / right half), a smeltveiligheid in front of it, a part of the
    //   main line (teller, verdeelbord, ...) goes where it goes on the bus, anything else becomes its last branch
    // - the bus, the head (kWh meter, earth) or the space below the bus: a circuit (kring, differentieel) becomes the last circuit, a part of the main line (verdeelbord, ...) comes in front of the board, anything else hangs under the board
    // - anywhere else on the sheet (above the bus): the nearest circuit counts
    // parts of the main line go in front of the board (the circuits stay visible); a second verdeelbord hangs under the first one, so the circuits stay visible too
    const MAIN = ['aansluiting', 'teller', 'hoofdschakelaar']
    const dropAt = (e) => {
        if (!dragT) return null
        const k = dragT.k,
            circ = k === 'kring' || k === 'diff', // both make a new circuit
            root = e.currentTarget,
            busId = plan[0]?.b.bus?.id,
            onBus = () =>
                busId
                    ? {id: busId, mode: MAIN.includes(k) ? 'before' : 'after', zone: 'bus'}
                    : tree.length
                        ? {id: tree.at(-1).id, mode: 'after', zone: 'bus'}
                        : {id: null, mode: 'root', zone: 'bus'},
            onCircuit = (c, hit) => {
                if (!circ) return k === 'zekering' ? {id: c.id, mode: 'before', zone: 'circuit'} : MAIN.includes(k) || k === 'bord' ? onBus() : {id: c.id, mode: 'after', zone: 'circuit'}
                const box = (hit || root?.querySelector?.(`[data-hit="${c.id}"]`))?.getBoundingClientRect()
                return {id: c.id, mode: box && e.clientX < box.left + box.width / 2 ? 'left' : 'right', zone: 'circuit'}
            }
        const el = e.target?.closest?.('[data-nid],[data-hit],[data-stem],[data-bus]'),
            id = el && (el.getAttribute('data-bus') || el.getAttribute('data-nid') || el.getAttribute('data-hit') || el.getAttribute('data-stem')),
            tgt = id && find(tree, id)
        if (el?.hasAttribute('data-bus')) return onBus()
        if (!tgt) {
            // empty space: below the bus the bus counts, above it the circuit that is nearest sideways
            const busEl = root?.querySelector?.('[data-bus]')
            if (busEl && e.clientY > busEl.getBoundingClientRect().bottom) return onBus()
            let best = null
            root?.querySelectorAll?.('[data-hit]').forEach((h) => {
                const r = h.getBoundingClientRect(),
                    d = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0,
                    c = find(tree, h.getAttribute('data-hit'))
                if (c && (!best || d < best.d)) best = {d, c, h}
            })
            return best ? onCircuit(best.c, best.h) : onBus()
        }
        const c = circuitOf(tree, tgt.id)
        if (!c) return onBus() // the head: the main line
        if (tgt.id === c.id) return onCircuit(c, el.hasAttribute('data-hit') ? el : null) // the circuit itself: its area, stem or letter
        if (circ) return onCircuit(c)
        const half = el.tagName.toLowerCase() !== 'text',
            r = el.getBoundingClientRect()
        return {id: tgt.id, mode: half && e.clientX < r.left + r.width / 2 ? 'before' : 'after', zone: 'element'}
    }
    const stopDrag = () => {
        setDragT(null)
        setDrop(null)
    }
    const dragOver = (no) => (e) => {
        if (!dragT) return
        const h = dropAt(e)
        if (!h) return drop && setDrop(null)
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        if (!drop || drop.id !== h.id || drop.mode !== h.mode || drop.no !== no) setDrop({...h, no})
    }
    const dragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDrop(null)
    }
    const dropOn = (e) => {
        const h = dropAt(e)
        if (!h) return stopDrag()
        e.preventDefault()
        insertSym(h.id, h.mode, dragT)
        stopDrag()
    }
    // what the sheet would look like after the drop: the whole sheet is laid out again with the new element in it (drawn in blue)
    const preview = (() => {
        if (!drop || !dragT) return null
        const n = {...mkDrop(dragT), id: GHOST},
            pp = {...p, een: p.een.map((g, i) => (i === idx ? {...g, tree: insertAt(tree, drop.id, drop.mode, n)} : g))},
            pl = sheetPlan(pp, true).filter((e) => e.kind === 'een' && e.pg === pp.een[idx]),
            k = pl.findIndex((e) => e.b.circuits.slice(e.sl.from, e.sl.to).some((c) => c.items.some((it) => it.id === GHOST)))
        // drawn: the new element is part of the sheet (and drawn in blue); not drawn (e.g. a differentieel): the place where it goes is marked in blue instead
        return {no: drop.no, drawn: k >= 0, e: pl[k >= 0 ? k : Math.min(drop.no - 1, pl.length - 1)]}
    })()
    const rows = (ns, d = 0) =>
        ns.flatMap((n) => {
            const kids = n.children.length,
                open = !folded.has(n.id),
                main = DIST.includes(n.type),
                hidden = kids ? flat(n.children).length : 0
            return [
                <div
                    key={n.id}
                    className={sel === n.id ? 'sel' : ''}
                    style={{paddingLeft: d * 10 + 2, cursor: 'pointer'}}
                    onClick={() => setSel(n.id)}
                >
                    <span style={{display: 'inline-flex', width: 14, flex: 'none'}}>
                        {kids ? (
                            <button
                                id={`eds-toggle-${n.id}`}
                                title={open ? 'Inklappen' : `Uitklappen (${hidden} verborgen)`}
                                aria-label={open ? 'Inklappen' : 'Uitklappen'}
                                aria-expanded={open}
                                style={{
                                    display: 'inline-flex',
                                    width: 14,
                                    height: 14,
                                    margin: 0,
                                    padding: 0,
                                    border: 'none',
                                    background: 'none',
                                    color: 'inherit',
                                    cursor: 'pointer',
                                }}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setFolded((f) => {
                                        const g = new Set(f)
                                        g.has(n.id) ? g.delete(n.id) : g.add(n.id)
                                        return g
                                    })
                                }}
                            >
                                <Mark kind={!open ? 'closed' : main && d > 0 ? 'main' : 'open'}/>
                            </button>
                        ) : (
                            main && d > 0 && (
                                <span style={{opacity: 0.45, display: 'inline-flex'}}>
                                    <Mark kind="main"/>
                                </span>
                            )
                        )}
                    </span>
                    <svg width="20" height="20" viewBox="0 0 22 22">
                        <Sym shapes={shapesOf(typeOf(p, n.type), n.p)} x={11} y={11} s={20}/>
                    </svg>
                    <span style={main ? {fontWeight: 600} : undefined}>{nameOf(p, n)}</span>
                    <small style={{color: '#666'}}>{n.info}</small>
                    {!open && <small style={{color: '#666'}}>(+{hidden})</small>}
                </div>,
                ...(open ? rows(n.children, d + 1) : []),
            ]
        })
    const ob = (f) => () => set(f(tree, s.id)),
        fields = s && ((s.type === 'kring' ? kringFields(s.p) : FIELDS[s.type]) || (['bord'].includes(s.type) ? [] : OTHER)),
        plan = sheetPlan(p, true).filter((e) => e.kind === 'een' && e.pg === pg),
        fieldRows = (fields || []).reduce((a, f) => {
            const last = a[a.length - 1]
            if (f[2] && last?.short) last.fs.push(f)
            else a.push({short: !!f[2], fs: [f]})
            return a
        }, [])
    return (
        <div className="row">
            <div className="side ui pal sticky-side">
                <input
                    placeholder="Zoek element…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={{width: '100%', boxSizing: 'border-box'}}
                />
                <label>
                    <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)}/> Vrije hiërarchie
                </label>
                {[...new Set(T.map((t) => t.cat))].map((c) => {
                    const Ls = T.filter((t) => t.cat === c && t.name.toLowerCase().includes(q.toLowerCase()))
                    return (
                        Ls.length > 0 && (
                            <details key={c} open={!!q}>
                                <summary>
                                    <b>{c}</b>
                                </summary>
                                {Ls.map((t) => (
                                    <button
                                        key={t.k}
                                        draggable
                                        title="Klik om toe te voegen, of sleep het naar het schema"
                                        onClick={() => add(t)}
                                        onDragStart={(e) => {
                                            setDragT(t)
                                            if (e.dataTransfer) {
                                                e.dataTransfer.effectAllowed = 'copy'
                                                e.dataTransfer.setData('text/plain', t.k)
                                            }
                                        }}
                                        onDragEnd={stopDrag}
                                    >
                                        <svg width="20" height="20" viewBox="0 0 20 20">
                                            <Sym shapes={t.shapes} x={10} y={10} s={18}/>
                                        </svg>
                                        {t.name}
                                    </button>
                                ))}
                            </details>
                        )
                    )
                })}
                {s && (
                    <div className="warn">
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <b>Eigenschappen</b>
                            <button
                                id="eds-close"
                                title="Eigenschappen sluiten"
                                aria-label="Eigenschappen sluiten"
                                style={{display: 'inline-flex', width: 'auto', padding: '2px 7px'}}
                                onClick={() => setSel(null)}
                            >
                                ✕
                            </button>
                        </div>
                        <label>
                            {s.type === 'kring' ? 'Letter' : 'Tekst'}
                            <input
                                value={s.label}
                                onChange={(e) => set(upd(tree, s.id, (x) => [{...x, label: e.target.value}]))}
                                style={{width: '100%', boxSizing: 'border-box'}}
                            />
                        </label>
                        <label>
                            Type
                            <select
                                aria-label="Type"
                                value={s.type}
                                disabled={!swapTypes.length}
                                onChange={(e) => changeType(e.target.value)}
                                style={{width: '100%', boxSizing: 'border-box'}}
                            >
                                {isEmpty && <option value={EMPTY_TYPE.k}>— kies een symbool —</option>}
                                {swapTypes.length ? (
                                    [...new Set(swapTypes.map((t) => t.cat))].map((c) => (
                                        <optgroup key={c} label={c}>
                                            {swapTypes
                                                .filter((t) => t.cat === c)
                                                .map((t) => (
                                                    <option key={t.k} value={t.k}>
                                                        {t.name}
                                                    </option>
                                                ))}
                                        </optgroup>
                                    ))
                                ) : isEmpty ? null : (
                                    <option value={s.type}>{typeOf(p, s.type).name}</option>
                                )}
                            </select>
                        </label>
                        {s.type === 'bord' && (
                            <label>
                                <input type="checkbox" checked={!!s.p?.geaard}
                                       onChange={(e) => setProp('geaard', e.target.checked)}/>{' '}
                                Geaard
                            </label>
                        )}
                        {s.type === 'kring' && (
                            <label>
                                Bescherming
                                <select aria-label="Bescherming" value={s.p?.bescherming || 'automatisch'}
                                        onChange={(e) => setProp('bescherming', e.target.value)}
                                        style={{width: '100%', boxSizing: 'border-box'}}>
                                    <option value="automatisch">Automaat</option>
                                    <option value="differentieel">Differentieel</option>
                                    <option value="geen">Geen</option>
                                </select>
                            </label>
                        )}
                        {fieldRows.map((r) =>
                            r.short ? (
                                <div key={r.fs[0][0]} id={'eds-short-' + r.fs[0][0]}
                                     style={{display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4}}>
                                    {r.fs.map(([k, l, w]) => (
                                        <label key={k} style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                            <span style={{minWidth: '8.5em'}}>{l}</span>
                                            <input
                                                value={s.p?.[k] ?? ''}
                                                maxLength={w}
                                                onChange={(e) => setProp(k, e.target.value)}
                                                style={{
                                                    width: w + 2 + 'ch',
                                                    boxSizing: 'border-box',
                                                    textAlign: 'center'
                                                }}
                                            />
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                r.fs.map(([k, l]) =>
                                    k === 'plaatsing' ? (
                                        // where the cable runs (select) and whether it runs in a conduit: both are drawn left of the stem
                                        <div key={k} id="eds-plaatsing" style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4}}>
                                            <label style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                                <span>{l}</span>
                                                <select
                                                    id="eds-plaatsing-select"
                                                    aria-label="Plaatsing"
                                                    value={s.p?.plaatsing ?? ''}
                                                    onChange={(e) => setProp('plaatsing', e.target.value)}
                                                >
                                                    {PLAATSING.map(([v, n]) => (
                                                        <option key={v} value={v}>
                                                            {n}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label style={{display: 'flex', alignItems: 'center', gap: 4}}>
                                                <input
                                                    id="eds-inbuis"
                                                    type="checkbox"
                                                    checked={hasPlacement(s.p) && !!s.p?.inbuis}
                                                    disabled={!hasPlacement(s.p)}
                                                    onChange={(e) => setProp('inbuis', e.target.checked)}
                                                />
                                                in buis
                                            </label>
                                        </div>
                                    ) : (
                                        <label key={k}>
                                            {l}
                                            <input
                                                value={s.p?.[k] ?? ''}
                                                onChange={(e) => setProp(k, e.target.value)}
                                                style={{width: '100%', boxSizing: 'border-box'}}
                                            />
                                        </label>
                                    ))
                            ),
                        )}
                        {stackOf(typeOf(p, s.type), s.p) && (
                            <label>
                                <div>
                                    <input
                                        type="checkbox"
                                        checked={stackOf(typeOf(p, s.type), s.p).hor}
                                        onChange={(e) => setProp('hor', e.target.checked)}
                                    />{' '}
                                    Horizontaal
                                </div>
                            </label>
                        )}
                        {/* waterproof is a property of a socket (the small 'h'), not a symbol of its own; it also follows on the situatieschema */}
                        {typeOf(p, s.type).sock && (
                            <label>
                                <div>
                                    <input id="eds-waterproof" type="checkbox" checked={!!s.p?.h} onChange={(e) => setProp('h', e.target.checked)} /> Waterdicht
                                </div>
                            </label>
                        )}
                        {/* only for the symbols that have the extended details input (inverter, solar panels, battery, EV charger, or
                            the ones where it is switched on in Componenten); existing details of another element stay visible so they can be edited */}
                        {!DIST.includes(s.type) && (typeOf(p, s.type).details || detailLines(s.p?.details).length > 0) && (
                            <label>
                                Details (onder het symbool)
                                <textarea
                                    id="eds-details"
                                    aria-label="Details"
                                    rows={4}
                                    placeholder={'Eén regel per gegeven, bv.\nMerk: Huawei\nType: SUN2000-6KTL\nS/N: HV1234\nPmax: 6 kW'}
                                    value={s.p?.details ?? ''}
                                    onChange={(e) => setProp('details', e.target.value)}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        resize: 'vertical',
                                        fontFamily: 'inherit'
                                    }}
                                />
                                <small style={{color: '#666'}}>Enter = nieuwe regel (ook | scheidt regels)</small>
                            </label>
                        )}
                        {s.type !== 'kring' && (
                            <input
                                placeholder="Specs (bv. B16 2P 2,5mm²)"
                                value={s.info || ''}
                                onChange={(e) => set(upd(tree, s.id, (x) => [{...x, info: e.target.value}]))}
                                style={{width: '100%', boxSizing: 'border-box', marginTop: 4}}
                            />
                        )}
                        <div className="tb icons" id="eds-insert">
                            <small style={{display: 'block'}}>Leeg symbool invoegen:</small>
                            <button
                                id="eds-insert-before"
                                title={
                                    canBefore
                                        ? 'Leeg symbool invoegen vóór dit element (tussen het vorige element en dit element); kies daarna het type'
                                        : isEmpty
                                            ? 'Kies eerst een type voor dit lege symbool'
                                            : 'Er past geen enkel symbool vóór dit element'
                                }
                                aria-label="Symbool invoegen vóór"
                                disabled={!canBefore}
                                onClick={() => insertEmpty('before')}
                            >
                                {ICONS.before} Vóór
                            </button>
                            <button
                                id="eds-insert-after"
                                title={
                                    canAfter
                                        ? 'Leeg symbool invoegen na dit element; kies daarna het type'
                                        : isEmpty
                                            ? 'Kies eerst een type voor dit lege symbool'
                                            : 'Er past geen enkel symbool na dit element'
                                }
                                aria-label="Symbool invoegen na"
                                disabled={!canAfter}
                                onClick={() => insertEmpty('after')}
                            >
                                Na {ICONS.after}
                            </button>
                            <button
                                id="eds-insert-branch"
                                title={
                                    canBranch
                                        ? 'Nieuwe tak invoegen: een leeg symbool naast dit element, onder hetzelfde bovenliggende element (bv. na B1 komt B2, erboven getekend); kies daarna het type'
                                        : isEmpty
                                            ? 'Kies eerst een type voor dit lege symbool'
                                            : 'Er past geen enkel symbool als volgende tak van dit element'
                                }
                                aria-label="Nieuwe tak invoegen"
                                disabled={!canBranch}
                                onClick={() => insertEmpty('branch')}
                            >
                                {ICONS.branch} Tak
                            </button>
                        </div>
                        <div className="tb icons">
                            <button
                                id="eds-earlier"
                                title="Eerder in de volgorde (omhoog in de opbouw, naar links in het schema)"
                                aria-label="Eerder in de volgorde"
                                onClick={ob((t, i) => mv(t, i, -1))}
                            >
                                {ICONS.earlier}
                            </button>
                            <button
                                id="eds-later"
                                title="Later in de volgorde (omlaag in de opbouw, naar rechts in het schema)"
                                aria-label="Later in de volgorde"
                                onClick={ob((t, i) => mv(t, i, 1))}
                            >
                                {ICONS.later}
                            </button>
                            <button
                                id="eds-outdent"
                                title="Eén niveau hoger: uit de bovenliggende groep halen"
                                aria-label="Eén niveau hoger"
                                onClick={ob(outdent)}
                            >
                                {ICONS.outdent}
                            </button>
                            <button
                                id="eds-indent"
                                title="Eén niveau lager: onder het vorige element plaatsen"
                                aria-label="Eén niveau lager"
                                onClick={ob(indent)}
                            >
                                {ICONS.indent}
                            </button>
                            <button
                                id="eds-duplicate"
                                title="Dupliceren"
                                aria-label="Dupliceren"
                                onClick={() => set(upd(tree, s.id, (x) => [x, ...reid([x])]))}
                            >
                                ⧉
                            </button>
                            <button
                                id="eds-delete"
                                title="Verwijderen (met onderliggende elementen)"
                                aria-label="Verwijderen"
                                onClick={remove}
                            >
                                {ICONS.trash}
                            </button>
                            <button
                                id="eds-rotate-ccw"
                                title={`Symbool ${ROT_STEP}° tegen de klok in draaien`}
                                aria-label="Tegen de klok in draaien"
                                disabled={DIST.includes(s.type)}
                                onClick={() => set(rotate(tree, s.id, -ROT_STEP))}
                            >
                                {ICONS.ccw}
                            </button>
                            <button
                                id="eds-rotate-cw"
                                title={`Symbool ${ROT_STEP}° met de klok mee draaien`}
                                aria-label="Met de klok mee draaien"
                                disabled={DIST.includes(s.type)}
                                onClick={() => set(rotate(tree, s.id, ROT_STEP))}
                            >
                                {ICONS.cw}
                            </button>
                            {!DIST.includes(s.type) && !!s.r && <small id="eds-rotation"> {s.r}°</small>}
                        </div>
                    </div>
                )}
                <br/>
                <b>Opbouw</b>
                <div className="tree">{rows(tree)}</div>
            </div>
            <div className={dragT ? 'main eds-dragging' : 'main'} ref={drawing}>
                {plan.map((e) => (
                    <div
                        key={e.no}
                        id={`eds-sheet-${e.no}`}
                        style={{position: 'relative', width: zoom < 1 ? `${zoom * 100}%` : '100%', marginBottom: 10}}
                        onDragOver={dragOver(e.no)}
                        onDragLeave={dragLeave}
                        onDrop={dropOn}>
                        <ZoomPane zoom={zoom} always>
                            <div style={{width: `${Math.max(zoom, 1) * 100}%`, position: 'relative'}}>
                                <BoardSheet
                                    p={p}
                                    pg={pg}
                                    b={e.b}
                                    sl={e.sl}
                                    no={e.no}
                                    total={e.total}
                                    sel={sel}
                                    onSel={setSel}
                                    onFooter={onFooter}
                                    onDelete={remove}
                                />
                                {/* drop preview: the sheet as it would look after the drop, laid over the real one (which keeps receiving the drag events) */}
                                {preview && preview.no === e.no && preview.e && (
                                    <div id="eds-drop-preview" style={{position: 'absolute', inset: 0, background: '#fff', pointerEvents: 'none', zIndex: 2}}>
                                        <BoardSheet
                                            p={p}
                                            pg={pg}
                                            b={preview.e.b}
                                            sl={preview.e.sl}
                                            no={e.no}
                                            total={e.total}
                                            ghost={GHOST}
                                            sel={!preview.drawn && drop.zone !== 'bus' ? drop.id : null}
                                            busMark={!preview.drawn && drop.zone === 'bus'}
                                            onFooter={onFooter}
                                        />
                                    </div>
                                )}
                            </div>
                        </ZoomPane>
                        <div className="ui zoomctl inset">
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
                    </div>
                ))}
            </div>
        </div>
    )
}
