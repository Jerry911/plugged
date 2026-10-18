// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useState} from 'react'
import {allTypes, Sym, typeOf} from './symbols'
import {Sheet} from './Footer'
import {reid, uid} from './util'

export const upd = (ns, id, f) => ns.flatMap(n => n.id === id ? f(n) : [{...n, children: upd(n.children, id, f)}])
export const find = (ns, id) => {
    for (const n of ns) {
        if (n.id === id) return n;
        const r = find(n.children, id);
        if (r) return r
    }
}
export const mv = (ns, id, d) => {
    const i = ns.findIndex(n => n.id === id);
    if (i < 0) return ns.map(n => ({...n, children: mv(n.children, id, d)}))
    const j = i + d;
    if (j < 0 || j >= ns.length) return ns;
    const a = [...ns];
    [a[i], a[j]] = [a[j], a[i]];
    return a
}
export const indent = (ns, id) => {
    const i = ns.findIndex(n => n.id === id);
    if (i < 0) return ns.map(n => ({...n, children: indent(n.children, id)}));
    if (!i) return ns
    const a = [...ns], [x] = a.splice(i, 1);
    a[i - 1] = {...a[i - 1], children: [...a[i - 1].children, x]};
    return a
}
export const outdent = (ns, id) => ns.flatMap(n => {
    const c = n.children.find(x => x.id === id);
    return c ? [{...n, children: n.children.filter(x => x !== c)}, c] : [{...n, children: outdent(n.children, id)}]
})
export const layout = (ns, d = 0, c = {x: 0}) => ns.map(n => {
    const ch = layout(n.children, d + 1, c);
    return {n, d, ch, x: ch.length ? (ch[0].x + ch.at(-1).x) / 2 : c.x++}
})
export const leaves = ns => ns.reduce((a, n) => a + (n.children.length ? leaves(n.children) : 1), 0)
export const depth = ns => ns.length ? 1 + Math.max(...ns.map(n => depth(n.children))) : 0
export const EenSheet = ({p, pg, no, total, sel, onSel, onFooter}) => {
    const lay = layout(pg.tree),
        k = Math.min(1, 270 / (Math.max(1, leaves(pg.tree)) * 24), 160 / (depth(pg.tree) * 32 + 10))
    const draw = (l, par) => {
        const x = 15 + l.x * 24, y = 20 + l.d * 32;
        return [
            par && <polyline key={l.n.id + 'l'} fill="none" stroke="#000" strokeWidth=".4"
                             points={`${par.x},${par.y + 5} ${par.x},${y - 9} ${x},${y - 9} ${x},${y - 5}`}/>,
            <g key={l.n.id} onClick={() => onSel && onSel(l.n.id)} style={onSel ? {cursor: 'pointer'} : {}}>
                {sel === l.n.id &&
                    <rect x={x - 10} y={y - 8} width="20" height="26" fill="#cfe3ff" fillOpacity=".5" stroke="#0a6cff"
                          strokeWidth=".4"/>}
                <Sym shapes={typeOf(p, l.n.type).shapes} x={x} y={y} s={10}/>
                <text x={x} y={y + 9} fontSize="2.6" textAnchor="middle">{l.n.label}</text>
                {l.n.info && <text x={x} y={y + 13} fontSize="2.1" textAnchor="middle" fill="#444">{l.n.info}</text>}
            </g>,
            ...l.ch.flatMap(c => draw(c, {x, y}))]
    }
    return <Sheet p={p} page={no} total={total} onFooter={onFooter} name={'Eendraadschema – ' + pg.name}>
        <g transform={`scale(${k})`}>{lay.flatMap(l => draw(l))}</g>
    </Sheet>
}
export default function Eendraad({p, setP, idx, focus, onFooter}) {
    const pg = p.een[idx], tree = pg.tree,
        T = allTypes(p), [sel, setSel] = useState(null), [free, setFree] = useState(false), [q, setQ] = useState('')
    useEffect(() => {
        focus && setSel(focus.id)
    }, [focus])
    const set = t => setP({...p, een: p.een.map((g, i) => i === idx ? {...g, tree: t} : g)}), s = sel && find(tree, sel)
    const remove = () => {
        if (s) {
            set(upd(tree, s.id, () => []));
            setSel(null)
        }
    }
    useEffect(() => {
        const f = e => {
            if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !s) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                remove()
            }
        };
        addEventListener('keydown', f);
        return () => removeEventListener('keydown', f)
    })
    const add = t => {
        const n = {id: uid(), type: t.k, label: t.name, info: '', children: []}
        if (!t.parents.length || (!s && free)) return set([...tree, n])
        if (!s) return alert('Selecteer eerst een element waaronder dit past.')
        if (!free && !t.parents.includes(s.type)) return alert(`'${t.name}' kan enkel onder: ${t.parents.map(k => typeOf(p, k).name).join(', ')}. (Of vink "Vrije hiërarchie" aan.)`)
        set(upd(tree, s.id, x => [{...x, children: [...x.children, n]}]));
        setSel(n.id)
    }
    const rows = (ns, d = 0) => ns.flatMap(n => [<div key={n.id} className={sel === n.id ? 'sel' : ''}
                                                      style={{paddingLeft: d * 14, cursor: 'pointer'}}
                                                      onClick={() => setSel(n.id)}>
        <svg width="20" height="20" viewBox="0 0 22 22"><Sym shapes={typeOf(p, n.type).shapes} x={11} y={11} s={20}/>
        </svg>
        <span>{n.label}</span><small style={{color: '#666'}}>{n.info}</small></div>, ...rows(n.children, d + 1)])
    const ob = f => () => set(f(tree, s.id))
    return <div className="row">
        <div className="side ui pal"><input placeholder="Zoek element…" value={q} onChange={e => setQ(e.target.value)}
                                            style={{width: '100%', boxSizing: 'border-box'}}/>
            <label><input type="checkbox" checked={free} onChange={e => setFree(e.target.checked)}/> Vrije
                hiërarchie</label>
            {[...new Set(T.map(t => t.cat))].map(c => {
                const Ls = T.filter(t => t.cat === c && t.name.toLowerCase().includes(q.toLowerCase()));
                return Ls.length > 0 &&
                    <details key={c} open={!!q || c === T[0].cat}>
                        <summary><b>{c}</b></summary>
                        {Ls.map(t => <button key={t.k} onClick={() => add(t)}>
                            <svg width="20" height="20" viewBox="0 0 20 20"><Sym shapes={t.shapes} x={10} y={10}
                                                                                 s={18}/></svg>
                            {t.name}</button>)}</details>
            })}
            <b>Opbouw</b>
            <div className="tree">{rows(tree)}</div>
            {s && <div className="warn"><b>Eigenschappen</b><input value={s.label}
                                                                   onChange={e => set(upd(tree, s.id, x => [{
                                                                       ...x,
                                                                       label: e.target.value
                                                                   }]))}
                                                                   style={{width: '100%', boxSizing: 'border-box'}}/>
                <input placeholder="Specs (bv. B16 2P 2,5mm²)" value={s.info || ''}
                       onChange={e => set(upd(tree, s.id, x => [{...x, info: e.target.value}]))}
                       style={{width: '100%', boxSizing: 'border-box', marginTop: 4}}/>
                <div className="tb">
                    <button onClick={ob((t, i) => mv(t, i, -1))}>↑</button>
                    <button onClick={ob((t, i) => mv(t, i, 1))}>↓</button>
                    <button title="Hoger niveau" onClick={ob(outdent)}>←</button>
                    <button title="Onder vorige" onClick={ob(indent)}>→</button>
                    <button onClick={() => set(upd(tree, s.id, x => [x, ...reid([x])]))}>⧉</button>
                </div>
            </div>}</div>
        <div className="main">
            <div className="tb ui sheetbar">
                <button className="danger" disabled={!s} onClick={remove}>🗑 Verwijder (Del)</button>
                <span>{s ? `Selectie: ${s.label}` : 'Klik een element in de opbouw of in de tekening om het te selecteren'}</span>
            </div>
            <EenSheet p={p} pg={pg} no={idx + 1} total={p.een.length + p.sit.length} sel={sel} onSel={setSel}
                      onFooter={onFooter}/></div>
    </div>
}
