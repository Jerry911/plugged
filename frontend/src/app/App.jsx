// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The application: signing in first (AuthGate), then the top bar (project menu, tabs, undo/redo, Kaderinfo, PDF, print, language, Info,
// Beheer (users and groups) for an administrator, Afmelden) and the tab that is open.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import OneWireDiagram from '../features/oneWire/OneWireDiagram.jsx'
import SituationSchema from '../features/situation/SituationSchema.jsx'
import SymbolEditor from '../features/symbolEditor/SymbolEditor.jsx'
import InfoPage from '../features/info/InfoPage.jsx'
import AuthGate from '../features/auth/AuthGate.jsx'
import AdminPage from '../features/admin/AdminPage.jsx'
import TeacherPage from '../features/admin/TeacherPage.jsx'
import {fetchUsers} from '../api/authApi.js'
import {ExportDialog, IMPORT_ACCEPT, importKind} from '../features/project/ExportDialog.jsx'
import ProjectMenu from '../features/project/ProjectMenu.jsx'
import {FooterDialog} from '../features/footer/FooterDialog.jsx'
import VerifyPanel from '../features/verify/VerifyPanel.jsx'
import {AllSheets, makePdf} from '../features/project/pdfExport.jsx'
import Tour, {markTourSeen, tourSeen} from '../features/tour/Tour.jsx'
import {tourSteps} from '../features/tour/tourSteps.jsx'
import {useSymbolLibrary} from '../api/useSymbolLibrary.js'
import {createProject, deleteProject, fetchProject, fetchProjectSummaries, saveProject} from '../api/projectApi.js'
import {useHistory} from '../hooks/useHistory.js'
import {useAutoSave} from '../hooks/useAutoSave.js'
import {exportEds, importEds} from '../model/eds.js'
import {REQUIRED_FOOTER_FIELDS, verify} from '../model/rules.js'
import {unplacedNodes} from '../model/project.js'
import {OWN_CATEGORY, setLibrary, symbolName} from '../symbols/symbolLibrary.js'
import {I18nProvider, useTranslation} from '../i18n/I18nProvider.jsx'
import LanguageSelect from '../i18n/LanguageSelect.jsx'
import PageBar from './PageBar.jsx'
import {isProjectEmpty, newProject, normalizeProject} from './projectDocument.js'

const TABS = [
    {id: 'een', label: 'tabs.oneWire'},
    {id: 'sit', label: 'tabs.situation'},
    {id: 'comp', label: 'tabs.components'},
]
const ONE_WIRE_TAB = 0,
    SITUATION_TAB = 1,
    COMPONENTS_TAB = 2,
    INFO_TAB = 3,
    ADMIN_TAB = 4,
    TEACHER_TAB = 5
// the editor opens with the most recently saved project of the user (null: none yet, a new project)
const latestOwnProject = (summaries) => summaries.filter((summary) => summary.mine).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))[0] || null

/** Starts a download of `content` as a file. */
const download = (content, type, fileName) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], {type}))
    link.download = fileName
    link.click()
}

// the editor needs the symbol library: show it only when the backend has delivered it
// The letter of an Alt shortcut. On a Mac Option+letter types a special character (Option+S = ß) or starts an accent (Option+E = é), so
// the key on the keyboard (event.code) counts there, except in a text field: that one is typing, not a shortcut.
const shortcutLetter = (event) => {
    if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase()
    const target = event.target
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return null
    return /^Key[A-Z]$/.test(event.code || '') ? event.code.slice(3).toLowerCase() : null
}

export default function App() {
    return (
        <I18nProvider>
            <AuthGate>{({user, onLogout}) => <LibraryGate user={user} onLogout={onLogout} />}</AuthGate>
        </I18nProvider>
    )
}

function LibraryGate({user, onLogout}) {
    const {t} = useTranslation()
    const library = useSymbolLibrary()
    if (library.status === 'loading')
        return (
            <p id="library-loading" className="ui" style={{padding: 16}}>
                {t('app.loadingSymbols')}
            </p>
        )
    if (library.status === 'error')
        return (
            <div id="library-error" className="ui" style={{padding: 16}}>
                <p>{t('app.symbolsUnavailable')}</p>
                <button id="library-retry" onClick={library.reload}>
                    {t('app.retry')}
                </button>
            </div>
        )
    return <Editor library={library} user={user} onLogout={onLogout} />
}

function Editor({library, user, onLogout}) {
    const {t, language} = useTranslation()
    const [initialProject] = useState(newProject)
    const {project, setProject, reset, undo, redo, canUndo, canRedo} = useHistory(initialProject),
        savedSnapshot = useRef(JSON.stringify(initialProject)), // the project as last saved or loaded: tells whether there are unsaved changes
        [footerDialog, setFooterDialog] = useState(null),
        [tab, setTab] = useState(ONE_WIRE_TAB),
        [statusMessage, setStatusMessage] = useState(''),
        [oneWirePage, setOneWirePage] = useState(0),
        [situationPage, setSituationPage] = useState(0),
        [projectId, setProjectId] = useState(null), // null: a new project that was never saved (the server gives it a number)
        [ownProject, setOwnProject] = useState(true), // false: a project of somebody else (shared with a group, or seen by the admin)
        [projectListKey, setProjectListKey] = useState(0), // bumped after a save or delete so an open project list reloads
        [loadMenuRequest, setLoadMenuRequest] = useState(0), // bumped by Alt+L: the Project menu opens with its list of projects
        [printJob, setPrintJob] = useState(null),
        [verifyOpen, setVerifyOpen] = useState(false),
        [exportOpen, setExportOpen] = useState(false),
        [focus, setFocus] = useState(null),
        [tourOpen, setTourOpen] = useState(false),
        [tourAllowed, setTourAllowed] = useState(false), // the project has been fetched and the tour may draw in it
        [waitingUsers, setWaitingUsers] = useState(0), // accounts the administrator has not approved yet
        printArea = useRef()
    const {library: symbols, save: saveSymbol, remove: removeSymbol, restore: restoreSymbol, makeStandard, restoreAll, template} = library
    setLibrary(symbols)
    // the messages are in the active language: check again when it changes
    // educational mode (see GroupService#isRestricted): a student gets no validation at all, and cannot import or export
    const restricted = !!user.restricted
    const issues = useMemo(() => (restricted ? [] : verify(project)), [project, symbols, language, restricted]),
        errorCount = issues.filter((issue) => issue.level === 'error').length,
        warningCount = issues.filter((issue) => issue.level === 'warn').length
    const openFooter = (field) => {
        setExportOpen(false)
        setFooterDialog({field, openedAt: Date.now()})
    }
    // a click on a check message: go to the element it is about
    const goToIssue = (issue) => {
        // the first required field that is still empty
        if (issue.rule === 'footer') return openFooter(REQUIRED_FOOTER_FIELDS.find((key) => !(project.footer?.[key] || '').trim()) || 'eigenaar')
        if (issue.rule.startsWith('plan.')) return setTab(SITUATION_TAB)
        setTab(ONE_WIRE_TAB)
        if (issue.page != null) setOneWirePage(issue.page)
        if (issue.nodeId) setFocus({id: issue.nodeId, requestedAt: Date.now()})
    }
    useEffect(() => {
        // components stored inside a project (old projects, JSON import) move into the shared library
        if (!project.custom?.length) return
        project.custom.forEach((component) => {
            const key = 'custom:' + component.id
            if (!symbols.some((symbol) => symbol.k === key))
                saveSymbol({
                    k: key,
                    name: component.name,
                    cat: component.cat || OWN_CATEGORY,
                    parents: component.parents,
                    place: component.place !== false,
                    shapes: component.shapes,
                })
        })
        setProject((current) => ({...current, custom: []}))
    }, [project.custom])
    const markSaved = (savedProject) => (savedSnapshot.current = JSON.stringify(savedProject))
    // a loaded or new project replaces the open one: the undo history and the page selection start over
    const openProject = (loaded, id, own = true) => {
        reset(loaded)
        markSaved(loaded)
        setProjectId(id)
        setOwnProject(own)
        setOneWirePage(0)
        setSituationPage(0)
        setTab(ONE_WIRE_TAB)
    }
    useEffect(() => {
        ;(async () => {
            try {
                const latest = latestOwnProject(await fetchProjectSummaries())
                const document = latest && (await fetchProject(latest.id))
                if (document) {
                    const loaded = normalizeProject(document)
                    reset(loaded)
                    markSaved(loaded)
                    setProjectId(latest.id)
                    setOwnProject(true)
                    setOneWirePage(0)
                    setSituationPage(0)
                    // somebody who finds real work on the server is not a beginner: the tour does not draw in it by itself
                    setTourAllowed(isProjectEmpty(loaded))
                } else setTourAllowed(true)
            } catch {
                setTourAllowed(true)
            }
        })()
    }, [])
    // first visit: this user has not seen the tour in this browser yet (see Tour.jsx) and the project is fetched, so the tour does not jump around
    useEffect(() => {
        if (tourAllowed && !tourSeen(user.id)) setTourOpen(true)
    }, [tourAllowed, user.id])
    const closeTour = (how) => {
        markTourSeen(how, user.id)
        setTourOpen(false)
    }
    // started from Info: the tour draws in the open project, so ask first when there is work in it
    const startTour = () => {
        if (isProjectEmpty(project) || window.confirm(t('tour.confirmStart'))) setTourOpen(true)
    }
    useEffect(() => {
        if (!printJob) return
        const job = printJob
        ;(async () => {
            try {
                if (job === 'pdf') await makePdf(project, printArea.current)
                else window.print()
            } catch (error) {
                window.alert(t('app.exportFailed', {reason: error.message}))
            } finally {
                setPrintJob(null)
            }
        })()
    }, [printJob, project])
    useEffect(() => {
        const onKeyDown = (event) => {
            if (!(event.ctrlKey || event.metaKey)) return
            const key = event.key.toLowerCase()
            if (key === 'z' && !event.shiftKey) {
                event.preventDefault()
                undo()
            } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
                event.preventDefault()
                redo()
            }
        }
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    }, [undo, redo])
    const hasUnsavedChanges = () => JSON.stringify(project) !== savedSnapshot.current
    const confirmDiscard = () => !hasUnsavedChanges() || window.confirm(t('app.confirmUnsaved'))
    const signOut = () => confirmDiscard() && onLogout()
    const countWaiting = useCallback((users) => setWaitingUsers(users.filter((account) => !account.approved).length), [])
    useEffect(() => {
        if (user.admin) fetchUsers().then(countWaiting, () => {})
    }, [user.admin, countWaiting])
    // stores the document under `id`, or as a new project when `id` is null (the server gives the number); resolves to the number or null
    const store = async (id, document) => {
        const storedId = id == null ? await createProject(document) : (await saveProject(id, document)) ? id : null
        if (storedId != null) {
            markSaved(document)
            setProjectListKey((key) => key + 1)
        }
        return storedId
    }
    const save = async () => {
        const id = await store(projectId, project)
        if (id != null) setProjectId(id)
        setStatusMessage(id != null ? t('app.saved') : t('app.saveFailed'))
    }
    const saveAs = async () => {
        const name = window.prompt(t('app.saveAsPrompt'), (project.name || project.footer?.titel || '').trim())
        if (name === null) return
        const document = {...project, name: name.trim()},
            id = await store(null, document)
        if (id != null) {
            setProject(document)
            setProjectId(id)
            setOwnProject(true)
            setStatusMessage(t('app.savedAs', {number: id}))
            markSaved(document)
        } else setStatusMessage(t('app.saveFailed'))
    }
    // automatic save: only of an own project that is already on the server (a new one gets its number from a save by hand), and only
    // what changed (see useAutoSave for how seldom); a project of somebody else is only saved by hand, so two people with the same project
    // open do not overwrite each other's work without noticing
    const autoSave = async ({keepalive} = {}) => {
        const document = project,
            stored = await saveProject(projectId, document, {keepalive})
        if (stored) {
            markSaved(document)
            setStatusMessage(t('app.autoSaved', {time: new Date().toLocaleTimeString(language, {hour: '2-digit', minute: '2-digit'})}))
        } else setStatusMessage(t('app.autoSaveFailed'))
        return stored
    }
    useAutoSave({enabled: projectId != null && ownProject, changed: project, isDirty: hasUnsavedChanges, save: autoSave})
    const startNewProject = async () => {
        if (!confirmDiscard()) return
        openProject(newProject(), null)
        setStatusMessage(t('app.newProject'))
    }
    const loadProject = async (id, summary) => {
        if (!confirmDiscard()) return
        try {
            const document = await fetchProject(id)
            if (!document) return setStatusMessage(t('app.projectNotFound', {number: id}))
            openProject(normalizeProject(document), id, summary?.mine ?? true)
            setStatusMessage(t('app.projectLoaded', {number: id}))
        } catch {
            setStatusMessage(t('app.loadFailed'))
        }
    }
    const removeProject = async (summary) => {
        if (!window.confirm(t('app.confirmDelete', {name: summary.name || t('projects.defaultName', {number: summary.id})}))) return
        const deleted = await deleteProject(summary.id)
        // the open project was deleted: saving it again makes a new project
        if (deleted && summary.id === projectId) setProjectId(null)
        setStatusMessage(deleted ? t('app.projectDeleted', {number: summary.id}) : t('app.deleteFailed'))
        setProjectListKey((key) => key + 1)
    }
    const openImport = () => document.getElementById('import-input').click()
    const openExport = () => {
        setFooterDialog(null)
        setExportOpen((open) => !open)
    }
    // the shortcuts of the Project menu: Alt+S save, Alt+N new, Alt+L load, Alt+I import, Alt+E export (not for a student: see `restricted`).
    // Alt and not Ctrl: the browser keeps several Ctrl keys for itself (Ctrl+N a new window, Ctrl+L the address bar). Only Alt alone: with
    // Ctrl too it is AltGr on Windows (AltGr+E = €), with Shift or Cmd it is not ours either.
    const projectShortcuts = {s: save, n: startNewProject, l: () => setLoadMenuRequest((count) => count + 1), i: openImport, e: openExport}
    useEffect(() => {
        const onKeyDown = (event) => {
            if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            const key = shortcutLetter(event),
                action = projectShortcuts[key]
            if (!action) return
            event.preventDefault()
            if (restricted && (key === 'i' || key === 'e')) return
            action()
        }
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    })
    const showImported = () => {
        setOneWirePage(0)
        setSituationPage(0)
        setTab(ONE_WIRE_TAB)
    }
    const importEdsText = (text) => {
        try {
            const imported = importEds(text)
            // the situatieschema is not imported: keep the pages and walls, but drop symbols that pointed to the replaced nodes
            setProject((current) => ({
                ...current,
                een: imported.een,
                sit: current.sit.map((page) => ({...page, items: []})),
                footer: {...current.footer, ...imported.footer},
            }))
            showImported()
            const {circuits, nodes, unknown} = imported.stats
            setStatusMessage(
                t('app.edsImported', {circuits, nodes}) + (unknown.length ? ' ' + t('app.edsUnknown', {types: unknown.join(', ')}) : ''),
            )
        } catch (error) {
            window.alert(error.message)
        }
    }
    const importJsonText = (text) => {
        try {
            setProject(normalizeProject(JSON.parse(text)))
            showImported()
            setStatusMessage(t('app.projectImported'))
        } catch {
            window.alert(t('app.invalidProjectFile'))
        }
    }
    // one file picker for both kinds: the extension (or the "EDS" header) decides how the file is read
    const importFile = async (event) => {
        const file = event.target.files[0]
        event.target.value = ''
        if (!file || restricted) return
        const text = await file.text()
        if (importKind(file.name, text) === 'eds') importEdsText(text)
        else importJsonText(text)
    }
    const fileBaseName = () => project.footer.titel || 'schema'
    const exportJson = () => {
        // own components travel along with the project file (as `custom`) so it opens on another installation
        const custom = symbols
            .filter((symbol) => !symbol.builtin)
            .map((symbol) => ({
                id: symbol.k.replace(/^custom:/, ''),
                name: symbol.name,
                cat: symbol.cat,
                parents: symbol.parents,
                place: symbol.place,
                shapes: symbol.shapes,
            }))
        download(JSON.stringify({...project, custom}), 'application/json', fileBaseName() + '.json')
    }
    const exportEdsFile = () => {
        // symbols without an EDS equivalent (own components, ...) are written as a free consumer named after the symbol
        const result = exportEds(project, Object.fromEntries(symbols.map((symbol) => [symbol.k, symbolName(symbol)])))
        download(result.text, 'text/plain', fileBaseName() + '.eds')
        const {circuits, nodes, approximated} = result.stats
        setStatusMessage(
            t('app.edsExported', {circuits, nodes}) + (approximated.length ? ' ' + t('app.edsApproximated', {names: approximated.join(', ')}) : ''),
        )
    }
    const exportAs = (type) => {
        setExportOpen(false)
        if (restricted) return
        if (type === 'eds') exportEdsFile()
        else exportJson()
    }
    const unplacedCount = unplacedNodes(project).length,
        shownOneWirePage = Math.min(oneWirePage, project.een.length - 1),
        shownSituationPage = Math.min(situationPage, project.sit.length - 1)
    return (
        <>
            <div className="bar ui" id="top-bar">
                <ProjectMenu
                    name={project.name}
                    onNameChange={(name) => setProject((current) => ({...current, name}))}
                    projectId={projectId}
                    refreshKey={projectListKey}
                    loadMenuRequest={loadMenuRequest}
                    onSave={save}
                    onSaveAs={saveAs}
                    onNew={startNewProject}
                    onLoad={loadProject}
                    onDelete={removeProject}
                    locked={restricted}
                    onImport={openImport}
                    onExport={openExport}
                />
                <span className="sep" />
                {TABS.map((entry, index) => (
                    <button key={entry.id} id={'tab-' + entry.id} className={tab === index ? 'on' : ''} onClick={() => setTab(index)}>
                        {t(entry.label)}
                        {index === SITUATION_TAB && unplacedCount > 0 && !restricted && (
                            <span id="tab-sit-unplaced" title={t('tabs.unplacedTitle')}>
                                {' '}⚠{unplacedCount}
                            </span>
                        )}
                        {index === ONE_WIRE_TAB && errorCount > 0 && (
                            <span id="tab-een-errors" title={t('tabs.errorsTitle')}>
                                {' '}✖{errorCount}
                            </span>
                        )}
                        {index === ONE_WIRE_TAB && warningCount > 0 && (
                            <span id="tab-een-warnings" title={t('tabs.warningsTitle')}>
                                {' '}⚠{warningCount}
                            </span>
                        )}
                    </button>
                ))}
                <span className="sep" />
                <button id="btn-undo" title={t('app.undoTitle')} disabled={!canUndo} onClick={undo}>
                    ↶ <span className="bar-text">{t('app.undo')}</span>
                </button>
                <button id="btn-redo" title={t('app.redoTitle')} disabled={!canRedo} onClick={redo}>
                    ↷ <span className="bar-text">{t('app.redo')}</span>
                </button>
                <button id="btn-footer" className="accent" title={t('app.footer')} onClick={() => openFooter()}>
                    ✎ <span className="bar-text">{t('app.footer')}</span>
                </button>
                <span className="bar-spacer" />
                <span id="status-message">{statusMessage}</span>
                <input id="import-input" type="file" accept={IMPORT_ACCEPT} hidden onChange={importFile} />
                <span className="sep" />
                <button id="btn-pdf" onClick={() => setPrintJob('pdf')}>
                    PDF
                </button>
                <button id="btn-print" title={t('app.print')} onClick={() => setPrintJob('print')}>
                    <span className="bar-icon" aria-hidden="true">
                        🖨
                    </span>
                    <span className="bar-text minor">{t('app.print')}</span>
                </button>
                <span className="sep" />
                <LanguageSelect />
                <button id="tab-info" className={tab === INFO_TAB ? 'on' : ''} title={t('tabs.infoTitle')} onClick={() => setTab(INFO_TAB)}>
                    ⓘ <span className="bar-text minor">{t('tabs.info')}</span>
                </button>
                {restricted && (
                    <span id="educational-badge" className="edubadge" role="img" title={t('educational.badge')} aria-label={t('educational.badge')}>
                        🎓
                    </span>
                )}
                {!user.admin && user.ownedGroups?.length > 0 && (
                    <button id="tab-teacher" className={tab === TEACHER_TAB ? 'on' : ''} title={t('teacher.tabTitle')} onClick={() => setTab(TEACHER_TAB)}>
                        🎓 <span className="bar-text minor">{t('teacher.tab')}</span>
                    </button>
                )}
                {user.admin && (
                    <button id="tab-admin" className={tab === ADMIN_TAB ? 'on' : ''} title={t('tabs.adminTitle')} onClick={() => setTab(ADMIN_TAB)}>
                        ⚙ <span className="bar-text minor">{t('tabs.admin')}</span>
                        {waitingUsers > 0 && (
                            <span id="tab-admin-waiting" className="badge" title={t('users.pending', {count: waitingUsers})}>
                                {waitingUsers}
                            </span>
                        )}
                    </button>
                )}
                <button id="btn-logout" title={t('auth.logoutTitle', {name: `${user.name} ${user.surname}`})} onClick={signOut}>
                    <span className="bar-icon" aria-hidden="true">
                        ⏻
                    </span>
                    <span className="bar-text minor">{t('auth.logout')}</span>
                </button>
            </div>
            {exportOpen && !restricted && <ExportDialog onExport={exportAs} onClose={() => setExportOpen(false)} />}
            {verifyOpen && !restricted && <VerifyPanel issues={issues} onGoTo={goToIssue} onClose={() => setVerifyOpen(false)} />}
            {footerDialog && (
                <FooterDialog key={footerDialog.openedAt} project={project} setProject={setProject} focus={footerDialog.field} onClose={() => setFooterDialog(null)} />
            )}
            <div className="ui">
                {tab === ONE_WIRE_TAB && (
                    <>
                        <PageBar
                            project={project}
                            setProject={setProject}
                            listKey="een"
                            pageIndex={shownOneWirePage}
                            setPageIndex={setOneWirePage}
                            verify={restricted ? null : {errorCount, warningCount, onToggle: () => setVerifyOpen((open) => !open)}}
                        />
                        <OneWireDiagram
                            key={project.een[shownOneWirePage].id}
                            project={project}
                            setProject={setProject}
                            pageIndex={shownOneWirePage}
                            focus={focus}
                            onFocused={() => setFocus(null)}
                            onFooter={openFooter}
                        />
                    </>
                )}
                {tab === SITUATION_TAB && (
                    <>
                        <PageBar project={project} setProject={setProject} listKey="sit" pageIndex={shownSituationPage} setPageIndex={setSituationPage} />
                        <SituationSchema
                            key={project.sit[shownSituationPage].id}
                            project={project}
                            setProject={setProject}
                            pageIndex={shownSituationPage}
                            onFooter={openFooter}
                            educational={restricted}
                        />
                    </>
                )}
                {tab === INFO_TAB && <InfoPage onTour={startTour} />}
                {tab === ADMIN_TAB && user.admin && <AdminPage currentUser={user} onUsersChange={countWaiting} />}
                {tab === TEACHER_TAB && !user.admin && <TeacherPage />}
                {tab === COMPONENTS_TAB && (
                    <SymbolEditor
                        library={symbols}
                        onSave={saveSymbol}
                        onRemove={removeSymbol}
                        onRestore={restoreSymbol}
                        onMakeStandard={makeStandard}
                        onRestoreAll={restoreAll}
                        onTemplate={template}
                    />
                )}
            </div>
            {tourOpen && <Tour steps={tourSteps()} context={{project, tab, setTab, onNew: startNewProject}} onClose={closeTour} />}
            {printJob && (
                <div ref={printArea}>
                    <AllSheets project={project} />
                </div>
            )}
        </>
    )
}
