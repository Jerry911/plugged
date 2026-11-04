// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The "Project" menu in the top bar: a flyout with name, save, save as, new, load (a nested flyout with the projects stored on the
// server), import and export. Clicking "Project" opens the menu, clicking it again (or outside it, or Escape) closes it.
import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {fetchProjectSummaries} from '../../api/projectApi.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'

const formatSaveMoment = (isoMoment, locale) => {
    const moment = isoMoment ? new Date(isoMoment) : null
    return moment && !isNaN(moment) ? moment.toLocaleString(locale, {dateStyle: 'short', timeStyle: 'short'}) : ''
}
// the stored projects, most recently saved first (projects saved before names and dates existed come last)
const mostRecentFirst = (summaries) =>
    [...summaries].sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.id - b.id)

// small line icons (24x24, stroke = text colour) so the menu items look the same on every system
const MENU_ICONS = {
    save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
    saveas: ['M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z', 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h0'],
    new: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M12 11v6M9 14h6'],
    load: ['M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    import: ['M12 3v12M7 10l5 5 5-5', 'M4 19h16'],
    export: ['M12 15V3M7 8l5-5 5 5', 'M4 19h16'],
    chevron: ['M9 6l6 6-6 6'],
    caret: ['M6 9l6 6 6-6'],
}
const MenuIcon = ({name}) => (
    <svg className="pm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {MENU_ICONS[name].map((path) => (
            <path key={path} d={path} />
        ))}
    </svg>
)

/** The table of stored projects (reloaded whenever `refreshKey` changes). */
export function ProjectList({currentId, refreshKey, onLoad, onDelete}) {
    const {t, locale} = useTranslation()
    const [summaries, setSummaries] = useState(null),
        [failed, setFailed] = useState(false)
    useEffect(() => {
        let live = true
        setFailed(false)
        fetchProjectSummaries()
            .then((list) => live && setSummaries(mostRecentFirst(list)))
            .catch(() => live && setFailed(true))
        return () => {
            live = false
        }
    }, [refreshKey])
    if (failed)
        return (
            <p id="project-list-error" className="pm-note ui">
                {t('projects.listFailed')}
            </p>
        )
    if (!summaries)
        return (
            <p id="project-list-loading" className="pm-note ui">
                {t('projects.listLoading')}
            </p>
        )
    if (!summaries.length)
        return (
            <p id="project-list-empty" className="pm-note ui">
                {t('projects.listEmpty')}
            </p>
        )
    return (
        <table id="project-list" className="plist ui" aria-label={t('projects.storedProjects')}>
            <thead>
                <tr>
                    <th>{t('projects.columns.name')}</th>
                    <th>{t('projects.columns.number')}</th>
                    <th>{t('projects.columns.lastSaved')}</th>
                    <th />
                </tr>
            </thead>
            <tbody>
                {summaries.map((summary) => (
                    <tr key={summary.id} id={'project-row-' + summary.id} className={summary.id === currentId ? 'cur' : ''}>
                        <td className="pm-name">
                            {summary.name || <i>{t('projects.defaultName', {number: summary.id})}</i>}
                            {summary.id === currentId && <small> {t('projects.current')}</small>}
                        </td>
                        <td>{summary.id}</td>
                        <td className="pm-when">{formatSaveMoment(summary.updated, locale)}</td>
                        <td className="pm-acts">
                            <button id={'project-load-' + summary.id} title={t('projects.loadTitle', {number: summary.id})} onClick={() => onLoad(summary.id)}>
                                {t('projects.load')}
                            </button>
                            <button
                                id={'project-delete-' + summary.id}
                                title={t('projects.deleteTitle', {number: summary.id})}
                                aria-label={t('projects.deleteLabel', {name: summary.name || t('projects.defaultName', {number: summary.id})})}
                                className="pm-del"
                                onClick={() => onDelete(summary)}
                            >
                                🗑
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

const SUBMENU_WIDTH = 480 // room the project list needs next to the menu

export default function ProjectMenu({name, onNameChange, projectId, refreshKey, onSave, onSaveAs, onNew, onLoad, onDelete, onImport, onExport}) {
    const {t} = useTranslation()
    const [open, setOpen] = useState(false),
        [listOpen, setListOpen] = useState(false), // the nested "Laden" flyout
        [alignRight, setAlignRight] = useState(false), // menu would run off the right edge of the window: align it to the button's right edge
        [listSide, setListSide] = useState('left'), // where the nested flyout goes: left or right of the menu, or inline when there is no room
        root = useRef(),
        menu = useRef(),
        menuButton = useRef()
    const close = () => {
        setOpen(false)
        setListOpen(false)
    }
    // a menu item does its job and the menu goes away, like a Windows menu
    const closeAndRun = (action) => () => {
        close()
        action()
    }

    // while open: a click or focus outside the menu, or Escape, closes it
    useEffect(() => {
        if (!open) return
        const onOutside = (event) => !root.current?.contains(event.target) && close()
        const onEscape = (event) => {
            if (event.key !== 'Escape') return
            close()
            menuButton.current?.focus()
        }
        // capture: the drawing panes may stop the event before it bubbles up to the document
        document.addEventListener('pointerdown', onOutside, true)
        document.addEventListener('focusin', onOutside)
        document.addEventListener('keydown', onEscape)
        return () => {
            document.removeEventListener('pointerdown', onOutside, true)
            document.removeEventListener('focusin', onOutside)
            document.removeEventListener('keydown', onEscape)
        }
    }, [open])
    useLayoutEffect(() => {
        if (open) setAlignRight(menu.current.getBoundingClientRect().right > window.innerWidth - 8)
    }, [open])
    useLayoutEffect(() => {
        if (!listOpen) return
        const box = menu.current.getBoundingClientRect()
        setListSide(box.left >= SUBMENU_WIDTH ? 'left' : window.innerWidth - box.right >= SUBMENU_WIDTH ? 'right' : 'inline')
    }, [listOpen, alignRight])

    // arrow keys walk through the items
    const onKeyDown = (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        const items = [...menu.current.querySelectorAll('.pm-list > li > .pm-item')],
            focused = items.indexOf(document.activeElement)
        event.preventDefault()
        const next = event.key === 'ArrowDown' ? (focused + 1) % items.length : (focused < 1 ? items.length : focused) - 1
        items[next]?.focus()
    }
    const menuItem = (id, icon, label, action, {hint, ...attributes} = {}) => (
        <li role="none">
            <button id={id} role="menuitem" className="pm-item" onClick={action} {...attributes}>
                <MenuIcon name={icon} />
                <span className="pm-label">{label}</span>
                {hint && <kbd>{hint}</kbd>}
            </button>
        </li>
    )

    return (
        <div className="pm" ref={root}>
            <button
                id="tab-project"
                ref={menuButton}
                className={open ? 'on' : ''}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls="project-menu"
                title={t('projects.menuTitle')}
                onClick={() => (open ? close() : setOpen(true))}
            >
                {t('projects.menu')} <MenuIcon name="caret" />
            </button>
            {open && (
                <div id="project-menu" ref={menu} className={'pm-menu ui' + (alignRight ? ' end' : '')} onKeyDown={onKeyDown}>
                    <div className="pm-head">
                        <label htmlFor="project-name">{t('projects.name')}</label>
                        <input
                            id="project-name"
                            value={name || ''}
                            placeholder={t('projects.defaultName', {number: projectId})}
                            maxLength={255}
                            onChange={(event) => onNameChange(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && closeAndRun(onSave)()}
                        />
                        <small id="project-number">{t('projects.number', {number: projectId})}</small>
                    </div>
                    <ul className="pm-list" role="menu" aria-label={t('projects.menu')}>
                        {menuItem('btn-save', 'save', t('projects.save'), closeAndRun(onSave), {title: t('projects.saveTitle'), hint: 'Ctrl+S'})}
                        {menuItem('btn-saveas', 'saveas', t('projects.saveAs'), closeAndRun(onSaveAs), {title: t('projects.saveAsTitle')})}
                        {menuItem('btn-new', 'new', t('projects.new'), closeAndRun(onNew), {title: t('projects.newTitle')})}
                        <li role="separator" className="pm-sepline" />
                        <li role="none" className="pm-has-sub">
                            <button
                                id="btn-load"
                                role="menuitem"
                                aria-haspopup="true"
                                aria-expanded={listOpen}
                                className={'pm-item' + (listOpen ? ' active' : '')}
                                title={t('projects.loadMenuTitle')}
                                onClick={() => setListOpen((isOpen) => !isOpen)}
                            >
                                <MenuIcon name="load" />
                                <span className="pm-label">{t('projects.load')}</span>
                                <MenuIcon name="chevron" />
                            </button>
                            {listOpen && (
                                <div className={'pm-sub ' + listSide}>
                                    <ProjectList currentId={projectId} refreshKey={refreshKey} onLoad={(id) => (close(), onLoad(id))} onDelete={onDelete} />
                                </div>
                            )}
                        </li>
                        <li role="separator" className="pm-sepline" />
                        {menuItem('btn-import', 'import', t('projects.import'), closeAndRun(onImport), {title: t('projects.importTitle')})}
                        {menuItem('btn-export', 'export', t('projects.export'), closeAndRun(onExport), {title: t('projects.exportTitle')})}
                    </ul>
                </div>
            )}
        </div>
    )
}
