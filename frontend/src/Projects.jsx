// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The "Project" menu in the top bar: a flyout with name, save, save as, new, load (a nested flyout with the projects stored on the
// server), import and export. Clicking "Project" opens the menu, clicking it again (or outside it, or Escape) closes it.
import {useEffect, useLayoutEffect, useRef, useState} from 'react'

const when = (iso) => {
    const d = iso ? new Date(iso) : null
    return d && !isNaN(d) ? d.toLocaleString('nl-BE', {dateStyle: 'short', timeStyle: 'short'}) : ''
}
// the stored projects, most recently saved first (projects saved before names and dates existed come last)
const order = (rows) => [...rows].sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.id - b.id)

// small line icons (24x24, stroke = text colour) so the menu items look the same on every system
const ICONS = {
    save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
    saveas: ['M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z', 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h0'],
    new: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M12 11v6M9 14h6'],
    load: ['M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    import: ['M12 3v12M7 10l5 5 5-5', 'M4 19h16'],
    export: ['M12 15V3M7 8l5-5 5 5', 'M4 19h16'],
    chevron: ['M9 6l6 6-6 6'],
    caret: ['M6 9l6 6 6-6'],
}
const Icon = ({n}) => (
    <svg className="pm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {ICONS[n].map((d) => (
            <path key={d} d={d} />
        ))}
    </svg>
)

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
    if (err) return <p className="pm-note ui">De lijst met projecten kon niet geladen worden.</p>
    if (!rows) return <p className="pm-note ui">Projecten laden…</p>
    if (!rows.length) return <p className="pm-note ui">Er zijn nog geen opgeslagen projecten. Klik op "Opslaan" om dit project te bewaren.</p>
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
                        <td className="pm-name">
                            {r.name || <i>Project {r.id}</i>}
                            {r.id === current && <small> (huidig)</small>}
                        </td>
                        <td>{r.id}</td>
                        <td className="pm-when">{when(r.updated)}</td>
                        <td className="pm-acts">
                            <button title={`Laad project ${r.id}`} onClick={() => onLoad(r.id)}>
                                Laden
                            </button>
                            <button title={`Verwijder project ${r.id}`} aria-label={`Verwijder ${r.name || 'project ' + r.id}`} className="pm-del" onClick={() => onDelete(r)}>
                                🗑
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

const SUB_WIDTH = 480 // room the project list needs next to the menu

export default function Projects({name, onName, pid, refresh, onSave, onSaveAs, onNew, onLoad, onDelete, onImport, onExport}) {
    const [open, setOpen] = useState(false),
        [list, setList] = useState(false), // the nested "Laden" flyout
        [end, setEnd] = useState(false), // menu would run off the right edge of the window: align it to the button's right edge
        [side, setSide] = useState('left'), // where the nested flyout goes: left or right of the menu, or inline when there is no room
        root = useRef(),
        menu = useRef(),
        btn = useRef()
    const close = () => {
        setOpen(false)
        setList(false)
    }
    // a menu item does its job and the menu goes away, like a Windows menu
    const run = (fn) => () => {
        close()
        fn()
    }

    // while open: a click or focus outside the menu, or Escape, closes it
    useEffect(() => {
        if (!open) return
        const away = (e) => !root.current?.contains(e.target) && close()
        const esc = (e) => {
            if (e.key !== 'Escape') return
            close()
            btn.current?.focus()
        }
        // capture: the drawing panes may stop the event before it bubbles up to the document
        document.addEventListener('pointerdown', away, true)
        document.addEventListener('focusin', away)
        document.addEventListener('keydown', esc)
        return () => {
            document.removeEventListener('pointerdown', away, true)
            document.removeEventListener('focusin', away)
            document.removeEventListener('keydown', esc)
        }
    }, [open])
    useLayoutEffect(() => {
        if (open) setEnd(menu.current.getBoundingClientRect().right > window.innerWidth - 8)
    }, [open])
    useLayoutEffect(() => {
        if (!list) return
        const r = menu.current.getBoundingClientRect()
        setSide(r.left >= SUB_WIDTH ? 'left' : window.innerWidth - r.right >= SUB_WIDTH ? 'right' : 'inline')
    }, [list, end])

    // arrow keys walk through the items
    const onKeyDown = (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        const items = [...menu.current.querySelectorAll('.pm-list > li > .pm-item')],
            i = items.indexOf(document.activeElement)
        e.preventDefault()
        items[e.key === 'ArrowDown' ? (i + 1) % items.length : (i < 1 ? items.length : i) - 1]?.focus()
    }
    const item = (id, icon, label, fn, {hint, ...attrs} = {}) => (
        <li role="none">
            <button id={id} role="menuitem" className="pm-item" onClick={fn} {...attrs}>
                <Icon n={icon} />
                <span className="pm-label">{label}</span>
                {hint && <kbd>{hint}</kbd>}
            </button>
        </li>
    )

    return (
        <div className="pm" ref={root}>
            <button
                id="tab-project"
                ref={btn}
                className={open ? 'on' : ''}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls="project-menu"
                title="Opslaan, laden, importeren en exporteren van projecten"
                onClick={() => (open ? close() : setOpen(true))}
            >
                Project <Icon n="caret" />
            </button>
            {open && (
                <div id="project-menu" ref={menu} className={'pm-menu ui' + (end ? ' end' : '')} onKeyDown={onKeyDown}>
                    <div className="pm-head">
                        <label htmlFor="project-name">Projectnaam</label>
                        <input
                            id="project-name"
                            value={name || ''}
                            placeholder={`Project ${pid}`}
                            maxLength={255}
                            onChange={(ev) => onName(ev.target.value)}
                            onKeyDown={(ev) => ev.key === 'Enter' && run(onSave)()}
                        />
                        <small>Project nr {pid}</small>
                    </div>
                    <ul className="pm-list" role="menu" aria-label="Project">
                        {item('btn-save', 'save', 'Opslaan', run(onSave), {title: 'Bewaar dit project op de server (Ctrl+S)', hint: 'Ctrl+S'})}
                        {item('btn-saveas', 'saveas', 'Opslaan als…', run(onSaveAs), {title: 'Bewaar een kopie als nieuw project'})}
                        {item('btn-new', 'new', 'Nieuw', run(onNew), {title: 'Begin een nieuw, leeg project'})}
                        <li role="separator" className="pm-sepline" />
                        <li role="none" className="pm-has-sub">
                            <button
                                id="btn-load"
                                role="menuitem"
                                aria-haspopup="true"
                                aria-expanded={list}
                                className={'pm-item' + (list ? ' active' : '')}
                                title="Toon de opgeslagen projecten"
                                onClick={() => setList((v) => !v)}
                            >
                                <Icon n="load" />
                                <span className="pm-label">Laden</span>
                                <Icon n="chevron" />
                            </button>
                            {list && (
                                <div className={'pm-sub ' + side}>
                                    <ProjectList current={pid} refresh={refresh} onLoad={(id) => (close(), onLoad(id))} onDelete={onDelete} />
                                </div>
                            )}
                        </li>
                        <li role="separator" className="pm-sepline" />
                        {item('btn-import', 'import', 'Importeren', run(onImport), {title: 'Importeer een projectbestand (.json) of een .eds-bestand (eendraadschema.goethals-jacobs.be)'})}
                        {item('btn-export', 'export', 'Exporteren', run(onExport), {title: 'Exporteer als projectbestand (.json) of als .eds-bestand'})}
                    </ul>
                </div>
            )}
        </div>
    )
}
