// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useMemo, useRef, useState} from 'react'
import OneLineSchema from './OneLineSchema.jsx'
import SituationSchema from './SituationSchema.jsx'
import Components from './Components.jsx'
import {useLibrary} from './library.jsx'
import {FooterDialog} from './Footer'
import {useHistory} from './history.jsx'
import {defaultTree} from './boardModel.jsx'
import {importEds} from './eds.jsx'
import Verify from './Verify'
import {verify} from './rules.jsx'
import {AllSheets, makePdf} from './Export'
import {reid, uid, unplacedOf} from './util.jsx'
import {setLibrary} from './symbols'

const init = {
    footer: {datum: new Date().toISOString().slice(0, 10), schaal: '1:50', rev: 'A'},
    een: [{id: 'e1', name: 'Blad 1', tree: defaultTree()}],
    sit: [{id: 's1', name: 'Plattegrond 1', walls: [], items: []}],
    custom: [],
}
const norm = (d) =>
    d.een
        ? {...init, ...d}
        : {
            ...init,
            footer: {...init.footer, ...d.footer},
            custom: d.custom || [],
            een: [{id: uid(), name: 'Blad 1', tree: d.tree || []}],
            sit: [
                {
                    id: uid(),
                    name: 'Plattegrond 1',
                    walls: d.plan?.walls || [],
                    items: (d.plan?.items || []).map((i) => ({...i, r: i.r ?? i.a ?? 0})),
                },
            ],
        }
const PageBar = ({p, setP, k, idx, setIdx}) => {
    const L = p[k],
        set = (l) => setP({...p, [k]: l}),
        sw = (d) => {
            const a = [...L]
            ;[a[idx], a[idx + d]] = [a[idx + d], a[idx]]
            set(a)
            setIdx(idx + d)
        }
    const mk = () =>
        k === 'een'
            ? {id: uid(), name: 'Blad ' + (L.length + 1), tree: defaultTree()}
            : {id: uid(), name: 'Plattegrond ' + (L.length + 1), walls: [], items: []}
    const dup = () => {
        const g = L[idx],
            c =
                k === 'een'
                    ? {...g, tree: reid(g.tree)}
                    : {...g, walls: g.walls.map((w) => ({...w, id: uid()})), items: g.items.map((i) => ({...i, id: uid()}))}
        set([...L.slice(0, idx + 1), {...c, id: uid(), name: g.name + ' (kopie)'}, ...L.slice(idx + 1)])
        setIdx(idx + 1)
    }
    return (
        <div className="tb ui" style={{padding: '6px 10px', display: 'flex', gap: 4, flexWrap: 'wrap'}}>
            {L.map((g, i) => (
                <button key={g.id} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)}>
                    {g.name}
                </button>
            ))}
            <button
                onClick={() => {
                    set([...L, mk()])
                    setIdx(L.length)
                }}
            >
                ＋ blad
            </button>
            <button
                onClick={() => {
                    const n = prompt('Naam', L[idx].name)
                    n && set(L.map((g, i) => (i === idx ? {...g, name: n} : g)))
                }}
            >
                ✎
            </button>
            <button onClick={dup}>⧉</button>
            <button disabled={idx < 1} onClick={() => sw(-1)}>
                ◀
            </button>
            <button disabled={idx >= L.length - 1} onClick={() => sw(1)}>
                ▶
            </button>
            <button
                disabled={L.length < 2}
                onClick={() => {
                    set(L.filter((_, i) => i !== idx))
                    setIdx(Math.max(0, idx - 1))
                }}
            >
                🗑
            </button>
        </div>
    )
}
// the editor needs the symbol library: show it only when the backend has delivered it
export default function App() {
    const library = useLibrary()
    if (library.status === 'loading') return <p className="ui" style={{padding: 16}}>Symbolen laden…</p>
    if (library.status === 'error')
        return (
            <div className="ui" style={{padding: 16}}>
                <p>De symbolen konden niet geladen worden: de backend is niet bereikbaar.</p>
                <button onClick={library.reload}>Opnieuw proberen</button>
            </div>
        )
    return <Editor library={library} />
}
function Editor({library}) {
    const {p, setP, reset, undo, redo, canUndo, canRedo} = useHistory(init),
        [footer, setFooter] = useState(null),
        [tab, setTab] = useState(0),
        [msg, setMsg] = useState(''),
        [ei, setEi] = useState(0),
        [si, setSi] = useState(0),
        [pid, setPid] = useState(1),
        [job, setJob] = useState(null),
        [showV, setShowV] = useState(false),
        [focus, setFocus] = useState(null),
        ref = useRef()
    const {lib, save: saveComp, remove: removeComp, reset: resetComp, makeStandard, restoreAll, template} = library
    setLibrary(lib)
    const issues = useMemo(() => verify(p), [p, lib]),
        ec = issues.filter((i) => i.level === 'error').length,
        wc = issues.filter((i) => i.level === 'warn').length
    const openFooter = (k) => setFooter({k, n: Date.now()})
    const go = (i) => {
        if (i.rule === 'footer') return openFooter('titel')
        if (i.rule.startsWith('plan.')) return setTab(1)
        setTab(0)
        if (i.page != null) setEi(i.page)
        if (i.nodeId) setFocus({id: i.nodeId, n: Date.now()})
    }
    useEffect(() => {
        // components stored inside a project (old projects, JSON import) move into the shared library
        if (!p.custom?.length) return
        p.custom.forEach((c) => {
            const k = 'custom:' + c.id
            if (!lib.some((x) => x.k === k))
                saveComp({k, name: c.name, cat: c.cat || 'Eigen', parents: c.parents, place: c.place !== false, shapes: c.shapes})
        })
        setP((cur) => ({...cur, custom: []}))
    }, [p.custom])
    useEffect(() => {
        fetch('/api/projects/' + pid)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (d) {
                    reset(norm(d))
                    setEi(0)
                    setSi(0)
                }
            })
            .catch(() => {})
    }, [pid])
    useEffect(() => {
        if (!job) return
        const currentJob = job
        ;(async () => {
            try {
                if (currentJob === 'pdf') await makePdf(p, ref.current)
                else window.print()
            } catch (e) {
                window.alert('Export mislukt: ' + e.message)
            } finally {
                setJob(null)
            }
        })()
    }, [job, p])
    useEffect(() => {
        const f = (e) => {
            if (!(e.ctrlKey || e.metaKey)) return
            const k = e.key.toLowerCase()
            if (k === 'z' && !e.shiftKey) {
                e.preventDefault()
                undo()
            } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
                e.preventDefault()
                redo()
            }
        }
        addEventListener('keydown', f)
        return () => removeEventListener('keydown', f)
    }, [undo, redo])
    const save = async () => {
        const r = await fetch('/api/projects/' + pid, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(p),
        })
        setMsg(r.ok ? 'Opgeslagen ✓' : 'Fout bij opslaan')
    }
    const importEdsText = (t) => {
        try {
            const r = importEds(t)
            // the situatieschema is not imported: keep the pages and walls, but drop symbols that pointed to the replaced nodes
            setP((cur) => ({...cur, een: r.een, sit: cur.sit.map((g) => ({...g, items: []})), footer: {...cur.footer, ...r.footer}}))
            setEi(0)
            setSi(0)
            setMsg(
                `EDS geïmporteerd: ${r.stats.circuits} kringen, ${r.stats.nodes} elementen${r.stats.unknown.length ? ` (onbekend: ${r.stats.unknown.join(', ')})` : ''}`,
            )
        } catch (e) {
            window.alert(e.message)
        }
    }
    const exportJson = () => {
        const a = document.createElement('a')
        // own components travel along with the project file (as `custom`) so it opens on another installation
        const custom = lib
            .filter((c) => !c.builtin)
            .map((c) => ({id: c.k.replace(/^custom:/, ''), name: c.name, cat: c.cat, parents: c.parents, place: c.place, shapes: c.shapes}))
        a.href = URL.createObjectURL(new Blob([JSON.stringify({...p, custom})], {type: 'application/json'}))
        a.download = (p.footer.titel || 'schema') + '.json'
        a.click()
    }
    const tabs = ['Eendraadschema', 'Situatieschema', 'Components'],
        un = unplacedOf(p).length,
        e = Math.min(ei, p.een.length - 1),
        s = Math.min(si, p.sit.length - 1)
    return (
        <>
            <div className="bar ui">
                {tabs.map((t, i) => (
                    <button key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
                        {t}
                    </button>
                ))}
                {un > 0 && <span title="Niet geplaatst op situatieschema">⚠ {un}</span>}
                <button title="Ongedaan maken (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
                    ↶ Ongedaan
                </button>
                <button title="Opnieuw (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
                    ↷ Opnieuw
                </button>
                <button className="accent" onClick={() => openFooter()}>
                    ✎ Kaderinfo
                </button>
                <span style={{flex: 1}} />
                {msg}
                <input
                    type="number"
                    min="1"
                    value={pid}
                    onChange={(ev) => setPid(+ev.target.value || 1)}
                    style={{width: 48}}
                    title="Project-nr"
                />
                <button onClick={save}>Opslaan</button>
                <button title="Exporteer een projectbestand (.json)" onClick={exportJson}>JSON ↑</button>
                <span>
                    <input
                        type="file"
                        accept=".json"
                        hidden
                        onChange={(ev) => ev.target.files[0]?.text().then((t) => setP(norm(JSON.parse(t))))}
                    />
                    <button
                        title="Importeer een projectbestand (.json)"
                        onClick={(ev) => ev.currentTarget.previousElementSibling.click()}>JSON ↓</button>
                </span>
                <button onClick={() => setShowV((v) => !v)}>
                    Controleer{ec ? ` ✖${ec}` : ''}
                    {wc ? ` ⚠${wc}` : ''}
                </button>
                <span>
                    <input
                        type="file"
                        accept=".eds"
                        hidden
                        onChange={(ev) => {
                            const f = ev.target.files[0]
                            f && f.text().then(importEdsText)
                            ev.target.value = ''
                        }}
                    />
                    <button title="Importeer een .eds-bestand" onClick={(ev) => ev.currentTarget.previousElementSibling.click()}>
                        Importeer
                    </button>
                </span>
                <button onClick={() => setJob('pdf')}>PDF</button>
                <button onClick={() => setJob('print')}>Afdrukken</button>
            </div>
            {showV && <Verify issues={issues} onGo={go} onClose={() => setShowV(false)} />}
            {footer && <FooterDialog key={footer.n} p={p} setP={setP} focus={footer.k} onClose={() => setFooter(null)} />}
            <div className="ui">
                {tab === 0 && (
                    <>
                        <PageBar p={p} setP={setP} k="een" idx={e} setIdx={setEi} />
                        <OneLineSchema key={p.een[e].id} p={p} setP={setP} idx={e} focus={focus} onFooter={openFooter} />
                    </>
                )}
                {tab === 1 && (
                    <>
                        <PageBar p={p} setP={setP} k="sit" idx={s} setIdx={setSi} />
                        <SituationSchema key={p.sit[s].id} p={p} setP={setP} idx={s} onFooter={openFooter} />
                    </>
                )}
                {tab === 2 && <Components lib={lib} onSave={saveComp} onRemove={removeComp} onReset={resetComp} onMakeStandard={makeStandard} onRestoreAll={restoreAll} onTemplate={template} />}
            </div>
            {job && (
                <div ref={ref}>
                    <AllSheets p={p} />
                </div>
            )}
        </>
    )
}
