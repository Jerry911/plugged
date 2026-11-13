// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The "Project" menu in the top bar: a flyout with name, save, save as, new, load (a nested flyout with the projects stored on the
// server), import and export. Clicking "Project" opens the menu, clicking it again (or outside it, or Escape) closes it.
import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {fetchHistory, fetchProjectSummaries, fetchShareableGroups, fetchTrash, purgeProject, shareProject, untrashProject} from '../../api/projectApi.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'

const formatSaveMoment = (isoMoment, locale) => {
    const moment = isoMoment ? new Date(isoMoment) : null
    return moment && !isNaN(moment) ? moment.toLocaleString(locale, {dateStyle: 'short', timeStyle: 'short'}) : ''
}

// small line icons (24x24, stroke = text colour) so the menu items look the same on every system
const MENU_ICONS = {
    save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
    saveas: ['M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z', 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h0'],
    new: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M12 11v6M9 14h6'],
    load: ['M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    import: ['M12 3v12M7 10l5 5 5-5', 'M4 19h16'],
    export: ['M12 15V3M7 8l5-5 5 5', 'M4 19h16'],
    chevron: ['M9 6l6 6-6 6'],
    share: ['M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M8 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M2 20c0-3 3-5 6-5s6 2 6 5', 'M14 15.5c.6-.3 1.3-.5 2-.5 3 0 6 2 6 5'],
    caret: ['M6 9l6 6 6-6'],
    history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v4h4', 'M12 7v5l3 2'],
    materials: ['M9 5h11M9 12h11M9 19h11', 'M4 5h.01M4 12h.01M4 19h.01'],
}
const MenuIcon = ({name}) => (
    <svg className="pm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {MENU_ICONS[name].map((path) => (
            <path key={path} d={path} />
        ))}
    </svg>
)

/**
 * Who owns a project and who it is shared with, under its name: "van Alice · gedeeld met Team, Bureau". Nothing for an own project that is not
 * shared.
 */
function ProjectMeta({summary}) {
    const {t} = useTranslation()
    const parts = []
    if (!summary.mine && summary.owner) parts.push(t('projects.ownedBy', {name: summary.owner.name}))
    if (summary.groups?.length) parts.push(t('projects.sharedWith', {groups: summary.groups.map((group) => group.name).join(', ')}))
    return parts.length ? (
        <small id={'project-meta-' + summary.id} className="pm-meta">
            {parts.join(' · ')}
        </small>
    ) : null
}

/** The groups a project is shared with, to tick on and off. `onDone(summary)` after saving, `onClose()` to stop without saving. */
function SharePanel({summary, onDone, onClose}) {
    const {t} = useTranslation()
    const [groups, setGroups] = useState(null),
        [chosen, setChosen] = useState(() => new Set((summary.groups || []).map((group) => group.id))),
        [error, setError] = useState(''),
        [busy, setBusy] = useState(false)
    useEffect(() => {
        let live = true
        fetchShareableGroups()
            .then((list) => {
                // groups an admin shared it with stay visible (and stay ticked) even when the owner is no member of them
                const known = new Set(list.map((group) => group.id))
                live && setGroups([...list, ...(summary.groups || []).filter((group) => !known.has(group.id)).map((group) => ({...group, locked: true}))])
            })
            .catch(() => live && setError(t('projects.shareGroupsFailed')))
        return () => {
            live = false
        }
    }, [])
    const toggle = (id) =>
        setChosen((current) => {
            const next = new Set(current)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    const save = async () => {
        setBusy(true)
        const result = await shareProject(summary.id, [...chosen])
        setBusy(false)
        if (result.ok) onDone(result.summary)
        else setError(result.error || t('projects.shareFailed'))
    }
    return (
        <div id={'project-share-' + summary.id} className="pm-share">
            <b>{t('projects.shareIntro', {name: summary.name || t('projects.defaultName', {number: summary.id})})}</b>
            {groups && !groups.length && <p className="pm-note">{t('projects.shareNoGroups')}</p>}
            {groups?.map((group) => (
                <label key={group.id} className="pm-check">
                    <input
                        type="checkbox"
                        id={'project-share-group-' + group.id}
                        checked={chosen.has(group.id)}
                        disabled={group.locked}
                        onChange={() => toggle(group.id)}
                    />
                    {group.name}
                </label>
            ))}
            {error && (
                <p id="project-share-error" className="pm-note error" role="alert">
                    {error}
                </p>
            )}
            <div className="pm-share-acts">
                <button id="project-share-save" className="accent" disabled={busy || !groups} onClick={save}>
                    {t('common.save')}
                </button>
                <button id="project-share-cancel" onClick={onClose}>
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    )
}

// how the list can be sorted; `recent` first
const SORTS = {
    recent: (a, b) => (b.updated || '').localeCompare(a.updated || '') || a.id - b.id,
    name: (a, b) => (a.name || '').localeCompare(b.name || '', undefined, {sensitivity: 'base'}) || a.id - b.id,
    owner: (a, b) => (a.owner?.name || '').localeCompare(b.owner?.name || '', undefined, {sensitivity: 'base'}) || SORTS.recent(a, b),
    number: (a, b) => a.id - b.id,
}
// a project matches the search when its name, number, owner or one of its groups contains every word typed
const matches = (summary, search) => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return true
    const text = [summary.name, String(summary.id), summary.owner?.name, ...(summary.groups || []).map((group) => group.name)].join(' ').toLowerCase()
    return words.every((word) => text.includes(word))
}

/** The saved versions of a project (newest first); `onRestore(version)` resolves to true when it was restored. */
function HistoryPanel({summary, onRestore, onClose}) {
    const {t, locale} = useTranslation()
    const [versions, setVersions] = useState(null),
        [failed, setFailed] = useState(false),
        [busy, setBusy] = useState(false)
    const load = () =>
        fetchHistory(summary.id)
            .then(setVersions)
            .catch(() => setFailed(true))
    useEffect(() => {
        load()
    }, [summary.id])
    const restore = async (version) => {
        setBusy(true)
        const restored = await onRestore(version)
        setBusy(false)
        if (restored) load()
    }
    return (
        <div id={'project-history-' + summary.id} className="pm-share">
            <b>{t('projects.historyIntro', {name: summary.name || t('projects.defaultName', {number: summary.id})})}</b>
            {failed && <p className="pm-note error">{t('projects.historyFailed')}</p>}
            {versions && !versions.length && <p className="pm-note">{t('projects.historyEmpty')}</p>}
            {versions?.length > 0 && (
                <div className="pm-history">
                    <table>
                        <tbody>
                            {versions.map((version) => (
                                <tr key={version.version} id={'project-version-' + summary.id + '-' + version.version}>
                                    <td>{t('projects.versionNumber', {version: version.version})}</td>
                                    <td>{formatSaveMoment(version.savedAt, locale)}</td>
                                    <td>{version.savedBy || ''}</td>
                                    <td>
                                        {version.current ? (
                                            <small>{t('projects.versionCurrent')}</small>
                                        ) : (
                                            <button
                                                id={'project-version-restore-' + summary.id + '-' + version.version}
                                                disabled={busy}
                                                title={t('projects.restoreVersionTitle')}
                                                onClick={() => restore(version.version)}
                                            >
                                                {t('projects.restoreVersion')}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="pm-share-acts">
                <button id="project-history-close" onClick={onClose}>
                    {t('common.close')}
                </button>
            </div>
        </div>
    )
}

/** The projects in the trash the user may restore or remove for good (`onChanged()` after either). */
function TrashList({refreshKey, onChanged}) {
    const {t, locale} = useTranslation()
    const [summaries, setSummaries] = useState(null),
        [failed, setFailed] = useState(false),
        [error, setError] = useState('')
    useEffect(() => {
        let live = true
        fetchTrash()
            .then((list) => live && setSummaries(list))
            .catch(() => live && setFailed(true))
        return () => {
            live = false
        }
    }, [refreshKey])
    const nameOf = (summary) => summary.name || t('projects.defaultName', {number: summary.id})
    const act = async (summary, action) => {
        setError('')
        const result = await action(summary.id)
        if (!result.ok) return setError(result.error || t('projects.trashFailed'))
        setSummaries((list) => list.filter((item) => item.id !== summary.id))
        onChanged()
    }
    if (failed) return <p id="project-trash-error" className="pm-note">{t('projects.trashFailed')}</p>
    if (!summaries) return <p className="pm-note">{t('projects.listLoading')}</p>
    if (!summaries.length) return <p id="project-trash-empty" className="pm-note">{t('projects.trashEmpty')}</p>
    return (
        <>
            {error && (
                <p className="pm-note error" role="alert">
                    {error}
                </p>
            )}
            <table id="project-trash" className="plist ui" aria-label={t('projects.trash')}>
                <thead>
                    <tr>
                        <th>{t('projects.columns.name')}</th>
                        <th>{t('projects.columns.number')}</th>
                        <th>{t('projects.columns.deleted')}</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {summaries.map((summary) => (
                        <tr key={summary.id} id={'project-trash-row-' + summary.id}>
                            <td className="pm-name">
                                {nameOf(summary)}
                                <ProjectMeta summary={summary} />
                            </td>
                            <td>{summary.id}</td>
                            <td className="pm-when">{formatSaveMoment(summary.updated, locale)}</td>
                            <td className="pm-acts">
                                <button id={'project-untrash-' + summary.id} title={t('projects.untrashTitle')} onClick={() => act(summary, untrashProject)}>
                                    {t('projects.untrash')}
                                </button>
                                <button
                                    id={'project-purge-' + summary.id}
                                    className="pm-del"
                                    title={t('projects.purgeTitle')}
                                    onClick={() => window.confirm(t('projects.confirmPurge', {name: nameOf(summary)})) && act(summary, purgeProject)}
                                >
                                    ✕
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    )
}

/**
 * The table of the projects the user may see (reloaded whenever `refreshKey` changes), with a search box, a choice of order and the trash.
 * `onCopy(summary)` duplicates one, `onRestoreVersion(summary, version)` restores a version of its history, `onTrashChanged()` after a
 * project came out of the trash or was removed for good. `restricted`: a student only duplicates his own projects.
 */
export function ProjectList({currentId, refreshKey, onLoad, onDelete, onCopy, onRestoreVersion, onTrashChanged, restricted}) {
    const {t, locale} = useTranslation()
    const [summaries, setSummaries] = useState(null),
        [failed, setFailed] = useState(false),
        [panel, setPanel] = useState(null), // {id, kind: 'share' | 'history'}: the panel open under a project
        [search, setSearch] = useState(''),
        [sort, setSort] = useState('recent'),
        [showTrash, setShowTrash] = useState(false)
    useEffect(() => {
        let live = true
        setFailed(false)
        fetchProjectSummaries()
            .then((list) => live && setSummaries(list))
            .catch(() => live && setFailed(true))
        return () => {
            live = false
        }
    }, [refreshKey])
    const togglePanel = (id, kind) => setPanel((current) => (current?.id === id && current.kind === kind ? null : {id, kind}))
    const tools = (
        <div className="pm-tools">
            {!showTrash && (
                <>
                    <input
                        id="project-search"
                        type="search"
                        value={search}
                        placeholder={t('projects.searchPlaceholder')}
                        aria-label={t('projects.search')}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <select id="project-sort" value={sort} aria-label={t('projects.sort')} title={t('projects.sort')} onChange={(event) => setSort(event.target.value)}>
                        {Object.keys(SORTS).map((key) => (
                            <option key={key} value={key}>
                                {t('projects.sorts.' + key)}
                            </option>
                        ))}
                    </select>
                </>
            )}
            <button
                id="project-trash-toggle"
                className={showTrash ? 'on' : ''}
                aria-pressed={showTrash}
                title={t('projects.trashTitle')}
                style={showTrash ? {marginLeft: 'auto'} : undefined}
                onClick={() => setShowTrash((on) => !on)}
            >
                {showTrash ? '← ' + t('projects.backToList') : '🗑 ' + t('projects.trash')}
            </button>
        </div>
    )
    if (showTrash)
        return (
            <div className="ui">
                {tools}
                <TrashList refreshKey={refreshKey} onChanged={onTrashChanged || (() => {})} />
            </div>
        )
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
            <div className="ui">
                {tools}
                <p id="project-list-empty" className="pm-note ui">
                    {t('projects.listEmpty')}
                </p>
            </div>
        )
    const shown = summaries.filter((summary) => matches(summary, search)).sort(SORTS[sort] || SORTS.recent)
    return (
        <div className="ui">
            {tools}
            {!shown.length && (
                <p id="project-list-nomatch" className="pm-note">
                    {t('projects.noMatch', {search})}
                </p>
            )}
            {shown.length > 0 && (
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
                        {shown.map((summary) => [
                            <tr key={summary.id} id={'project-row-' + summary.id} className={summary.id === currentId ? 'cur' : ''}>
                                <td className="pm-name">
                                    {summary.name || <i>{t('projects.defaultName', {number: summary.id})}</i>}
                                    {summary.id === currentId && <small> {t('projects.current')}</small>}
                                    <ProjectMeta summary={summary} />
                                </td>
                                <td>{summary.id}</td>
                                <td className="pm-when">{formatSaveMoment(summary.updated, locale)}</td>
                                <td className="pm-acts">
                                    <button id={'project-load-' + summary.id} title={t('projects.loadTitle', {number: summary.id})} onClick={() => onLoad(summary.id, summary)}>
                                        {t('projects.load')}
                                    </button>
                                    {onCopy && (!restricted || summary.mine) && (
                                        <button
                                            id={'project-copy-' + summary.id}
                                            title={t('projects.copyTitle')}
                                            aria-label={t('projects.copyTitle')}
                                            onClick={() => onCopy(summary)}
                                        >
                                            <MenuIcon name="saveas" />
                                        </button>
                                    )}
                                    {onRestoreVersion && (
                                        <button
                                            id={'project-historybtn-' + summary.id}
                                            title={t('projects.historyTitle')}
                                            aria-label={t('projects.historyTitle')}
                                            aria-expanded={panel?.id === summary.id && panel.kind === 'history'}
                                            className={panel?.id === summary.id && panel.kind === 'history' ? 'on' : ''}
                                            onClick={() => togglePanel(summary.id, 'history')}
                                        >
                                            <MenuIcon name="history" />
                                        </button>
                                    )}
                                    {summary.canManage && (
                                        <button
                                            id={'project-sharebtn-' + summary.id}
                                            title={t('projects.shareTitle')}
                                            aria-label={t('projects.shareTitle')}
                                            aria-expanded={panel?.id === summary.id && panel.kind === 'share'}
                                            className={panel?.id === summary.id && panel.kind === 'share' ? 'on' : ''}
                                            onClick={() => togglePanel(summary.id, 'share')}
                                        >
                                            <MenuIcon name="share" />
                                        </button>
                                    )}
                                    {summary.canManage && (
                                        <button
                                            id={'project-delete-' + summary.id}
                                            title={t('projects.deleteTitle', {number: summary.id})}
                                            aria-label={t('projects.deleteLabel', {name: summary.name || t('projects.defaultName', {number: summary.id})})}
                                            className="pm-del"
                                            onClick={() => onDelete(summary)}
                                        >
                                            🗑
                                        </button>
                                    )}
                                </td>
                            </tr>,
                            panel?.id === summary.id && (
                                <tr key={summary.id + '-' + panel.kind} className="pm-share-row">
                                    <td colSpan={4}>
                                        {panel.kind === 'share' ? (
                                            <SharePanel
                                                summary={summary}
                                                onClose={() => setPanel(null)}
                                                onDone={(updated) => {
                                                    setPanel(null)
                                                    setSummaries((list) => list.map((item) => (item.id === updated.id ? updated : item)))
                                                }}
                                            />
                                        ) : (
                                            <HistoryPanel summary={summary} onRestore={(version) => onRestoreVersion(summary, version)} onClose={() => setPanel(null)} />
                                        )}
                                    </td>
                                </tr>
                            ),
                        ])}
                    </tbody>
                </table>
            )}
        </div>
    )
}

const SUBMENU_WIDTH = 480 // room the project list needs next to the menu

export default function ProjectMenu({
    name,
    onNameChange,
    projectId,
    refreshKey,
    loadMenuRequest = 0,
    locked,
    onSave,
    onSaveAs,
    onNew,
    onLoad,
    onDelete,
    onCopy,
    onRestoreVersion,
    onTrashChanged,
    restricted,
    onImport,
    onExport,
    onMaterials,
}) {
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
    // Alt+L (see App.jsx): the menu opens with its list of projects
    useEffect(() => {
        if (!loadMenuRequest) return
        setOpen(true)
        setListOpen(true)
    }, [loadMenuRequest])
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
                            placeholder={projectId ? t('projects.defaultName', {number: projectId}) : t('projects.newName')}
                            maxLength={255}
                            onChange={(event) => onNameChange(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && closeAndRun(onSave)()}
                        />
                        <small id="project-number">{projectId ? t('projects.number', {number: projectId}) : t('projects.notSaved')}</small>
                    </div>
                    <ul className="pm-list" role="menu" aria-label={t('projects.menu')}>
                        {menuItem('btn-save', 'save', t('projects.save'), closeAndRun(onSave), {title: t('projects.saveTitle'), hint: 'Alt+S'})}
                        {menuItem('btn-saveas', 'saveas', t('projects.saveAs'), closeAndRun(onSaveAs), {title: t('projects.saveAsTitle')})}
                        {menuItem('btn-new', 'new', t('projects.new'), closeAndRun(onNew), {title: t('projects.newTitle'), hint: 'Alt+N'})}
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
                                <kbd>Alt+L</kbd>
                                <MenuIcon name="chevron" />
                            </button>
                            {listOpen && (
                                <div className={'pm-sub ' + listSide}>
                                    <ProjectList
                                        currentId={projectId}
                                        refreshKey={refreshKey}
                                        onLoad={(id, summary) => (close(), onLoad(id, summary))}
                                        onDelete={onDelete}
                                        onCopy={onCopy}
                                        onRestoreVersion={onRestoreVersion}
                                        onTrashChanged={onTrashChanged}
                                        restricted={restricted}
                                    />
                                </div>
                            )}
                        </li>
                        <li role="separator" className="pm-sepline" />
                        {/* educational mode: a student cannot import or export (see App.jsx) */}
                        {menuItem('btn-import', 'import', t('projects.import'), closeAndRun(onImport), {title: locked ? t('educational.locked') : t('projects.importTitle'), disabled: !!locked, hint: 'Alt+I'})}
                        {menuItem('btn-export', 'export', t('projects.export'), closeAndRun(onExport), {title: locked ? t('educational.locked') : t('projects.exportTitle'), disabled: !!locked, hint: 'Alt+E'})}
                        {onMaterials && menuItem('btn-materials', 'materials', t('materials.menu'), closeAndRun(onMaterials), {title: t('materials.menuTitle')})}
                    </ul>
                </div>
            )}
        </div>
    )
}
