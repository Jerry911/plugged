// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Symbol catalog: menu with all symbols on the left, the selected symbol (name, category, allowed parents, drawing) on the right.
// The symbols come from the backend: standard ones (can be edited and restored to the standard drawing) and the user's own ones.
import {useEffect, useState} from 'react'
import {Sym} from './symbols'
import {uid} from './util'

const TOOLS = {line: 'Lijn', circle: 'Cirkel (midden, rand)', rect: 'Rechthoek', arc: 'Halve cirkel (midden, rand)', text: 'Tekst'}
// where a symbol comes from, for the label above the drawing
const origin = (c) => (c.builtin ? (c.modified ? 'Standaardsymbool, aangepast' : 'Standaardsymbool') : 'Eigen symbool')
export default function Componenten({lib, onSave, onRemove, onReset, onRestoreAll, onMakeStandard, onTemplate}) {
    const [draft, setDraft] = useState(null),
        [orig, setOrig] = useState(null),
        [q, setQ] = useState(''),
        [tool, setTool] = useState('line'),
        [grid, setGrid] = useState(1),
        [a, setA] = useState(null),
        [hover, setHover] = useState(null),
        [msg, setMsg] = useState('')
    const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(orig),
        isDef = !!draft?.builtin,
        known = lib.some((c) => draft && c.k === draft.k)
    const open = (c, fresh = false) => {
        if (dirty && !window.confirm('Niet-opgeslagen wijzigingen gaan verloren. Doorgaan?')) return
        const d = {...c, parents: [...c.parents], shapes: [...c.shapes]}
        setDraft(d)
        setOrig(fresh ? null : d)
        setA(null)
        setMsg('')
    }
    const set = (o) => {
        setDraft({...draft, ...o})
        setMsg('')
    }
    const sn = (v) => Math.round(Math.round(v / grid) * grid * 100) / 100
    // mouse position on the drawing, snapped to the grid
    const pt = (e) => {
        const s = e.currentTarget,
            m = s.createSVGPoint()
        m.x = e.clientX
        m.y = e.clientY
        const p = m.matrixTransform(s.getScreenCTM().inverse())
        return {x: sn(p.x), y: sn(p.y)}
    }
    // the shape of the active tool from the first click (a) to the point (x, y): used for the preview and for the final shape
    const build = (x, y) => {
        const r = Math.max(grid, sn(Math.hypot(x - a.x, y - a.y))),
            ang = Math.round((Math.atan2(y - a.y, x - a.x) * 180) / Math.PI)
        return tool === 'line'
            ? {t: 'line', x1: a.x, y1: a.y, x2: x, y2: y}
            : tool === 'circle'
                ? {t: 'circle', cx: a.x, cy: a.y, r}
                : tool === 'arc'
                    ? {t: 'arc', cx: a.x, cy: a.y, r, a1: ang - 90, a2: ang + 90}
                    : {t: 'rect', x: Math.min(a.x, x), y: Math.min(a.y, y), w: Math.abs(x - a.x) || grid, h: Math.abs(y - a.y) || grid}
    }
    const click = (e) => {
        const {x, y} = pt(e)
        if (tool === 'text') {
            const t = prompt('Tekst')
            if (t) set({shapes: [...draft.shapes, {t: 'text', x, y, s: t}]})
            return
        }
        if (!a) return setA({x, y}) // first click: the shape follows the mouse
        set({shapes: [...draft.shapes, build(x, y)]}) // second click: finalize it on the grid
        setA(null)
    }
    const move = (e) => {
        const p = pt(e)
        setHover((h) => (h && h.x === p.x && h.y === p.y ? h : p))
    }
    // Escape cancels the shape that is being drawn
    useEffect(() => {
        const esc = (e) => e.key === 'Escape' && setA(null)
        addEventListener('keydown', esc)
        return () => removeEventListener('keydown', esc)
    }, [])
    const create = async () => {
        const t = await onTemplate()
        if (!t) return alert('Nieuw component niet mogelijk: de backend is niet bereikbaar.')
        open(t, true)
    }
    // saves the draft; resolves to the symbol the backend answered with (null when it was not valid or not accepted)
    const store = async () => {
        if (!draft.name.trim() || !draft.shapes.length) {
            alert('Geef een naam en teken minstens één vorm.')
            return null
        }
        const s = await onSave({...draft, name: draft.name.trim(), cat: draft.cat.trim() || 'Eigen'})
        if (!s) setMsg('Niet opgeslagen: de backend is niet bereikbaar of weigerde het symbool')
        return s
    }
    const save = async () => {
        const s = await store()
        if (!s) return
        setDraft(s)
        setOrig(s)
        setMsg('Opgeslagen ✓')
    }
    // the current drawing of a standard symbol becomes its new standard (what "Standaard herstellen" goes back to)
    const makeStandard = async () => {
        if (
            !window.confirm(
                `Let op: de huidige tekening van '${draft.name}' wordt de nieuwe standaard. 'Standaard herstellen' en 'Alle standaard herstellen' zetten dit symbool daarna terug naar deze tekening in plaats van naar de oorspronkelijke. Doorgaan?`,
            )
        )
            return
        if (dirty && !(await store())) return
        const s = await onMakeStandard(draft.k)
        if (!s) return setMsg('Niet als standaard ingesteld: de backend is niet bereikbaar')
        setDraft({...s, parents: [...s.parents], shapes: [...s.shapes]})
        setOrig(s)
        setMsg('Als nieuwe standaard ingesteld ✓')
    }
    const remove = async () => {
        if (!window.confirm(`'${draft.name}' verwijderen? Projecten die dit component gebruiken tonen het dan als "Aansluiting net".`)) return
        await onRemove(draft.k)
        setDraft(null)
        setOrig(null)
    }
    const reset = async () => {
        const d = await onReset(draft.k)
        if (!d) return setMsg('Niet hersteld: de backend is niet bereikbaar')
        setDraft({...d, parents: [...d.parents], shapes: [...d.shapes]})
        setOrig(d)
        setMsg('Standaard hersteld ✓')
    }
    const restoreAll = async () => {
        if (!window.confirm('Alle standaardsymbolen terugzetten naar de standaardtekening? Je eigen aanpassingen aan standaardsymbolen gaan verloren; je eigen symbolen blijven.')) return
        if (!(await onRestoreAll())) return setMsg('Niet hersteld: de backend is niet bereikbaar')
        setDraft(null)
        setOrig(null)
        setMsg('Alle standaardsymbolen hersteld ✓')
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
                <button onClick={create}>＋ Nieuw component</button>
                <button title="Zet alle standaardsymbolen terug naar de standaardtekening (eigen symbolen blijven)" onClick={restoreAll}>
                    Alle standaard herstellen
                </button>
                <div className="complist">
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
                                            {t.builtin && t.modified ? ' ✎' : ''}
                                        </button>
                                    ))}
                                </details>
                            )
                        )
                    })}
                </div>
            </div>
            <div className="main">
                {!draft ? (
                    <>
                        <p>Kies links een component om te bekijken of aan te passen, of maak een nieuw component. Alle componenten verschijnen in het palet van het eendraadschema en op het situatieschema.</p>
                        {msg && <p>{msg}</p>}
                    </>
                ) : (
                    <>
                        <p className="chint">
                            Teken op het raster van 24×24 (kies de rastergrootte rechtsonder in de tekening). De aansluitlijn van het schema komt op de middenlijn (y = 12, rood): laat
                            minstens één vorm die lijn snijden. (Esc = annuleren).
                        </p>
                        <div className="tb cgroup cactions">
                            <button className="accent" onClick={save}>
                                {known ? 'Opslaan' : 'Toevoegen'}
                            </button>
                            <button onClick={() => open({...draft, k: 'custom:' + uid(), name: draft.name + ' (kopie)', builtin: false, modified: false, v: 0}, true)}>
                                Dupliceer
                            </button>
                            <button title="Laatste vorm ongedaan maken" onClick={() => set({shapes: draft.shapes.slice(0, -1)})}>
                                ↶
                            </button>
                            <button onClick={() => set({shapes: []})}>Leegmaken</button>
                            {dirty && <span>● niet opgeslagen</span>}
                            {msg && <span>{msg}</span>}
                            <small style={{marginLeft: 'auto'}}>{origin(draft)}</small>
                        </div>
                        <div className="cwork">
                            <div className="ctools">
                                <div className="cgroup">
                                    <b>Tekenen</b>
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
                                </div>
                                {(isDef || (known && !isDef)) && (
                                    <div className="cgroup">
                                        <b>Component</b>
                                        {isDef && (
                                            <>
                                                <button disabled={!draft.modified && !dirty} onClick={reset}>
                                                    Standaard herstellen
                                                </button>
                                                <button
                                                    className="danger cdanger"
                                                    disabled={!draft.modified && !dirty}
                                                    title="Maak de huidige tekening de nieuwe standaard (overschrijft de standaardtekening)"
                                                    onClick={makeStandard}
                                                >
                                                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                                        <path d="M12 3 2 21h20z" />
                                                        <path d="M12 10v5M12 18v.01" />
                                                    </svg>
                                                    Maak standaard
                                                </button>
                                            </>
                                        )}
                                        {known && !isDef && (
                                            <button className="danger" onClick={remove}>
                                                Verwijder
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="cdraw">
                                <svg viewBox="0 0 24 24" onClick={click} onMouseMove={move} onMouseLeave={() => setHover(null)}>
                                    <defs>
                                        <pattern id="cgrid" width={grid} height={grid} patternUnits="userSpaceOnUse">
                                            <path d={`M${grid} 0H0V${grid}`} fill="none" stroke="#bbb" strokeWidth=".04" />
                                        </pattern>
                                        <pattern id="cgridmajor" width="6" height="6" patternUnits="userSpaceOnUse">
                                            <path d="M6 0H0V6" fill="none" stroke="#888" strokeWidth=".07" />
                                        </pattern>
                                    </defs>
                                    <rect x="0" y="0" width="24" height="24" fill="url(#cgrid)" />
                                    <rect x="0" y="0" width="24" height="24" fill="url(#cgridmajor)" />
                                    <line x1="0" y1="12" x2="24" y2="12" stroke="#f9b" strokeWidth=".1" />
                                    <Sym shapes={draft.shapes} x={12} y={12} s={24} w={0.6} />
                                    {a && hover && tool !== 'text' && (
                                        <g opacity=".75" strokeDasharray=".6 .4" pointerEvents="none">
                                            <Sym shapes={[build(hover.x, hover.y)]} x={12} y={12} s={24} w={0.5} stroke="#0a6cff" />
                                        </g>
                                    )}
                                    {hover && <circle cx={hover.x} cy={hover.y} r=".25" fill="#0a6cff" pointerEvents="none" />}
                                    {a && <circle cx={a.x} cy={a.y} r=".4" fill="red" />}
                                </svg>
                                <div className="ui gridsel">
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
                                </div>
                            </div>
                            <div className="cinfo">
                                <b>Voorbeeld</b>
                                <div style={{display: 'flex', gap: 10, alignItems: 'center', margin: '6px 0'}}>
                                    {[20, 32, 46].map((s) => (
                                        <svg key={s} width={s + 4} height={s + 4} viewBox={`0 0 ${s + 4} ${s + 4}`}>
                                            <Sym shapes={draft.shapes} x={(s + 4) / 2} y={(s + 4) / 2} s={s} />
                                        </svg>
                                    ))}
                                </div>
                                <div className="cfields">
                                    <label>
                                        Naam
                                        <input placeholder="Naam component" value={draft.name} onChange={(e) => set({name: e.target.value})} />
                                    </label>
                                    <label>
                                        Categorie
                                        <input placeholder="Categorie" list="comp-cats" value={draft.cat} onChange={(e) => set({cat: e.target.value})} />
                                    </label>
                                    <datalist id="comp-cats">
                                        {cats.map((c) => (
                                            <option key={c} value={c} />
                                        ))}
                                    </datalist>
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
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
