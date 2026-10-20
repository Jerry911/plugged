// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useState} from 'react'
import {allTypes, stackOf, Sym, typeOf} from './symbols'
import {BoardSheet} from './Board.jsx'
import {defaultProps, infoOf, nextLetter, sheetPlan} from './boardModel'
import {flat, nameOf, reid, uid} from './util'
import {ZOOMS} from './Situatie.jsx'
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
const DIST = ['aansluiting', 'teller', 'hoofdschakelaar', 'bord', 'diff', 'kring', 'domotica', 'subbord']
const FIELDS = {
    kring: [
        ['tekst', 'Naam (tekst)'],
        ['polen', 'Polen'],
        ['amp', 'Beveiliging (A)'],
        ['curve', 'Curve'],
        ['kabel', 'Kabel'],
        ['kortsl', 'Kortsluitvermogen (kA)'],
    ],
    aansluiting: [
        ['polen', 'Polen'],
        ['amp', 'Beveiliging (A)'],
        ['delta', 'Differentieel (mA)'],
        ['diffType', 'Type'],
        ['kabel', 'Kabel na teller'],
        ['kortsl', 'Kortsluitvermogen (kA)'],
    ],
}
const OTHER = [
    ['aantal', 'Aantal (x)'],
    ['nr', 'Nr'],
]
export default function Eendraad({p, setP, idx, focus, onFooter}) {
    const pg = p.een[idx],
        tree = pg.tree,
        T = allTypes(p),
        [sel, setSel] = useState(null),
        [free, setFree] = useState(false),
        [q, setQ] = useState(''),
        [zoom, setZoom] = useState(1)
    useEffect(() => {
        focus && setSel(focus.id)
    }, [focus])
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
    const add = (t) => {
        const n = {id: uid(), type: t.k, label: t.k === 'kring' ? nextLetter(tree) : t.name, info: '', children: []},
            dp = defaultProps(t.k)
        if (dp) {
            n.p = {...dp}
            if (t.k === 'kring') n.info = infoOf(n.p)
        }
        if (!t.parents.length) return set([...tree, n])
        const par = parentFor(t)
        if (!par) {
            if (free && !s) return set([...tree, n])
            return alert(
                s
                    ? `'${t.name}' kan enkel onder: ${t.parents.map((k) => typeOf(p, k).name).join(', ')}. (Of vink "Vrije hiërarchie" aan.)`
                    : 'Selecteer eerst een element waaronder dit past.',
            )
        }
        set(upd(tree, par.id, (x) => [{...x, children: [...x.children, n]}]))
        if (DIST.includes(t.k)) setSel(n.id)
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
                return [{...x, type: k, label: !x.label || x.label === old.name ? nu.name : x.label}]
            }),
        )
    // the types the selected element can become: same kind (not a distribution part) that fits under its parent
    const parentOf = (ns, id, par = null) => {
        for (const n of ns) {
            if (n.id === id) return par
            const r = parentOf(n.children, id, n)
            if (r !== undefined) return r
        }
    }
    const swapTypes = (() => {
        if (!s || DIST.includes(s.type)) return []
        const par = parentOf(tree, s.id)
        return T.filter((t) => t.place && !DIST.includes(t.k) && (t.k === s.type || free || !par || t.parents.includes(par.type)))
    })()
    const rows = (ns, d = 0) =>
        ns.flatMap((n) => [
            <div
                key={n.id}
                className={sel === n.id ? 'sel' : ''}
                style={{paddingLeft: d * 14, cursor: 'pointer'}}
                onClick={() => setSel(n.id)}
            >
                <svg width="20" height="20" viewBox="0 0 22 22">
                    <Sym shapes={typeOf(p, n.type).shapes} x={11} y={11} s={20}/>
                </svg>
                <span>{nameOf(p, n)}</span>
                <small style={{color: '#666'}}>{n.info}</small>
            </div>,
            ...rows(n.children, d + 1),
        ])
    const ob = (f) => () => set(f(tree, s.id)),
        fields = s && (FIELDS[s.type] || (['bord'].includes(s.type) ? [] : OTHER)),
        plan = sheetPlan(p, true).filter((e) => e.kind === 'een' && e.pg === pg)
    return (
        <div className="row">
            <div className="side ui pal">
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
                                    <button key={t.k} onClick={() => add(t)}>
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
                <br/>
                <b>Opbouw</b>
                <div className="tree">{rows(tree)}</div>
                {s && (
                    <div className="warn">
                        <div><b>Eigenschappen</b></div>
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
                                ) : (
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
                        {fields.map(([k, l]) => (
                            <label key={k}>
                                {l}
                                <input
                                    value={s.p?.[k] ?? ''}
                                    onChange={(e) => setProp(k, e.target.value)}
                                    style={{width: '100%', boxSizing: 'border-box'}}
                                />
                            </label>
                        ))}
                        {stackOf(typeOf(p, s.type), s.p) && (
                            <label>
                                <input
                                    type="checkbox"
                                    checked={stackOf(typeOf(p, s.type), s.p).hor}
                                    onChange={(e) => setProp('hor', e.target.checked)}
                                />{' '}
                                Horizontaal (gestapeld bij meerdere)
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
                        <div className="tb">
                            <button title="Hoger niveau" onClick={ob(outdent)}>↑</button>
                            <button title="Onder vorige" onClick={ob(indent)}>↓</button>
                            <button onClick={() => set(upd(tree, s.id, (x) => [x, ...reid([x])]))}>⧉</button>
                        </div>
                    </div>
                )}
            </div>
            <div className="main">
                {plan.map((e) => (
                    <div
                        key={e.no}
                        style={{position: 'relative', width: zoom < 1 ? `${zoom * 100}%` : '100%', marginBottom: 10}}>
                        <ZoomPane zoom={zoom} always>
                            <div style={{width: `${Math.max(zoom, 1) * 100}%`}}>
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
                                />
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
