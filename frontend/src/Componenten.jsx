// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Component library: menu with all components on the left, the selected component (name, category, allowed parents, drawing) on the right.
import {useState} from 'react'
import {BUILTIN as DEFAULTS, ELEMENT_KEYS, Sym} from './symbols'
import {uid} from './util'

const TOOLS = {line: 'Lijn', circle: 'Cirkel (midden, rand)', rect: 'Rechthoek', arc: 'Halve cirkel (midden, rand)', text: 'Tekst'},
    KIND = {line: 'Lijn', circle: 'Cirkel', rect: 'Rechthoek', arc: 'Boog', text: 'Tekst'},
    DEF = new Map(DEFAULTS.map((d) => [d.k, d]))
// a component still equals its standard definition
const isStd = (c) => JSON.stringify(DEF.get(c.k)) === JSON.stringify(c)
const blank = () => ({k: 'custom:' + uid(), name: '', cat: 'Eigen', parents: ELEMENT_KEYS, place: true, shapes: []})
const describe = (h) =>
    h.t === 'line'
        ? `(${h.x1},${h.y1}) → (${h.x2},${h.y2})`
        : h.t === 'circle'
          ? `(${h.cx},${h.cy}) r=${h.r}`
          : h.t === 'rect'
            ? `(${h.x},${h.y}) ${h.w}×${h.h}`
            : h.t === 'arc'
              ? `(${h.cx},${h.cy}) r=${h.r} ${h.a1}°…${h.a2}°`
              : `“${h.s}”`

export default function Componenten({lib, onSave, onRemove, onReset}) {
    const [draft, setDraft] = useState(null),
        [orig, setOrig] = useState(null),
        [q, setQ] = useState(''),
        [tool, setTool] = useState('line'),
        [grid, setGrid] = useState(1),
        [a, setA] = useState(null),
        [msg, setMsg] = useState('')
    const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(orig),
        isDef = !!draft && DEF.has(draft.k),
        known = lib.some((c) => draft && c.k === draft.k)
    const open = (c, fresh = false) => {
        if (dirty && !window.confirm('Niet-opgeslagen wijzigingen gaan verloren. Doorgaan?')) return
        const d = {...c, parents: [...c.parents], shapes: [...c.shapes]}
        setDraft(d)
        setOrig(fresh ? null : d)
        setA(null)
        setMsg('')
    }
    const set = (o) => setDraft({...draft, ...o})
    const click = (e) => {
        const s = e.currentTarget,
            m = s.createSVGPoint()
        m.x = e.clientX
        m.y = e.clientY
        const q = m.matrixTransform(s.getScreenCTM().inverse()),
            sn = (v) => Math.round((Math.round(v / grid) * grid) * 100) / 100,
            x = sn(q.x),
            y = sn(q.y)
        if (tool === 'text') {
            const t = prompt('Tekst')
            if (t) set({shapes: [...draft.shapes, {t: 'text', x, y, s: t}]})
            return
        }
        if (!a) return setA({x, y})
        const r = Math.max(grid, sn(Math.hypot(x - a.x, y - a.y))),
            ang = Math.round((Math.atan2(y - a.y, x - a.x) * 180) / Math.PI),
            h =
                tool === 'line'
                    ? {t: 'line', x1: a.x, y1: a.y, x2: x, y2: y}
                    : tool === 'circle'
                      ? {t: 'circle', cx: a.x, cy: a.y, r}
                      : tool === 'arc'
                        ? {t: 'arc', cx: a.x, cy: a.y, r, a1: ang - 90, a2: ang + 90}
                        : {t: 'rect', x: Math.min(a.x, x), y: Math.min(a.y, y), w: Math.abs(x - a.x) || grid, h: Math.abs(y - a.y) || grid}
        set({shapes: [...draft.shapes, h]})
        setA(null)
    }
    const save = async () => {
        if (!draft.name.trim() || !draft.shapes.length) return alert('Geef een naam en teken minstens één vorm.')
        const c = {...draft, name: draft.name.trim(), cat: draft.cat.trim() || 'Eigen'}
        const ok = await onSave(c)
        setDraft(c)
        setOrig(c)
        setMsg(ok ? 'Opgeslagen ✓' : 'Niet in de database opgeslagen (backend niet bereikbaar)')
    }
    const remove = async () => {
        if (!window.confirm(`'${draft.name}' verwijderen? Projecten die dit component gebruiken tonen het dan als "Aansluiting net".`)) return
        await onRemove(draft.k)
        setDraft(null)
        setOrig(null)
    }
    const reset = async () => {
        const d = DEF.get(draft.k)
        await onReset(draft.k)
        setDraft({...d})
        setOrig({...d})
        setMsg('Standaard hersteld ✓')
    }
    const cats = [...new Set(lib.map((c) => c.cat))]
    return (
        <div className="row comp">
            <div className="side ui pal">
                <input
                    placeholder="Zoek component…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={{width: '100%', boxSizing: 'border-box'}}
                />
                <button onClick={() => open(blank(), true)}>＋ Nieuw component</button>
                {cats.map((c) => {
                    const Ls = lib.filter((t) => t.cat === c && t.name.toLowerCase().includes(q.toLowerCase()))
                    return (
                        Ls.length > 0 && (
                            <details key={c} open={!!q || (draft ? draft.cat === c : c === cats[0])}>
                                <summary>
                                    <b>{c}</b>
                                </summary>
                                {Ls.map((t) => (
                                    <button key={t.k} className={draft?.k === t.k ? 'on' : ''} onClick={() => open(t)}>
                                        <svg width="26" height="26" viewBox="0 0 26 26">
                                            <Sym shapes={t.shapes} x={13} y={13} s={24} />
                                        </svg>
                                        {t.name}
                                    </button>
                                ))}
                            </details>
                        )
                    )
                })}
            </div>
            <div className="main">
                {!draft ? (
                    <p>Kies links een component om te bekijken of aan te passen, of maak een nieuw component. Alle componenten verschijnen in het palet van het eendraadschema en op het situatieschema.</p>
                ) : (
                    <>
                        <div className="tb">
                            <input
                                placeholder="Naam component"
                                value={draft.name}
                                onChange={(e) => set({name: e.target.value})}
                                style={{minWidth: 220}}
                            />
                            <input
                                placeholder="Categorie"
                                list="comp-cats"
                                value={draft.cat}
                                onChange={(e) => set({cat: e.target.value})}
                            />
                            <datalist id="comp-cats">
                                {cats.map((c) => (
                                    <option key={c} value={c} />
                                ))}
                            </datalist>
                            <button className="accent" onClick={save}>
                                {known ? 'Opslaan' : 'Toevoegen'}
                            </button>
                            <button onClick={() => open({...draft, k: 'custom:' + uid(), name: draft.name + ' (kopie)'}, true)}>Dupliceer</button>
                            {isDef && (
                                <button disabled={isStd(draft)} onClick={reset}>
                                    Standaard herstellen
                                </button>
                            )}
                            {known && !isDef && (
                                <button className="danger" onClick={remove}>
                                    Verwijder
                                </button>
                            )}
                            <span>{dirty ? '● niet opgeslagen' : msg}</span>
                        </div>
                        <div className="tb">
                            {Object.entries(TOOLS).map(([t, l]) => (
                                <button
                                    key={t}
                                    className={tool === t ? 'on' : ''}
                                    onClick={() => {
                                        setTool(t)
                                        setA(null)
                                    }}
                                >
                                    {l}
                                </button>
                            ))}
                            <label>
                                Raster{' '}
                                <select value={grid} onChange={(e) => setGrid(+e.target.value)}>
                                    {[0.5, 1, 2, 4].map((v) => (
                                        <option key={v} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button title="Laatste vorm ongedaan maken" onClick={() => set({shapes: draft.shapes.slice(0, -1)})}>
                                ↶
                            </button>
                            <button onClick={() => set({shapes: []})}>Leegmaken</button>
                        </div>
                        <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start'}}>
                            <svg
                                viewBox="0 0 24 24"
                                style={{width: '100%', maxWidth: 480, border: '1px solid #888', background: '#fff', margin: '8px 0'}}
                                onClick={click}
                            >
                                <line x1="0" y1="12" x2="24" y2="12" stroke="#f9b" strokeWidth=".1" />
                                <defs>
                                    <pattern id="cgrid" width={grid} height={grid} patternUnits="userSpaceOnUse">
                                        <path d={`M${grid} 0H0V${grid}`} fill="none" stroke="#bbb" strokeWidth=".04" />
                                    </pattern>
                                </defs>
                                <rect x="0" y="0" width="24" height="24" fill="url(#cgrid)" />
                                <Sym shapes={draft.shapes} x={12} y={12} s={24} w={0.6} />
                                {a && <circle cx={a.x} cy={a.y} r=".4" fill="red" />}
                            </svg>
                            <div>
                                <b>Voorbeeld</b>
                                <div style={{display: 'flex', gap: 10, alignItems: 'center', margin: '6px 0'}}>
                                    {[20, 32, 46].map((s) => (
                                        <svg key={s} width={s + 4} height={s + 4} viewBox={`0 0 ${s + 4} ${s + 4}`}>
                                            <Sym shapes={draft.shapes} x={(s + 4) / 2} y={(s + 4) / 2} s={s} />
                                        </svg>
                                    ))}
                                </div>
                                <label style={{display: 'block', margin: '8px 0'}}>
                                    <input type="checkbox" checked={draft.place} onChange={(e) => set({place: e.target.checked})} /> Plaatsbaar op het
                                    situatieschema
                                </label>
                                <details>
                                    <summary>
                                        <b>Mag hangen onder ({draft.parents.length})</b>
                                    </summary>
                                    <div className="tb">
                                        <button onClick={() => set({parents: lib.map((c) => c.k)})}>Alles</button>
                                        <button onClick={() => set({parents: []})}>Geen</button>
                                    </div>
                                    <div style={{maxHeight: 200, overflow: 'auto'}}>
                                        {lib.map((c) => (
                                            <label key={c.k} style={{display: 'block'}}>
                                                <input
                                                    type="checkbox"
                                                    checked={draft.parents.includes(c.k)}
                                                    onChange={(e) =>
                                                        set({parents: e.target.checked ? [...draft.parents, c.k] : draft.parents.filter((k) => k !== c.k)})
                                                    }
                                                />{' '}
                                                {c.name}
                                            </label>
                                        ))}
                                    </div>
                                </details>
                                <b>Vormen ({draft.shapes.length})</b>
                                <div style={{maxHeight: 160, overflow: 'auto'}}>
                                    {draft.shapes.map((h, i) => (
                                        <div key={i} style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                                            <small>
                                                {KIND[h.t]} {describe(h)}
                                            </small>
                                            <button title="Vorm verwijderen" onClick={() => set({shapes: draft.shapes.filter((_, j) => j !== i)})}>
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <p>
                            Teken op het raster van 24×24 (kies de rastergrootte hierboven). De aansluitlijn van het schema komt op de middenlijn (y = 12, rood): laat minstens één vorm die lijn
                            snijden.
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
