// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The "Project" tab: name, save, load (list of the projects stored on the server), import and export of the project.
import {useEffect, useState} from 'react'

const when = (iso) => {
    const d = iso ? new Date(iso) : null
    return d && !isNaN(d) ? d.toLocaleString('nl-BE', {dateStyle: 'short', timeStyle: 'short'}) : ''
}
// the stored projects, most recently saved first (projects saved before names and dates existed come last)
const order = (rows) => [...rows].sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.id - b.id)

export function ProjectList({current, refresh, onLoad, onDelete}) {
    const [rows, setRows] = useState(null),
        [err, setErr] = useState(false)
    useEffect(() => {
        let live = true
        setErr(false)
        fetch('/api/projects/summaries')
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('list'))))
            .then((d) => live && setRows(Array.isArray(d) ? order(d) : []))
            .catch(() => live && setErr(true))
        return () => {
            live = false
        }
    }, [refresh])
    if (err) return <p className="ui" style={{padding: '8px 12px'}}>De lijst met projecten kon niet geladen worden.</p>
    if (!rows) return <p className="ui" style={{padding: '8px 12px'}}>Projecten laden…</p>
    if (!rows.length) return <p className="ui" style={{padding: '8px 12px'}}>Er zijn nog geen opgeslagen projecten. Klik op "Opslaan" om dit project te bewaren.</p>
    return (
        <table className="plist ui" aria-label="Opgeslagen projecten">
            <thead>
                <tr>
                    <th>Naam</th>
                    <th>Nr</th>
                    <th>Laatst opgeslagen</th>
                    <th />
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr key={r.id} className={r.id === current ? 'cur' : ''}>
                        <td>
                            {r.name || <i>Project {r.id}</i>}
                            {r.id === current && <small> (huidig)</small>}
                        </td>
                        <td>{r.id}</td>
                        <td>{when(r.updated)}</td>
                        <td>
                            <button title={`Laad project ${r.id}`} onClick={() => onLoad(r.id)}>
                                Laden
                            </button>
                            <button title={`Verwijder project ${r.id}`} aria-label={`Verwijder ${r.name || 'project ' + r.id}`} onClick={() => onDelete(r)}>
                                🗑
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

export default function Projects({name, onName, pid, refresh, onSave, onSaveAs, onNew, onLoad, onDelete, onImport, onExport}) {
    const [list, setList] = useState(false)
    return (
        <>
            <div className="tb ui" style={{padding: '6px 10px', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center'}}>
                <input
                    id="project-name"
                    value={name || ''}
                    placeholder={`Projectnaam (project ${pid})`}
                    aria-label="Projectnaam"
                    maxLength={255}
                    onChange={(ev) => onName(ev.target.value)}
                    style={{width: 240}}
                />
                <button id="btn-save" title="Bewaar dit project op de server (Ctrl+S)" onClick={onSave}>
                    Opslaan
                </button>
                <button id="btn-saveas" title="Bewaar een kopie als nieuw project" onClick={onSaveAs}>
                    Opslaan als…
                </button>
                <button id="btn-new" title="Begin een nieuw, leeg project" onClick={onNew}>
                    Nieuw
                </button>
                <button id="btn-load" className={list ? 'on' : ''} title="Toon de opgeslagen projecten" onClick={() => setList((v) => !v)}>
                    Laden
                </button>
                <span className="sep" />
                <button id="btn-import" title="Importeer een projectbestand (.json) of een .eds-bestand (eendraadschema.goethals-jacobs.be)" onClick={onImport}>
                    Importeren
                </button>
                <button id="btn-export" title="Exporteer als projectbestand (.json) of als .eds-bestand" onClick={onExport}>
                    Exporteren
                </button>
                <span style={{flex: 1}} />
                <small>Project nr {pid}</small>
            </div>
            {list && <ProjectList current={pid} refresh={refresh} onLoad={onLoad} onDelete={onDelete} />}
        </>
    )
}
