// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The application: signing in first (AuthGate), then the top bar (project menu, tabs, undo/redo, Kaderinfo, PDF, print, language, Info,
// Account (own account; users, groups and symbols for an administrator), Afmelden) and the tab that is open.
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import OneWireDiagram from '../features/oneWire/OneWireDiagram.jsx'
import SituationSchema from '../features/situation/SituationSchema.jsx'
import AuthGate from '../features/auth/AuthGate.jsx'
import {fetchRuleSettings, fetchUsers, fetchTheme} from '../api/authApi.js'
import {ExportDialog, IMPORT_ACCEPT, importKind} from '../features/project/ExportDialog.jsx'
import ProjectMenu from '../features/project/ProjectMenu.jsx'
import {FooterDialog} from '../features/footer/FooterDialog.jsx'
import Icon, {CountBadge} from '../components/Icon.jsx'
import {applyTheme} from './theme.js'
import VerifyPanel from '../features/verify/VerifyPanel.jsx'
import {AllSheets, makePdf} from '../features/project/pdfExport.jsx'
import Tour, {markTourSeen, tourSeen} from '../features/tour/Tour.jsx'
import {tourSteps} from '../features/tour/tourSteps.jsx'
import {useSymbolLibrary} from '../api/useSymbolLibrary.js'
import {copyProject, createProject, deleteProject, fetchProject, fetchProjectSummaries, knownVersion, restoreVersion, saveProject} from '../api/projectApi.js'
import {useOffline} from '../hooks/useOffline.js'
import {clearOfflineCopies, isOffline, newLocalId, pendingSaves} from '../offline/offlineStore.js'
import {usePresence} from '../hooks/usePresence.js'
import {schemaRequestFromSearch} from '../features/project/schemaLink.js'
import Toast, {useToast} from '../components/Toast.jsx'
import {useHistory} from '../hooks/useHistory.js'
import {useAutoSave} from '../hooks/useAutoSave.js'
import {useNarrowScreen} from '../hooks/useFillHeight.js'
import {REQUIRED_FOOTER_FIELDS, rulesNotApplicable, verify} from '../model/rules.js'
import {keepOrphanSymbols, unplacedNodes} from '../model/project.js'
import {embedSymbols, OWN_CATEGORY, setLibrary, symbolName} from '../symbols/symbolLibrary.js'
import {I18nProvider, useTranslation} from '../i18n/I18nProvider.jsx'
import LanguageSelect from '../i18n/LanguageSelect.jsx'
import PageBar from './PageBar.jsx'
import {lazyComponent, preloadAll} from '../components/lazy.jsx'
import {loadAllLanguages} from '../i18n/translate.js'

// not on the first screen: loaded when first shown (and in the background right after the start), with the libraries only they use
const SymbolEditor = lazyComponent(() => import('../features/symbolEditor/SymbolEditor.jsx').then((module) => module.default)),
    InfoPage = lazyComponent(() => import('../features/info/InfoPage.jsx').then((module) => module.default)),
    AccountPage = lazyComponent(() => import('../features/account/AccountPage.jsx').then((module) => module.default)),
    TeacherPage = lazyComponent(() => import('../features/admin/TeacherPage.jsx').then((module) => module.default)),
    ConsentPage = lazyComponent(() => import('../features/ai/ConsentPage.jsx').then((module) => module.default)),
    MaterialsDialog = lazyComponent(() => import('../features/project/MaterialsDialog.jsx').then((module) => module.default)),
    QuoteDialog = lazyComponent(() => import('../features/quote/QuoteDialog.jsx').then((module) => module.default)),
    QrDialog = lazyComponent(() => import('../features/project/QrDialog.jsx').then((module) => module.QrDialog)),
    SchemaPdfPage = lazyComponent(() => import('../features/project/SchemaPdfPage.jsx').then((module) => module.default))
import {isProjectEmpty, newProject, normalizeProject} from './projectDocument.js'

const TABS = [
    {id: 'een', label: 'tabs.oneWire', short: 'tabs.oneWireShort'},
    {id: 'sit', label: 'tabs.situation', short: 'tabs.situationShort'},
    {id: 'wire', label: 'tabs.wiring', short: 'tabs.wiringShort'},
    {id: 'comp', label: 'tabs.components'},
]
const ONE_WIRE_TAB = 0,
    SITUATION_TAB = 1,
    WIRING_TAB = 2,
    COMPONENTS_TAB = 3,
    INFO_TAB = 4,
    ACCOUNT_TAB = 5,
    TEACHER_TAB = 6
// /?project=<number>: the project the link points at, when the user may open it (else null)
const linkedProject = (summaries) => {
    const id = Number(new URLSearchParams(window.location.search).get('project'))
    return (id > 0 && summaries.find((summary) => summary.id === id)) || null
}
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
    // opened from the QR code on a circuit board (/?schema=<number>&key=<secret>): the PDF of that project for anybody with the key, without signing in
    // an AI assistant asks to work in Plugged as the user (OAuth, see features/ai/ConsentPage.jsx): after signing in he agrees or not
    if (window.location.pathname === '/oauth/authorize')
        return (
            <I18nProvider>
                <AuthGate>{({user}) => <ConsentPage user={user} />}</AuthGate>
            </I18nProvider>
        )
    const schema = schemaRequestFromSearch()
    if (schema)
        return (
            <I18nProvider>
                <SchemaPdfPage id={schema.id} secret={schema.key} />
            </I18nProvider>
        )
    return (
        <I18nProvider>
            <AuthGate>
                {({user, onLogout, onAccountDeleted, desktop}) => <LibraryGate user={user} desktop={desktop} onLogout={onLogout} onAccountDeleted={onAccountDeleted} />}
            </AuthGate>
        </I18nProvider>
    )
}

function LibraryGate({user, desktop, onLogout, onAccountDeleted}) {
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
    return <Editor library={library} user={user} desktop={desktop} onLogout={onLogout} onAccountDeleted={onAccountDeleted} />
}

function Editor({library, user, desktop = false, onLogout, onAccountDeleted}) {
    const {t, language} = useTranslation()
    const narrowScreen = useNarrowScreen()
    const [initialProject] = useState(newProject)
    // the parts that are not on the first screen, in the background once the editor is shown (lazyComponent), and the other languages (a
    // switch of language is then immediate)
    useEffect(() => {
        const start = () => Promise.all([preloadAll(), loadAllLanguages().catch(() => null)])
        if (typeof requestIdleCallback === 'function') {
            const id = requestIdleCallback(start, {timeout: 3000})
            return () => cancelIdleCallback(id)
        }
        const id = setTimeout(start, 1000)
        return () => clearTimeout(id)
    }, [])
    const {project, setProject: setHistoryProject, reset, undo, redo, canUndo, canRedo} = useHistory(initialProject),
        // every change: the symbols on the plans whose element it removed from the eendraadschema stay on the plan as loose symbols
        setProject = useCallback(
            (next) => setHistoryProject((current) => keepOrphanSymbols(current, typeof next === 'function' ? next(current) : next)),
            [setHistoryProject],
        ),
        savedSnapshot = useRef(JSON.stringify(initialProject)), // the project as last saved or loaded: tells whether there are unsaved changes
        [footerDialog, setFooterDialog] = useState(null),
        // a link to the Info page (/#info, public) opens it also for somebody who is signed in
        [tab, setTab] = useState(() => (window.location.hash === '#info' ? INFO_TAB : ONE_WIRE_TAB)),
        [toast, setStatusMessage] = useToast(),
        [materialsOpen, setMaterialsOpen] = useState(false),
        [quoteOpen, setQuoteOpen] = useState(false),
        [priceListToOpen, setPriceListToOpen] = useState(null),
        [qrTarget, setQrTarget] = useState(null), // {id, title} of the project whose QR code is shown: the open one (Project menu, Alt+Q) or one from the list
        [newerVersion, setNewerVersion] = useState(null), // somebody else saved the open project while it has unsaved changes here
        [oneWirePage, setOneWirePage] = useState(0),
        [situationPage, setSituationPage] = useState(0),
        [wiringPage, setWiringPage] = useState(0),
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
    // the rules of Controleer this user switched off (Account → Controleregels); all on until they are loaded or when that fails
    const [disabledRules, setDisabledRules] = useState([]),
        [accountSection, setAccountSection] = useState(null)
    useEffect(() => {
        let live = true
        fetchRuleSettings().then((result) => live && result.ok && setDisabledRules(result.disabled))
        // his own colours (Account → Mijn account), also on a browser he did not use before
        fetchTheme().then((result) => live && result.ok && applyTheme(result.theme))
        return () => {
            live = false
        }
    }, [user.id])
    const issues = useMemo(() => (restricted ? [] : verify(project, {disabled: disabledRules})), [project, symbols, language, restricted, disabledRules]),
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
        if (issue.rule === 'measure.earth') return openFooter('aardingsweerstand')
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
    // Without a connection a save is kept on this device and sent later (useOffline, offline/sync.js). localId names a project that was
    // never on the server; current: the open project for the reports of the sync, which come in later.
    const localId = useRef(newLocalId()),
        current = useRef({})
    current.current = {projectId, ownProject}
    const offline = useOffline({
        userId: user.id,
        onReport: ({entry, outcome, id, name}) => {
            const open = entry.id != null ? entry.id === current.current.projectId : current.current.projectId == null && entry.localId === localId.current
            if (outcome === 'refused') return setStatusMessage(t('offline.refused'))
            if (outcome === 'copied') {
                setStatusMessage(t('offline.copied', {name, number: id}))
                if (open) {
                    setProjectId(id)
                    setOwnProject(true)
                }
            } else {
                if (open && outcome === 'created') setProjectId(id)
                setStatusMessage(t('offline.synced'))
            }
            setProjectListKey((key) => key + 1)
        },
    })
    const keepOffline = (id, document) =>
        offline
            .keep({id, localId: localId.current, version: id != null ? knownVersion(id) : undefined, own: id == null || ownProject, name: document.name, document: embedSymbols(document)})
            .then(() => {
                markSaved(document)
                setStatusMessage(t('offline.savedLocally'))
                return true
            })
    // a loaded or new project replaces the open one: the undo history and the page selection start over
    // keepTab: the first project at the start (a link to the Info page stays there)
    const openProject = (loaded, id, own = true, {keepTab = false} = {}) => {
        localId.current = newLocalId()
        reset(loaded)
        markSaved(loaded)
        setProjectId(id)
        setOwnProject(own)
        setOneWirePage(0)
        setSituationPage(0)
        setWiringPage(0)
        // drawn by an AI assistant: the situatieschema opens and offers to make the eendraadschema (SituationSchema, project.pending)
        if (loaded.pending?.generateOneWire) setTab(SITUATION_TAB)
        else if (!keepTab) setTab(ONE_WIRE_TAB)
    }
    useEffect(() => {
        ;(async () => {
            try {
                // work kept on this device that did not reach the server yet: that one is the newest
                const waiting = (await pendingSaves(user.id)).at(-1)
                if (waiting) {
                    const loaded = normalizeProject(waiting.document)
                    reset(loaded)
                    markSaved(loaded)
                    setProjectId(waiting.id)
                    localId.current = waiting.localId
                    setOwnProject(waiting.own !== false)
                    setStatusMessage(t('offline.restored'))
                    return
                }
                // a link to a project (/?project=12, as an AI assistant gives it) opens that one; else the newest own project
                const summaries = await fetchProjectSummaries(),
                    requested = linkedProject(summaries),
                    latest = requested || latestOwnProject(summaries)
                const document = latest && (await fetchProject(latest.id))
                if (requested) history.replaceState(null, '', window.location.pathname + window.location.hash)
                if (document) {
                    const loaded = normalizeProject(document)
                    openProject(loaded, latest.id, latest.mine, {keepTab: true})
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
                else if (job === 'png' || job === 'svg') {
                    // every sheet as a drawing (SVG) or a picture (PNG): the sheets are rendered off screen (AllSheets below) and zipped
                    const {pagesZipName, sheetsPngZip, sheetsSvgZip} = await import('../features/project/pagesExport.js'),
                        fileName = pagesZipName(project, job)
                    download(await (job === 'svg' ? sheetsSvgZip : sheetsPngZip)(project, printArea.current), 'application/zip', fileName)
                    setStatusMessage(t('pagesExport.done', {file: fileName}))
                } else window.print()
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
    // a newer version of the open project (saved by somebody else) replaces it, without going to another tab or page
    const followProject = (loaded) => {
        reset(loaded)
        markSaved(loaded)
        setOneWirePage((page) => Math.min(page, Math.max(0, (loaded.een?.length || 1) - 1)))
        setSituationPage((page) => Math.min(page, Math.max(0, (loaded.sit?.length || 1) - 1)))
        setWiringPage((page) => Math.min(page, Math.max(0, (loaded.wire?.length || 1) - 1)))
        setNewerVersion(null)
    }
    const hasUnsavedChanges = () => JSON.stringify(project) !== savedSnapshot.current
    const confirmDiscard = () => !hasUnsavedChanges() || window.confirm(t('app.confirmUnsaved'))
    // the copies of the answers of the server go (somebody else may use this browser next); work that did not reach the server yet stays on
    // this device, for this user only, and is sent after he signs in again
    const signOut = () => {
        if (!confirmDiscard() || (offline.pending > 0 && !window.confirm(t('offline.logoutPending', {count: offline.pending})))) return
        clearOfflineCopies()
        onLogout()
    }
    const countWaiting = useCallback((users) => setWaitingUsers(users.filter((account) => !account.approved).length), [])
    useEffect(() => {
        if (user.admin) fetchUsers().then(countWaiting, () => {})
    }, [user.admin, countWaiting])
    // somebody else saved the open project in the meantime: the server refused to overwrite that work
    const onConflict = () => setStatusMessage(t('app.saveConflict'))
    // stores the document under `id`, or as a new project when `id` is null (the server gives the number); resolves to the number or null.
    // The stored document carries a copy of the own symbols it uses (embedSymbols), so it draws for everybody it is shared with.
    // A student in educational mode cannot create a project with content (that would be an import): his new project is created empty first,
    // then his work is saved in it.
    const store = async (id, document) => {
        let storedId = id
        if (storedId == null) {
            storedId = await createProject(embedSymbols(restricted ? {...newProject(), name: document.name, footer: document.footer} : document), {offlineError: true})
            if (storedId == null) return null
            if (restricted) setProjectId(storedId)
        }
        if (id != null || restricted) {
            if (!(await saveProject(storedId, embedSymbols(document), {onConflict}))) return null
        }
        markSaved(document)
        setProjectListKey((key) => key + 1)
        return storedId
    }
    const save = async () => {
        let id
        try {
            id = await store(projectId, project)
        } catch (error) {
            if (isOffline(error)) await keepOffline(projectId, project)
            else setStatusMessage(t('app.saveFailed'))
            return
        }
        if (id != null) setProjectId(id)
        setStatusMessage((current) => (id != null ? t('app.saved') : current === t('app.saveConflict') ? current : t('app.saveFailed')))
    }
    const saveAs = async () => {
        const name = window.prompt(t('app.saveAsPrompt'), (project.name || project.footer?.titel || '').trim())
        if (name === null) return
        const document = {...project, name: name.trim()}
        let id
        try {
            id = await store(null, document)
        } catch (error) {
            if (!isOffline(error)) return setStatusMessage(t('app.saveFailed'))
            // a new project on this device: it gets its number when it reaches the server
            localId.current = newLocalId()
            setProject(document)
            setProjectId(null)
            setOwnProject(true)
            await keepOffline(null, document)
            return
        }
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
        const document = project
        let stored
        try {
            stored = await saveProject(projectId, embedSymbols(document), {keepalive, onConflict})
        } catch (error) {
            if (isOffline(error)) return keepOffline(projectId, document)
            throw error
        }
        if (stored) {
            markSaved(document)
            setStatusMessage(t('app.autoSaved', {time: new Date().toLocaleTimeString(language, {hour: '2-digit', minute: '2-digit'})}))
        } else setStatusMessage((current) => (current === t('app.saveConflict') ? current : t('app.autoSaveFailed')))
        return stored
    }
    useAutoSave({enabled: projectId != null && ownProject, changed: project, isDirty: hasUnsavedChanges, save: autoSave})
    const startNewProject = async () => {
        if (!confirmDiscard()) return
        localId.current = newLocalId()
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
    // working together: who else has the open project, and their saves. Nothing unsaved here: their version is loaded right away (you
    // follow their work); with unsaved changes it is offered (newerVersion), as loading it would throw those changes away
    const loadNewerVersion = async (answer) => {
        const id = projectId
        try {
            const document = await fetchProject(id)
            if (!document || id !== projectId) return
            followProject(normalizeProject(document))
            setStatusMessage(answer?.savedBy ? t('presence.followed', {name: answer.savedBy}) : t('presence.followedAnonymous'))
        } catch {
            setStatusMessage(t('app.loadFailed'))
        }
    }
    const others = usePresence({
        projectId,
        isDirty: hasUnsavedChanges,
        onNewerVersion: (answer) => (hasUnsavedChanges() ? setNewerVersion(answer) : loadNewerVersion(answer)),
    })
    useEffect(() => setNewerVersion(null), [projectId])
    const removeProject = async (summary) => {
        if (!window.confirm(t('app.confirmTrash', {name: summary.name || t('projects.defaultName', {number: summary.id})}))) return
        const deleted = await deleteProject(summary.id)
        // the open project was deleted: saving it again makes a new project
        if (deleted && summary.id === projectId) setProjectId(null)
        setStatusMessage(deleted ? t('app.projectTrashed', {number: summary.id}) : t('app.deleteFailed'))
        setProjectListKey((key) => key + 1)
    }
    // a copy of a project in the list, as a new own project (it is not opened)
    const duplicateProject = async (summary) => {
        const name = t('common.copyOf', {name: summary.name || t('projects.defaultName', {number: summary.id})}),
            result = await copyProject(summary.id, name)
        setStatusMessage(result.ok ? t('app.projectCopied', {number: result.id}) : result.error || t('app.copyFailed'))
        setProjectListKey((key) => key + 1)
    }
    // an older version saved again as the newest: when it is the open project, it is loaded (unsaved changes here are asked about first)
    const restoreProjectVersion = async (summary, version) => {
        const current = summary.id === projectId
        if (current && !confirmDiscard()) return false
        const result = await restoreVersion(summary.id, version)
        if (!result.ok) {
            setStatusMessage(result.error || t('app.restoreFailed'))
            return false
        }
        if (current) {
            const document = await fetchProject(summary.id)
            if (document) followProject(normalizeProject(document))
        }
        setStatusMessage(t('app.versionRestored', {version, number: summary.id}))
        setProjectListKey((key) => key + 1)
        return true
    }
    // the project the user is in was put in the trash or restored from it elsewhere: nothing to do here, the list is reloaded
    const onTrashChanged = () => setProjectListKey((key) => key + 1)
    // the QR code of a project from the list (its summary), or of the open project when called without one; a project that was never saved has no number
    const openQr = (summary) => {
        if (summary?.id != null) setQrTarget({id: summary.id, title: summary.name})
        else if (projectId != null) setQrTarget({id: projectId, title: project.footer?.titel || project.name})
    }
    const openImport = () => document.getElementById('import-input').click()
    const openExport = () => {
        setFooterDialog(null)
        setExportOpen((open) => !open)
    }
    // the shortcuts of the Project menu: Alt+S save, Alt+N new, Alt+L load, Alt+I import, Alt+E export (not for a student: see `restricted`),
    // Alt+Q QR code, Alt+P print (Ctrl+P stays the browser's own, which prints the screen as it is).
    // Alt and not Ctrl: the browser keeps several Ctrl keys for itself (Ctrl+N a new window, Ctrl+L the address bar). Only Alt alone: with
    // Ctrl too it is AltGr on Windows (AltGr+E = €), with Shift or Cmd it is not ours either.
    const projectShortcuts = {s: save, n: startNewProject, l: () => setLoadMenuRequest((count) => count + 1), i: openImport, e: openExport, ...(desktop ? {} : {q: () => openQr()}), p: () => setPrintJob('print')}
    // The listener stays and calls the shortcuts of the last render. They are handed over in a layout effect, before the browser handles
    // the next key: a listener added again in a normal effect (after the screen is painted) still had the old ones for a moment, so Alt+S
    // right after Laden saved the previous project instead of the loaded one.
    const shortcuts = useRef({actions: projectShortcuts, restricted})
    useLayoutEffect(() => {
        shortcuts.current = {actions: projectShortcuts, restricted}
    })
    useEffect(() => {
        const onKeyDown = (event) => {
            if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            const key = shortcutLetter(event),
                action = shortcuts.current.actions[key]
            if (!action) return
            event.preventDefault()
            if (shortcuts.current.restricted && (key === 'i' || key === 'e')) return
            action()
        }
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    }, [])
    const showImported = () => {
        setOneWirePage(0)
        setSituationPage(0)
        setWiringPage(0)
        setTab(ONE_WIRE_TAB)
    }
    const importEdsText = async (text) => {
        try {
            const {importEds} = await import('../model/eds.js'),
                imported = importEds(text)
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
        if (importKind(file.name, text) === 'eds') await importEdsText(text)
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
    const exportEdsFile = async () => {
        // the EDS code is loaded when it is used; it recognises the default labels in every language
        const [{exportEds}] = await Promise.all([import('../model/eds.js'), loadAllLanguages()])
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
        else if (type === 'svg' || type === 'png') setPrintJob(type)
        else exportJson()
    }
    // components still to place on the situatieschema: a warning only while the rule plan.unplaced is on (Account → Controleregels)
    const unplacedRuleOff = disabledRules.includes('plan.unplaced'),
        unplacedCount = unplacedRuleOff ? 0 : unplacedNodes(project).length,
        shownOneWirePage = Math.min(oneWirePage, project.een.length - 1),
        shownSituationPage = Math.min(situationPage, project.sit.length - 1),
        shownWiringPage = Math.min(wiringPage, project.wire.length - 1)
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
                    onCopy={duplicateProject}
                    onRestoreVersion={restoreProjectVersion}
                    onTrashChanged={onTrashChanged}
                    restricted={restricted}
                    onMaterials={() => setMaterialsOpen(true)}
                    onQuote={() => setQuoteOpen(true)}
                    onPdf={() => setPrintJob('pdf')}
                    onPrint={() => setPrintJob('print')}
                    onQr={desktop ? undefined : openQr}
                    locked={restricted}
                    onImport={openImport}
                    onExport={openExport}
                />
                <span className="sep" />
                {TABS.map((entry, index) => (
                    <button
                        key={entry.id}
                        id={'tab-' + entry.id}
                        className={'tab' + (tab === index ? ' on' : '')}
                        title={narrowScreen && entry.short ? t(entry.label) : undefined}
                        onClick={() => setTab(index)}
                    >
                        {/* on a narrow screen the schemas have a short name (the full one is the hover text): the bar keeps to three lines */}
                        {narrowScreen && entry.short ? t(entry.short) : t(entry.label)}
                        {index === SITUATION_TAB && unplacedCount > 0 && !restricted && (
                            <CountBadge id="tab-sit-unplaced" kind="warning" count={unplacedCount} title={t('tabs.unplacedTitle')} />
                        )}
                        {index === ONE_WIRE_TAB && errorCount > 0 && <CountBadge id="tab-een-errors" kind="error" count={errorCount} title={t('tabs.errorsTitle')} />}
                        {index === ONE_WIRE_TAB && warningCount > 0 && (
                            <CountBadge id="tab-een-warnings" kind="warning" count={warningCount} title={t('tabs.warningsTitle')} />
                        )}
                    </button>
                ))}
                <span className="sep" />
                <button id="btn-undo" title={t('app.undoTitle')} disabled={!canUndo} onClick={undo}>
                    <Icon name="undo" size={18} /> <span className="bar-text minor">{t('app.undo')}</span>
                </button>
                <button id="btn-redo" title={t('app.redoTitle')} disabled={!canRedo} onClick={redo}>
                    <Icon name="redo" size={18} /> <span className="bar-text minor">{t('app.redo')}</span>
                </button>
                <button id="btn-footer" className="accent" title={t('app.footer')} onClick={() => openFooter()}>
                    <Icon name="footer" size={18} /> <span className="bar-text">{t('app.footer')}</span>
                </button>
                <span className="bar-spacer" />
                {(!offline.online || offline.pending > 0) && (
                    <button
                        id="offline-status"
                        className={'presence offline' + (offline.online ? '' : ' editing')}
                        title={offline.pending ? t('offline.pendingTitle', {count: offline.pending}) : t('offline.offlineTitle')}
                        onClick={() => offline.sync()}
                    >
                        <Icon name={offline.online ? 'cloudUp' : 'cloudOff'} size={16} />{' '}
                        {offline.pending ? t('offline.pending', {count: offline.pending}) : t('offline.offline')}
                    </button>
                )}
                {others.length > 0 && (
                    <span
                        id="presence"
                        className={'presence' + (others.some((other) => other.editing) ? ' editing' : '')}
                        title={others
                            .map((other) => (other.me ? t('presence.youElsewhere') : other.name) + (other.editing ? ' (' + t('presence.unsaved') + ')' : ''))
                            .join('\n')}
                    >
                        <Icon name="users" size={16} /> {others.length === 1 ? (others[0].me ? t('presence.youElsewhere') : others[0].name) : t('presence.count', {count: others.length})}
                    </span>
                )}
                {newerVersion && (
                    <span id="newer-version" className="presence editing">
                        {newerVersion.savedBy ? t('presence.newer', {name: newerVersion.savedBy}) : t('presence.newerAnonymous')}{' '}
                        <button id="newer-version-load" title={t('presence.loadTitle')} onClick={() => confirmDiscard() && loadNewerVersion(newerVersion)}>
                            {t('presence.load')}
                        </button>
                    </span>
                )}
                <input id="import-input" type="file" accept={IMPORT_ACCEPT} hidden onChange={importFile} />
                <span className="sep" />
                <LanguageSelect />
                <button id="tab-info" className={tab === INFO_TAB ? 'on' : ''} title={t('tabs.infoTitle')} onClick={() => setTab(INFO_TAB)}>
                    <Icon name="info" size={18} /> <span className="bar-text minor">{t('tabs.info')}</span>
                </button>
                {restricted && (
                    <span id="educational-badge" className="edubadge" role="img" title={t('educational.badge')} aria-label={t('educational.badge')}>
                        <Icon name="educational" size={18} />
                    </span>
                )}
                {!user.admin && user.ownedGroups?.length > 0 && (
                    <button id="tab-teacher" className={tab === TEACHER_TAB ? 'on' : ''} title={t('teacher.tabTitle')} onClick={() => setTab(TEACHER_TAB)}>
                        <Icon name="educational" size={18} /> <span className="bar-text minor">{t('teacher.tab')}</span>
                    </button>
                )}
                {/* Account: a page for every user (his own account); an administrator also manages the users, groups and symbols there */}
                <button
                    id="tab-account"
                    className={tab === ACCOUNT_TAB ? 'on' : ''}
                    title={t(user.admin ? 'account.buttonTitleAdmin' : 'account.buttonTitle')}
                    onClick={() => (setAccountSection(null), setTab(ACCOUNT_TAB))}
                >
                    <Icon name="user" size={18} />
                    <span className="bar-text minor">{t('account.button')}</span>
                    {user.admin && waitingUsers > 0 && (
                        <span id="tab-account-waiting" className="badge" title={t('users.pending', {count: waitingUsers})}>
                            {waitingUsers}
                        </span>
                    )}
                </button>
                {/* as a program on this computer there is nobody else to sign in: no signing out */}
                {!desktop && (
                    <button id="btn-logout" title={t('auth.logoutTitle', {name: `${user.name} ${user.surname}`})} onClick={signOut}>
                        <Icon name="power" size={18} />
                        <span className="bar-text minor">{t('auth.logout')}</span>
                    </button>
                )}
            </div>
            <Toast toast={toast} />
            {materialsOpen && <MaterialsDialog project={project} projectId={projectId} onClose={() => setMaterialsOpen(false)} />}
            {quoteOpen && (
                <QuoteDialog
                    project={project}
                    projectId={projectId}
                    onChange={(quote) => setProject((current) => ({...current, quote}))}
                    onClose={() => setQuoteOpen(false)}
                    onManagePrices={(id) => {
                        setQuoteOpen(false)
                        setPriceListToOpen(id ?? null)
                        setAccountSection('prices')
                        setTab(ACCOUNT_TAB)
                    }}
                />
            )}
            {qrTarget && !desktop && <QrDialog projectId={qrTarget.id} title={qrTarget.title} onClose={() => setQrTarget(null)} />}
            {exportOpen && !restricted && <ExportDialog onExport={exportAs} onClose={() => setExportOpen(false)} />}
            {verifyOpen && !restricted && (
                <VerifyPanel
                    issues={issues}
                    project={project}
                    onGoTo={goToIssue}
                    onClose={() => setVerifyOpen(false)}
                    disabled={disabledRules}
                    onRules={() => (setVerifyOpen(false), setAccountSection('rules'), setTab(ACCOUNT_TAB))}
                    notApplicable={rulesNotApplicable(project).length}
                    installationDate={(project.footer?.installatiedatum || '').trim()}
                    onInstallation={() => openFooter('installatiedatum')}
                    onFooter={openFooter}
                />
            )}
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
                            neutral={restricted || unplacedRuleOff}
                            onPageIndex={setSituationPage}
                            onStatus={setStatusMessage}
                        />
                    </>
                )}
                {tab === WIRING_TAB && (
                    <>
                        <PageBar project={project} setProject={setProject} listKey="wire" pageIndex={shownWiringPage} setPageIndex={setWiringPage} />
                        <SituationSchema
                            key={'wire:' + project.wire[shownWiringPage].id}
                            listKey="wire"
                            project={project}
                            setProject={setProject}
                            pageIndex={shownWiringPage}
                            onFooter={openFooter}
                            onPageIndex={setWiringPage}
                            onStatus={setStatusMessage}
                        />
                    </>
                )}
                {tab === INFO_TAB && <InfoPage onTour={startTour} />}
                {tab === ACCOUNT_TAB && (
                    <AccountPage
                        key={accountSection || 'account'}
                        currentUser={user}
                        priceListId={priceListToOpen}
                        onDeleted={onAccountDeleted}
                        onUsersChange={user.admin ? countWaiting : undefined}
                        initialSection={accountSection || (user.admin && waitingUsers > 0 ? 'users' : 'account')}
                        disabledRules={disabledRules}
                        onRulesChange={setDisabledRules}
                        desktop={desktop}
                    />
                )}
                {tab === TEACHER_TAB && !user.admin && <TeacherPage />}
                {tab === COMPONENTS_TAB && (
                    <SymbolEditor
                        library={symbols}
                        groups={library.groups}
                        onOpen={library.reloadGroups}
                        onSave={saveSymbol}
                        onRemove={removeSymbol}
                        onRestore={restoreSymbol}
                        onMakeStandard={makeStandard}
                        onRestoreAll={restoreAll}
                        onTemplate={template}
                    />
                )}
            </div>
            {tourOpen && <Tour steps={tourSteps().filter((step) => !(desktop && step.id === 'qr'))} context={{project, tab, setTab, onNew: startNewProject}} onClose={closeTour} />}
            {printJob && (
                <div ref={printArea}>
                    <AllSheets project={project} />
                </div>
            )}
        </>
    )
}
