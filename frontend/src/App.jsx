// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useMemo, useRef, useState} from 'react'
import OneWireDiagram from './OneWireDiagram.jsx'
import SituationSchema from './SituationSchema.jsx'
import Components from './Components.jsx'
import Info from './Info.jsx'
import {ExportDialog, IMPORT_ACCEPT, importKind} from './ImportExport.jsx'
import Projects from './Projects.jsx'
import {useLibrary} from './library.jsx'
import {FooterDialog} from './Footer'
import {useHistory} from './history.jsx'
import {defaultTree} from './boardModel.jsx'
import {exportEds, importEds} from './eds.jsx'
import Verify from './Verify'
import {verify} from './rules.jsx'
import {AllSheets, makePdf} from './Export'
import {migrateWaterproof, reid, uid, unplacedOf} from './util.jsx'
import {setLibrary} from './symbols'
import Tour, {markTourSeen, tourSeen} from './Tour.jsx'
import {TOUR_STEPS} from './tourSteps.jsx'

const init = {
    footer: {datum: new Date().toISOString().slice(0, 10), schaal: '1:50', rev: 'A'},
    een: [{id: 'e1', name: 'Blad 1', tree: defaultTree()}],
    sit: [{id: 's1', name: 'Plattegrond 1', walls: [], items: []}],
    custom: [],
}
const treeNodes = (t) => (t || []).flatMap((n) => [n, ...treeNodes(n.children)])
const isEmpty = (d) =>
    !d.een.some((g) => treeNodes(g.tree).some((n) => n.type === 'kring')) && !d.sit.some((g) => g.walls.length || g.items.length)
const norm = (d) => migrateWaterproof(normRaw(d))
const normRaw = (d) =>
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
const PageBar = ({p, setP, k, idx, setIdx, verify}) => {
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
        <div className="tb ui" data-tour="pagebar" style={{padding: '6px 10px', display: 'flex', gap: 4, flexWrap: 'wrap'}}>
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
            {verify && (
                <button id="btn-verify" onClick={verify.onToggle}>
                    Controleer{verify.ec ? ` ✖${verify.ec}` : ''}
                    {verify.wc ? ` ⚠${verify.wc}` : ''}
                </button>
            )}
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
        snap = useRef(JSON.stringify(init)), // the project as last saved or loaded: tells whether there are unsaved changes
        [footer, setFooter] = useState(null),
        [tab, setTab] = useState(0),
        [msg, setMsg] = useState(''),
        [ei, setEi] = useState(0),
        [si, setSi] = useState(0),
        [pid, setPid] = useState(1),
        [listKey, setListKey] = useState(0), // bumped after a save or delete so an open project list reloads
        [job, setJob] = useState(null),
        [showV, setShowV] = useState(false),
        [showExport, setShowExport] = useState(false),
        [focus, setFocus] = useState(null),
        [tour, setTour] = useState(false),
        [tourOk, setTourOk] = useState(false), // the project has been fetched and the tour may draw in it
        ref = useRef()
    const {lib, save: saveComp, remove: removeComp, reset: resetComp, makeStandard, restoreAll, template} = library
    setLibrary(lib)
    const issues = useMemo(() => verify(p), [p, lib]),
        ec = issues.filter((i) => i.level === 'error').length,
        wc = issues.filter((i) => i.level === 'warn').length
    const openFooter = (k) => {
        setShowExport(false)
        setFooter({k, n: Date.now()})
    }
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
    // the project that was open last time is not remembered: the editor starts with project 1 (a new project when that does not exist yet)
    useEffect(() => {
        fetch('/api/projects/1')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (d) {
                    const n = norm(d)
                    reset(n)
                    snap.current = JSON.stringify(n)
                    setEi(0)
                    setSi(0)
                    // a new browser that finds real work on the server is not a beginner: the tour does not draw in it by itself
                    setTourOk(isEmpty(n))
                } else setTourOk(true)
            })
            .catch(() => setTourOk(true))
    }, [])
    // first visit: the browser has not seen the tour yet (see Tour.jsx) and the project is fetched, so the tour does not jump around
    useEffect(() => {
        if (tourOk && !tourSeen()) setTour(true)
    }, [tourOk])
    const closeTour = (how) => {
        markTourSeen(how)
        setTour(false)
    }
    // started from Info: the tour draws in the open project, so ask first when there is work in it
    const startTour = () => {
        if (isEmpty(p) || window.confirm('De rondleiding tekent mee in je huidige project (een kring, muren en een deur). Toch starten? Je kan daarna een nieuw project beginnen.')) setTour(true)
    }
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
    const dirty = () => JSON.stringify(p) !== snap.current
    const sure = () => !dirty() || window.confirm('Er zijn niet-opgeslagen wijzigingen in dit project. Toch doorgaan?')
    // the next free project number
    const nextId = async () => {
        try {
            const ids = await (await fetch('/api/projects')).json()
            return Math.max(0, ...(Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite)) + 1
        } catch {
            return pid + 1
        }
    }
    const putProject = async (id, doc) => {
        const name = (doc.name || '').trim()
        const r = await fetch('/api/projects/' + id + (name ? '?name=' + encodeURIComponent(name) : ''), {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(doc),
        })
        if (r.ok) {
            snap.current = JSON.stringify(doc)
            setListKey((k) => k + 1)
        }
        return r.ok
    }
    const save = async () => setMsg((await putProject(pid, p)) ? 'Opgeslagen ✓' : 'Fout bij opslaan')
    const saveAs = async () => {
        const n = window.prompt('Naam van het nieuwe project', (p.name || p.footer?.titel || '').trim())
        if (n === null) return
        const id = await nextId(),
            doc = {...p, name: n.trim()}
        if (await putProject(id, doc)) {
            setP(doc)
            setPid(id)
            setMsg(`Opgeslagen als project ${id} ✓`)
            snap.current = JSON.stringify(doc)
        } else setMsg('Fout bij opslaan')
    }
    const newProject = async () => {
        if (!sure()) return
        const id = await nextId(),
            n = {...init, footer: {...init.footer, datum: new Date().toISOString().slice(0, 10)}}
        reset(n)
        snap.current = JSON.stringify(n)
        setPid(id)
        setEi(0)
        setSi(0)
        setTab(0)
        setMsg(`Nieuw project (nr ${id}); klik op Opslaan om het te bewaren`)
    }
    const loadProject = async (id) => {
        if (!sure()) return
        try {
            const r = await fetch('/api/projects/' + id)
            if (!r.ok) return setMsg(`Project ${id} niet gevonden`)
            const n = norm(await r.json())
            reset(n)
            snap.current = JSON.stringify(n)
            setPid(id)
            setEi(0)
            setSi(0)
            setTab(0)
            setMsg(`Project ${id} geladen`)
        } catch {
            setMsg('Fout bij laden')
        }
    }
    const deleteProject = async (r) => {
        if (!window.confirm(`Project '${r.name || 'Project ' + r.id}' definitief verwijderen?`)) return
        const res = await fetch('/api/projects/' + r.id, {method: 'DELETE'})
        setMsg(res.ok ? `Project ${r.id} verwijderd` : 'Fout bij verwijderen')
        setListKey((k) => k + 1)
    }
    useEffect(() => {
        const f = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault()
                save()
            }
        }
        addEventListener('keydown', f)
        return () => removeEventListener('keydown', f)
    }, [p, pid])
    const importEdsText = (t) => {
        try {
            const r = importEds(t)
            // the situatieschema is not imported: keep the pages and walls, but drop symbols that pointed to the replaced nodes
            setP((cur) => ({...cur, een: r.een, sit: cur.sit.map((g) => ({...g, items: []})), footer: {...cur.footer, ...r.footer}}))
            setEi(0)
            setSi(0)
            setTab(0)
            setMsg(
                `EDS geïmporteerd: ${r.stats.circuits} kringen, ${r.stats.nodes} elementen${r.stats.unknown.length ? ` (onbekend: ${r.stats.unknown.join(', ')})` : ''}`,
            )
        } catch (e) {
            window.alert(e.message)
        }
    }
    const importJsonText = (t) => {
        try {
            setP(norm(JSON.parse(t)))
            setEi(0)
            setSi(0)
            setTab(0)
            setMsg('Project geïmporteerd')
        } catch {
            window.alert('Dit is geen geldig projectbestand (.json).')
        }
    }
    // one file picker for both kinds: the extension (or the "EDS" header) decides how the file is read
    const importFile = async (ev) => {
        const f = ev.target.files[0]
        ev.target.value = ''
        if (!f) return
        const t = await f.text()
        if (importKind(f.name, t) === 'eds') importEdsText(t)
        else importJsonText(t)
    }
    const doExport = (type) => {
        setShowExport(false)
        if (type === 'eds') exportEdsFile()
        else exportJson()
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
    const exportEdsFile = () => {
        // symbols without an EDS equivalent (own components, ...) are written as a free consumer named after the symbol
        const r = exportEds(p, Object.fromEntries(lib.map((c) => [c.k, c.name]))),
            a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([r.text], {type: 'text/plain'}))
        a.download = (p.footer.titel || 'schema') + '.eds'
        a.click()
        setMsg(
            `EDS geëxporteerd: ${r.stats.circuits} kringen, ${r.stats.nodes} elementen${r.stats.approx.length ? ` (als vrij element: ${r.stats.approx.join(', ')})` : ''}`,
        )
    }
    const tabs = ['Eendraadschema', 'Situatieschema', 'Components'],
        tabIds = ['een', 'sit', 'comp'],
        un = unplacedOf(p).length,
        e = Math.min(ei, p.een.length - 1),
        s = Math.min(si, p.sit.length - 1)
    return (
        <>
            <div className="bar ui">
                <Projects
                    name={p.name}
                    onName={(name) => setP((cur) => ({...cur, name}))}
                    pid={pid}
                    refresh={listKey}
                    onSave={save}
                    onSaveAs={saveAs}
                    onNew={newProject}
                    onLoad={loadProject}
                    onDelete={deleteProject}
                    onImport={() => document.getElementById('import-input').click()}
                    onExport={() => {
                        setFooter(null)
                        setShowExport((v) => !v)
                    }}
                />
                <span className="sep" />
                {tabs.map((t, i) => (
                    <button key={t} id={'tab-' + tabIds[i]} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
                        {t}
                        {t === 'Situatieschema' && un > 0 && (
                            <span title="Niet geplaatst op situatieschema">
                            {' '}⚠{un}
                        </span>
                        )}
                        {t === 'Eendraadschema' && ec > 0 && (
                            <span title="Fouten in eendraadschema">
                                {' '}✖{ec}
                            </span>
                        )}
                        {t === 'Eendraadschema' && wc > 0 && (
                            <span title="Waarschuwingen in eendraadschema">
                                {' '}⚠{wc}
                            </span>
                        )}
                    </button>
                ))}
                <span className="sep" />
                <button id="btn-undo" title="Ongedaan maken (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
                    ↶ Ongedaan
                </button>
                <button id="btn-redo" title="Opnieuw (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
                    ↷ Opnieuw
                </button>
                <button id="btn-footer" className="accent" onClick={() => openFooter()}>
                    ✎ Kaderinfo
                </button>
                <span style={{flex: 1}}/>
                {msg}
                <input id="import-input" type="file" accept={IMPORT_ACCEPT} hidden onChange={importFile} />
                <span className="sep" />
                <button id="btn-pdf" onClick={() => setJob('pdf')}>PDF</button>
                <button id="btn-print" onClick={() => setJob('print')}>Afdrukken</button>
                <span className="sep" />
                <button id="tab-info" className={tab === 3 ? 'on' : ''} title="Uitleg, veelgestelde vragen, contact" onClick={() => setTab(3)}>
                    ⓘ Info
                </button>
            </div>
            {showExport && <ExportDialog onExport={doExport} onClose={() => setShowExport(false)} />}
            {showV && <Verify issues={issues} onGo={go} onClose={() => setShowV(false)} />}
            {footer && <FooterDialog key={footer.n} p={p} setP={setP} focus={footer.k} onClose={() => setFooter(null)} />}
            <div className="ui">
                {tab === 0 && (
                    <>
                        <PageBar p={p} setP={setP} k="een" idx={e} setIdx={setEi} verify={{ec, wc, onToggle: () => setShowV((v) => !v)}} />
                        <OneWireDiagram key={p.een[e].id} p={p} setP={setP} idx={e} focus={focus} onFocused={() => setFocus(null)} onFooter={openFooter} />
                    </>
                )}
                {tab === 1 && (
                    <>
                        <PageBar p={p} setP={setP} k="sit" idx={s} setIdx={setSi} />
                        <SituationSchema key={p.sit[s].id} p={p} setP={setP} idx={s} onFooter={openFooter} />
                    </>
                )}
                {tab === 3 && <Info onTour={startTour} />}
                {tab === 2 && <Components lib={lib} onSave={saveComp} onRemove={removeComp} onReset={resetComp} onMakeStandard={makeStandard} onRestoreAll={restoreAll} onTemplate={template} />}
            </div>
            {tour && <Tour steps={TOUR_STEPS} ctx={{p, tab, setTab, onNew: newProject}} onClose={closeTour} />}
            {job && (
                <div ref={ref}>
                    <AllSheets p={p} />
                </div>
            )}
        </>
    )
}
