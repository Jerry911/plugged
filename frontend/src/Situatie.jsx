// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useRef, useState} from 'react'
import {Sym, typeOf} from './symbols'
import {Sheet} from './Footer'
import {allNodes, uid, unplacedOf} from './util'

const dflt = {sym: 7, text: 4, door: 10, window: 10}
export const SitSheet = ({p, pg, no, total, ed, onFooter}) => {
    const nodes = allNodes(p), {walls, items} = pg, E = ed || {}
    return <Sheet p={p} page={no} total={total} onFooter={onFooter} name={'Situatieschema – ' + pg.name}
                  svgRef={E.ref} {...(E.h || {})}>
        {ed && <>
            <defs>{[['gMinor', E.snap, Math.min(.25, E.snap * .12), '#8a8a8a'], ['gMajor', Math.max(10, E.snap), .35, '#444']].map(([id, s, r, c]) =>
                <pattern key={id} id={id} x={-s / 2} y={-s / 2} width={s} height={s} patternUnits="userSpaceOnUse">
                    <circle cx={s / 2} cy={s / 2} r={r} fill={c}/>
                </pattern>)}</defs>
            <rect x="5" y="5" width="287" height="180" fill="url(#gMinor)"/>
            <rect x="5" y="5" width="287" height="180" fill="url(#gMajor)"/>
        </>}
        {walls.map(w => <g key={w.id}>
            <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#000" strokeWidth="1.6" strokeLinecap="square"/>
            {ed && E.sel?.id === w.id &&
                <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#0a6cff" strokeWidth="2.6" opacity=".4"
                      pointerEvents="none"/>}
            {ed && <line {...E.ep('wall', w.id, 'm')} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="transparent"
                         strokeWidth="5"/>}
            {ed && E.sel?.id === w.id && [['a', w.x1, w.y1], ['b', w.x2, w.y2]].map(([pt, x, y]) => <circle
                key={pt} {...E.ep('wall', w.id, pt)} cx={x} cy={y} r="1.8" fill="#0a6cff"/>)}</g>)}
        {items.map(i => {
            const sz = i.s || i.w || dflt[i.kind], hl = ed && E.sel?.id === i.id,
                g = {...(ed ? E.ep('item', i.id) : {})}
            const hi = hl &&
                <circle r={Math.max(sz, 8) / 1.5} fill="none" stroke="#0a6cff" strokeWidth=".4" strokeDasharray="1 1"
                        pointerEvents="none"/>
            if (i.kind === 'sym') {
                const n = nodes.find(n => n.id === i.node);
                return <g key={i.id} {...g}>
                    <g transform={`translate(${i.x},${i.y})`}>{hi}
                        <g transform={`rotate(${i.r || 0})`}>{n ? <Sym shapes={typeOf(p, n.type).shapes} s={sz}/> :
                            <circle r="3" fill="none" stroke="red"/>}</g>
                    </g>
                    <text x={i.x} y={i.y + sz / 2 + 2.5} fontSize="2.2"
                          textAnchor="middle">{n ? n.label : '(verwijderd)'}</text>
                </g>
            }
            if (i.kind === 'text') return <g key={i.id} {...g}>
                <text x={i.x} y={i.y} fontSize={sz} transform={`rotate(${i.r || 0} ${i.x} ${i.y})`}>{i.txt}</text>
                {hl && <circle cx={i.x} cy={i.y} r="2" fill="none" stroke="#0a6cff"/>}</g>
            const w = i.w || 10, h = w / 2
            return <g key={i.id} {...g}
                      transform={`translate(${i.x},${i.y}) rotate(${i.r || 0}) scale(${i.m ? -1 : 1},${i.f ? -1 : 1})`}
                      stroke="#000" strokeWidth=".4">{hi}
                <rect x={-h} y="-1.3" width={w} height="2.6" fill="#fff" stroke="none"/>
                {i.kind === 'door' ? <>
                        <line x1={-h} y1="0" x2={-h} y2={-w} strokeWidth=".6"/>
                        <path d={`M${-h},${-w} A${w},${w} 0 0 1 ${h},0`} fill="none"/>
                    </>
                    : <>
                        <line x1={-h} y1="-1" x2={h} y2="-1"/>
                        <line x1={-h} y1="1" x2={h} y2="1"/>
                    </>}</g>
        })}
        {E.pend && <circle cx={E.pend.x} cy={E.pend.y} r="1" fill="red"/>}</Sheet>
}
export default function Situatie({p, setP, idx, onFooter}) {
    const pg = p.sit[idx], {
            walls,
            items
        } = pg, [tool, setTool] = useState('select'), [node, setNode] = useState(null), [pend, setPend] = useState(null), [snap, setSnap] = useState(5), [sel, setSel] = useState(null), [drag, setDrag] = useState(null),
        ref = useRef()
    const setPg = patch => setP({...p, sit: p.sit.map((g, i) => i === idx ? {...g, ...patch} : g)})
    const nodes = allNodes(p), unplaced = unplacedOf(p), placed = pg.items.filter(i => i.kind === 'sym').length
    const pt = e => {
        const s = ref.current, m = s.createSVGPoint();
        m.x = e.clientX;
        m.y = e.clientY;
        const r = m.matrixTransform(s.getScreenCTM().inverse());
        return {x: Math.round(r.x / snap) * snap, y: Math.round(r.y / snap) * snap}
    }
    const nearest = q => {
        let b = {d: 1e9, r: 0};
        walls.forEach(w => {
            const dx = w.x2 - w.x1, dy = w.y2 - w.y1,
                t = Math.max(0, Math.min(1, ((q.x - w.x1) * dx + (q.y - w.y1) * dy) / (dx * dx + dy * dy || 1))),
                d = Math.hypot(w.x1 + t * dx - q.x, w.y1 + t * dy - q.y)
            if (d < b.d) b = {d, r: Math.atan2(dy, dx) * 180 / Math.PI, x: w.x1 + t * dx, y: w.y1 + t * dy}
        });
        return b
    }
    const del = (k, id) => setPg(k === 'wall' ? {walls: walls.filter(w => w.id !== id)} : {items: items.filter(i => i.id !== id)})
    const removeSel = () => {
        if (sel) {
            del(sel.k, sel.id);
            setSel(null)
        }
    }
    const shift = (k, id, part, dx, dy) => k === 'wall' ? setPg({
            walls: walls.map(w => w.id !== id ? w : part === 'a' ? {
                ...w,
                x1: w.x1 + dx,
                y1: w.y1 + dy
            } : part === 'b' ? {...w, x2: w.x2 + dx, y2: w.y2 + dy} : {
                ...w,
                x1: w.x1 + dx,
                y1: w.y1 + dy,
                x2: w.x2 + dx,
                y2: w.y2 + dy
            })
        })
        : setPg({
            items: items.map(i => {
                if (i.id !== id) return i;
                const t = {x: i.x + dx, y: i.y + dy};
                if (i.kind === 'door' || i.kind === 'window') {
                    const n = nearest(t);
                    if (n.d < 8) return {...i, x: n.x, y: n.y, r: n.r}
                }
                return {...i, ...t}
            })
        })
    const ep = (k, id, part) => ({
        onPointerDown: e => {
            if (tool === 'select') {
                e.stopPropagation();
                setSel({k, id});
                setDrag({k, id, part, last: pt(e)})
            }
        },
        onClick: e => {
            if (tool === 'select') e.stopPropagation(); else if (tool === 'erase') {
                e.stopPropagation();
                del(k, id)
            }
        }, style: {cursor: tool === 'select' ? 'move' : tool === 'erase' ? 'not-allowed' : undefined}
    })
    const click = e => {
        const q = pt(e);
        if (q.y > 180) return
        if (tool === 'select') setSel(null)
        else if (tool === 'wall') {
            if (!pend) setPend(q); else if (pend.x === q.x && pend.y === q.y) setPend(null); else {
                setPg({walls: [...walls, {id: uid(), x1: pend.x, y1: pend.y, x2: q.x, y2: q.y}]});
                setPend(q)
            }
        } else if (tool === 'room') {
            if (!pend) setPend(q); else {
                const a = pend, b = q;
                if (a.x !== b.x && a.y !== b.y) setPg({
                    walls: [...walls, ...[[a.x, a.y, b.x, a.y], [b.x, a.y, b.x, b.y], [b.x, b.y, a.x, b.y], [a.x, b.y, a.x, a.y]].map(([x1, y1, x2, y2]) => ({
                        id: uid(),
                        x1,
                        y1,
                        x2,
                        y2
                    }))]
                });
                setPend(null)
            }
        } else if (tool === 'door' || tool === 'window') {
            const n = nearest(q), on = n.d < 8;
            setPg({
                items: [...items, {
                    id: uid(),
                    kind: tool,
                    x: on ? n.x : q.x,
                    y: on ? n.y : q.y,
                    r: on ? n.r : 0,
                    w: 10
                }]
            })
        } else if (tool === 'sym' && node) setPg({
            items: [...items, {
                id: uid(),
                kind: 'sym',
                node,
                x: q.x,
                y: q.y,
                r: 0,
                s: 7
            }]
        })
        else if (tool === 'text') {
            const t = prompt('Tekst');
            t && setPg({items: [...items, {id: uid(), kind: 'text', x: q.x, y: q.y, txt: t, s: 4, r: 0}]})
        }
    }
    const pm = e => {
        if (!drag) return;
        const q = pt(e), dx = q.x - drag.last.x, dy = q.y - drag.last.y;
        if (!dx && !dy) return;
        shift(drag.k, drag.id, drag.part, dx, dy);
        setDrag({...drag, last: q})
    }
    const it = sel?.k === 'item' && items.find(i => i.id === sel.id),
        wl = sel?.k === 'wall' && walls.find(w => w.id === sel.id)
    const upI = patch => setPg({items: items.map(i => i.id === it.id ? {...i, ...patch} : i)})
    useEffect(() => {
        const f = e => {
            if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !sel) return;
            const d = {ArrowLeft: [-snap, 0], ArrowRight: [snap, 0], ArrowUp: [0, -snap], ArrowDown: [0, snap]}[e.key]
            if (e.key === 'Delete' || e.key === 'Backspace') {
                removeSel();
                e.preventDefault()
            } else if (d) {
                shift(sel.k, sel.id, 'm', ...d);
                e.preventDefault()
            } else if (e.key === 'r' && it) upI({r: (it.r || 0) + 15})
        }
        addEventListener('keydown', f);
        return () => removeEventListener('keydown', f)
    })
    const auto = () => setPg({
        items: [...items, ...unplaced.map((n, i) => ({
            id: uid(),
            kind: 'sym',
            node: n.id,
            x: 15 + (i % 26) * 10,
            y: 170 - Math.floor(i / 26) * 12,
            r: 0,
            s: 7
        }))]
    })
    const Tool = ({k, l}) => <button className={tool === k ? 'on' : ''} onClick={() => {
        setTool(k);
        setPend(null)
    }}>{l}</button>
    const sk = it && (it.kind === 'sym' || it.kind === 'text' ? 's' : 'w'), [mn, mx] = it?.kind === 'text' ? [2, 12] : it?.kind === 'sym' ? [4, 20] : [6, 20]
    const ed = {
        ref,
        sel,
        ep,
        pend,
        snap,
        h: {
            onClick: click,
            onPointerMove: pm,
            onPointerUp: () => setDrag(null),
            onPointerLeave: () => setDrag(null),
            onContextMenu: e => {
                e.preventDefault();
                setPend(null)
            },
            style: {touchAction: 'none'}
        }
    }
    return <div className="row">
        <div className="side ui">
            <div className="tb"><Tool k="select" l="Selecteer"/><Tool k="wall" l="Muur"/><Tool k="room" l="Kamer"/><Tool
                k="door" l="Deur"/><Tool k="window" l="Raam"/><Tool k="sym" l="Symbool"/><Tool k="text" l="Tekst"/><Tool
                k="erase" l="Wis"/></div>
            <p>Muur: klik punten, klik zelfde punt (of rechtsklik) om te stoppen. Selecteer: sleep, pijltjes, Del, R.
                Raster: rechtsonder in de tekening.</p>
            {it && <div className="warn"><b>Geselecteerd: {it.kind}</b>
                <div className="tb">
                    <button onClick={() => upI({r: (it.r || 0) - 15})}>⟲15°</button>
                    <button onClick={() => upI({r: (it.r || 0) + 15})}>⟳15°</button>
                    <button onClick={() => upI({r: (it.r || 0) + 90})}>⟳90°</button>
                </div>
                <label>Grootte <input type="range" min={mn} max={mx} step=".5" value={it[sk] || dflt[it.kind]}
                                      onChange={e => upI({[sk]: +e.target.value})}/></label>
                {(it.kind === 'door' || it.kind === 'window') && <div className="tb">
                    <button onClick={() => upI({f: !it.f})}>⇅ spiegel</button>
                    <button onClick={() => upI({m: !it.m})}>⇄ spiegel</button>
                </div>}
                {it.kind === 'text' && <input value={it.txt} onChange={e => upI({txt: e.target.value})}/>}
                <div className="tb">
                    <button onClick={() => {
                        setPg({items: [...items, {...it, id: uid(), x: it.x + 5, y: it.y + 5}]})
                    }}>⧉
                    </button>
                </div>
            </div>}
            {wl &&
                <div className="warn">Muur · {Math.round(Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1))} mm op schaal</div>}
            {unplaced.length ? <div className="warn">⚠ Nergens geplaatst ({unplaced.length}):
                <ul>{unplaced.map(n => <li key={n.id}>{n.label}</li>)}</ul>
                <button onClick={auto}>Plaats ontbrekende op dit blad</button>
            </div> : <div className="ok">✓ Alle componenten geplaatst</div>}
            <div className="pal"><b>Componenten ({placed} op dit blad)</b>{nodes.map(n => <button key={n.id}
                                                                                                  style={{background: node === n.id ? '#cfe3ff' : ''}}
                                                                                                  onClick={() => {
                                                                                                      setNode(n.id);
                                                                                                      setTool('sym')
                                                                                                  }}>
                <svg width="20" height="20" viewBox="0 0 20 20"><Sym shapes={typeOf(p, n.type).shapes} x={10} y={10}
                                                                     s={18}/></svg>
                {unplaced.includes(n) ? '⚠' : '✓'} {n.label}</button>)}</div>
        </div>
        <div className="main">
            <div className="tb ui sheetbar">
                <button className="danger" disabled={!sel} onClick={removeSel}>🗑 Verwijder (Del)</button>
                <span>{sel ? 'Selectie actief: Del verwijdert, pijltjes verplaatsen' : 'Kies "Selecteer" en klik een element om het te bewerken'}</span>
            </div>
            <div style={{position: 'relative', maxWidth: 1100}}><SitSheet p={p} pg={pg} no={p.een.length + idx + 1}
                                                                          total={p.een.length + p.sit.length} ed={ed}
                                                                          onFooter={onFooter}/>
                <label className="ui gridsel">Raster <select value={snap}
                                                             onChange={e => setSnap(+e.target.value)}>{[1, 2.5, 5, 10].map(v =>
                    <option key={v} value={v}>{v} mm</option>)}</select></label></div>
        </div>
    </div>
}
