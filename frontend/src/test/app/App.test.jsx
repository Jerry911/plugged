// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import App from '../../app/App.jsx'
import pako from 'pako'
import {importEds} from '../../model/eds.js'
import {setLanguage, t} from '../../i18n/translate.js'
import {byId, getById, node} from '../utils.jsx'
import standard from '../fixtures/standardSymbols.js'

const makePdf = vi.fn(async () => {})
vi.mock('../../features/project/pdfExport.jsx', async (original) => ({...(await original()), makePdf: (...args) => makePdf(...args)}))
// the editor is shown to a signed-in user: the sign-in itself is tested in AuthGate.test.jsx and AppAuth.test.jsx
vi.mock('../../api/authApi.js', async (original) => ({
    ...(await original()),
    fetchAuthStatus: async () => ({setupRequired: false, adminEmail: '', user: {id: 2, name: 'Jan', surname: 'Peeters', email: 'jan@example.be', admin: false, approved: true}}),
}))
vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))
const old = {
    footer: {titel: 'Oud'},
    tree: [node('n', 'stopcontact', [], {label: 'Oud sc'})],
    plan: {walls: [], items: [{id: 'i', kind: 'door', a: 30, x: 1, y: 1}]},
}
// the symbol library comes from the backend: serve the standard symbols (plus `extra`) and echo saved symbols back (with the defaults the backend adds)
const symbols = (extra = []) => (url, o) =>
    url === '/api/symbols'
        ? {ok: true, json: async () => [...standard, ...extra]}
        : url === '/api/symbols/template'
          ? {ok: true, json: async () => ({k: 'custom:nieuw', name: '', cat: 'Eigen', parents: ['kring'], place: true, shapes: []})}
          : url.startsWith('/api/symbols/') && o?.method === 'PUT'
            ? {ok: true, json: async () => ({cat: 'Eigen', parents: ['kring'], place: true, ...JSON.parse(o.body), builtin: false, modified: false})}
            : null
// the projects of the signed-in user: with `data`, project 1 is his (the editor opens his most recent project); a new project gets the next number
const summary = (id, extra = {}) => ({id, name: null, updated: '2026-01-01T10:00:00Z', owner: {id: 2, name: 'Jan Peeters'}, groups: [], mine: true, canManage: true, ...extra})
const projects = (data, ok) => {
    let lastId = data ? 1 : 0
    return (url, o) =>
        url === '/api/projects/summaries'
            ? {ok: true, json: async () => (data ? [summary(1)] : [])}
            : url.startsWith('/api/projects') && o?.method === 'POST'
              ? ok
                  ? {ok: true, json: async () => ({id: ++lastId})}
                  : {ok: false}
              : null
}
const setup = (data = null, ok = true, extra = []) => {
    const answerProjects = projects(data, ok)
    global.fetch = vi.fn(
        async (url, o) =>
            symbols(extra)(url, o) ?? answerProjects(url, o) ?? (o?.method === 'PUT' ? {ok} : data ? {ok: true, json: async () => data} : {ok: false}),
    )
}
// project saves only (not the symbols): PUT of a stored project, POST of a new one
// the saves (not the heartbeats of usePresence)
const puts = () => global.fetch.mock.calls.filter((c) => ['PUT', 'POST'].includes(c[1]?.method) && c[0].startsWith('/api/projects') && !c[0].includes('/presence'))
// import / export go through the buttons with these ids: one file picker (json and eds) and one export dialog with a file type choice
const toProject = () => fireEvent.click(byId('tab-project'))
const clickSave = () => {
    toProject()
    fireEvent.click(byId('btn-save'))
}
const exportAs = (type) => {
    toProject()
    fireEvent.click(byId('btn-export'))
    fireEvent.click(byId('export-type-' + type))
    fireEvent.click(byId('export-confirm'))
}
const importFile = (name, text) => fireEvent.change(byId('import-input'), {target: {files: [{name, text: async () => text}]}})
// the editor appears once the backend has delivered the symbols
const mount = async () => {
    const r = render(<App />)
    await waitFor(() => getById('tab-comp'))
    return r
}
// the message in the top bar
const status = () => getById('status-message')
const statusShows = (text) => waitFor(() => expect(status()).toHaveTextContent(text))
const statusIs = (text) => waitFor(() => expect(status().textContent).toBe(text))
// the n-th page button of the eendraadschema (1 = the first)
const pageButton = (number) => getById('eds-page-' + number)
const pageNamed = (name) => waitFor(() => expect(pageButton(1)).toHaveTextContent(name))
// the row of an element in the Opbouw list
const treeRow = (id) => waitFor(() => getById('eds-tree-' + id))
// a message of the Controle panel, by its rule
const issue = (rule) => {
    const element = document.querySelector(`#verify-issues [data-rule="${rule}"]`)
    if (!element) throw new Error('no issue ' + rule)
    return element
}
const sheetText = () => [...document.querySelectorAll('.main svg.sheet')].map((sheet) => sheet.textContent).join(' ')
beforeEach(() => {
    setup()
    window.alert = vi.fn()
    window.print = vi.fn()
    vi.stubGlobal('URL', {createObjectURL: vi.fn(() => 'blob:x')})
    HTMLAnchorElement.prototype.click = vi.fn()
    makePdf.mockClear()
})
test('starts with empty project, switches tabs, saves', async () => {
    await mount()
    await act(async () => {})
    getById('btn-footer')
    fireEvent.click(getById('tab-sit'))
    getById('sit-tool-select')
    fireEvent.click(getById('tab-comp'))
    getById('comp-new')
    clickSave()
    await statusIs(t('app.saved'))
    expect(JSON.parse(puts()[0][1].body).een).toHaveLength(1)
})
test('save failure message', async () => {
    setup(null, false)
    await mount()
    clickSave()
    await statusIs(t('app.saveFailed'))
})
test('migrates old format on load', async () => {
    setup(old)
    await mount()
    await waitFor(() => expect(getById('eds-tree-n')).toHaveTextContent('Oud sc'))
    clickSave()
    await statusIs(t('app.saved'))
    const b = JSON.parse(puts()[0][1].body)
    expect(b.een[0].tree[0].label).toBe('Oud sc')
    expect(b.sit[0].items[0].r).toBe(30)
    expect(b.footer.titel).toBe('Oud')
    expect(getById('tab-sit-unplaced')).toHaveAttribute('title', t('tabs.unplacedTitle'))
})
// an in-memory /api/projects: id -> document (names travel in the document and as ?name= on save)
// the projects of the user on the server (all his own; project 1 was saved last, so the editor opens it); a new project gets the next number
const projectsApi = (store) => {
    const names = new Map()
    global.fetch = vi.fn(async (url, o) => {
        const sym = symbols()(url, o)
        if (sym) return sym
        if (url === '/api/projects/summaries')
            return {ok: true, json: async () => [...store].map(([id, d]) => summary(id, {name: names.get(id) ?? d.name ?? null, updated: '2026-03-' + String(30 - id).padStart(2, '0') + 'T10:00:00Z'}))}
        if (url === '/api/projects') return {ok: true, json: async () => [...store.keys()]}
        const created = /^\/api\/projects(?:\?name=(.*))?$/.exec(url)
        if (created && o?.method === 'POST') {
            const id = Math.max(0, ...store.keys()) + 1
            store.set(id, JSON.parse(o.body))
            names.set(id, created[1] ? decodeURIComponent(created[1]) : null)
            return {ok: true, json: async () => ({id})}
        }
        const m = /^\/api\/projects\/(\d+)(?:\?name=(.*))?$/.exec(url)
        if (!m) return {ok: false}
        const id = +m[1]
        if (o?.method === 'PUT') {
            store.set(id, JSON.parse(o.body))
            names.set(id, m[2] ? decodeURIComponent(m[2]) : null)
            return {ok: true}
        }
        if (o?.method === 'DELETE') return store.delete(id), {ok: true}
        return store.has(id) ? {ok: true, json: async () => store.get(id)} : {ok: false}
    })
    return names
}
const doc = (name, titel) => ({een: [{id: 'a' + name, name: 'Blad ' + name, tree: []}], sit: [{id: 'b', name: 'P', walls: [], items: []}], custom: [], footer: {titel}, name})
test('the project number is gone from the header; the Project menu has the project actions', async () => {
    await mount()
    await act(async () => {})
    for (const id of ['btn-save', 'btn-load', 'btn-import', 'btn-export']) expect(byId(id)).toBeNull()
    toProject()
    for (const id of ['btn-save', 'btn-saveas', 'btn-new', 'btn-load', 'btn-import', 'btn-export']) expect(byId(id)).toBeTruthy()
})
test('Project opens the menu, clicking Project again closes it; the items are listed under each other', async () => {
    await mount()
    await act(async () => {})
    const btn = byId('tab-project')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(byId('project-menu')).toBeNull()
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(getById('project-menu').querySelector('[role="menu"]')).toHaveAttribute('aria-label', t('projects.menu'))
    expect([...document.querySelectorAll('#project-menu [role="menuitem"]')].map((b) => b.id)).toEqual(['btn-save', 'btn-saveas', 'btn-new', 'btn-load', 'btn-import', 'btn-export'])
    // opening the menu is not a page switch: the drawing stays where it was
    getById('btn-footer')
    expect(byId('tab-een')).toHaveClass('on')
    fireEvent.click(btn)
    expect(byId('project-menu')).toBeNull()
    expect(btn).toHaveAttribute('aria-expanded', 'false')
})
test('the Project menu closes on a click elsewhere, on Escape and after an action, but not while typing the name', async () => {
    await mount()
    await act(async () => {})
    toProject()
    fireEvent.pointerDown(document.body)
    expect(byId('project-menu')).toBeNull()
    toProject()
    fireEvent.pointerDown(byId('project-name'))
    fireEvent.change(byId('project-name'), {target: {value: 'Naam'}})
    expect(byId('project-menu')).not.toBeNull()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(byId('project-menu')).toBeNull()
    toProject()
    fireEvent.click(byId('btn-load'))
    expect(byId('btn-load')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(byId('btn-load')) // the nested flyout toggles too
    expect(byId('btn-load')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(byId('btn-new'))
    expect(byId('project-menu')).toBeNull()
})
test('arrow keys move through the Project menu items', async () => {
    await mount()
    await act(async () => {})
    toProject()
    byId('project-name').focus()
    fireEvent.keyDown(byId('project-name'), {key: 'ArrowDown'})
    expect(document.activeElement).toBe(byId('btn-save'))
    fireEvent.keyDown(byId('btn-save'), {key: 'ArrowUp'})
    expect(document.activeElement).toBe(byId('btn-export'))
    fireEvent.keyDown(byId('btn-export'), {key: 'ArrowDown'})
    expect(document.activeElement).toBe(byId('btn-save'))
})
test('a project is saved with its name (in the document and as ?name=) and Alt+S saves too', async () => {
    projectsApi(new Map())
    await mount()
    await act(async () => {})
    toProject()
    fireEvent.change(byId('project-name'), {target: {value: 'Woning Jan'}})
    fireEvent.click(byId('btn-save'))
    await statusIs(t('app.saved'))
    // a new project: the server gives it its number
    expect(puts()[0][0]).toBe('/api/projects?name=Woning%20Jan')
    expect(puts()[0][1].method).toBe('POST')
    expect(JSON.parse(puts()[0][1].body).name).toBe('Woning Jan')
    toProject()
    expect(getById('project-number')).toHaveTextContent(t('projects.number', {number: 1}))
    fireEvent.keyDown(window, {key: 's', altKey: true})
    await waitFor(() => expect(puts()).toHaveLength(2))
    expect(puts()[1][0]).toBe('/api/projects/1?name=Woning%20Jan')
    expect(puts()[1][1].method).toBe('PUT')
})
test('Laden lists the stored projects by name and loads the chosen one; saving then goes to that project', async () => {
    projectsApi(new Map([[1, doc('Eerste', 'T1')], [2, doc('Tweede', 'T2')]]))
    await mount()
    await pageNamed('Blad Eerste')
    toProject()
    expect(byId('project-list')).toBeNull()
    fireEvent.click(byId('btn-load'))
    const table = await waitFor(() => getById('project-list'))
    expect(table.textContent).toMatch(/Eerste.*huidig/)
    expect(table.textContent).toContain('Tweede')
    fireEvent.click(getById('project-load-2'))
    await statusIs(t('app.projectLoaded', {number: 2}))
    await pageNamed('Blad Tweede')
    clickSave()
    await waitFor(() => expect(puts().at(-1)[0]).toBe('/api/projects/2?name=Tweede'))
})
test('loading another project asks first when there are unsaved changes', async () => {
    projectsApi(new Map([[1, doc('Eerste', 'T1')], [2, doc('Tweede', 'T2')]]))
    await mount()
    await pageNamed('Blad Eerste')
    toProject()
    fireEvent.click(byId('btn-load'))
    await waitFor(() => getById('project-list'))
    fireEvent.change(byId('project-name'), {target: {value: 'Gewijzigd'}})
    const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(getById('project-load-2'))
    await act(async () => {})
    expect(ask).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls.some((call) => call[0] === '/api/projects/2')).toBe(false)
    expect(byId('project-menu')).toBeNull() // (the menu closes when a project is chosen)
    toProject()
    fireEvent.click(byId('btn-load'))
    fireEvent.click(await waitFor(() => getById('project-load-2')))
    await statusIs(t('app.projectLoaded', {number: 2}))
    expect(ask).toHaveBeenCalledTimes(2)
    // unchanged project: no question
    toProject()
    fireEvent.click(byId('btn-load'))
    fireEvent.click(await waitFor(() => getById('project-load-1')))
    await statusIs(t('app.projectLoaded', {number: 1}))
    expect(ask).toHaveBeenCalledTimes(2)
})
test('Nieuw starts an empty project that gets its number from the server when it is saved, Opslaan als stores a copy under a new number', async () => {
    const store = new Map([[1, doc('Eerste', 'T1')], [4, doc('Vierde', 'T4')]])
    projectsApi(store)
    await mount()
    await pageNamed('Blad Eerste')
    toProject()
    fireEvent.click(byId('btn-new'))
    await statusIs(t('app.newProject'))
    expect(pageButton(1)).not.toHaveTextContent('Blad Eerste')
    toProject()
    expect(byId('project-name').value).toBe('')
    expect(getById('project-number')).toHaveTextContent(t('projects.notSaved'))
    expect(byId('project-name')).toHaveAttribute('placeholder', t('projects.newName'))
    fireEvent.change(byId('project-name'), {target: {value: 'Garage'}})
    fireEvent.click(byId('btn-save'))
    await waitFor(() => expect(store.has(5)).toBe(true))
    vi.spyOn(window, 'prompt').mockReturnValue('Garage (kopie)')
    toProject()
    fireEvent.click(byId('btn-saveas'))
    await statusIs(t('app.savedAs', {number: 6}))
    expect(store.get(6).name).toBe('Garage (kopie)')
    expect(store.get(5).name).toBe('Garage')
    vi.spyOn(window, 'prompt').mockReturnValue(null) // cancelled: nothing is saved
    toProject()
    fireEvent.click(byId('btn-saveas'))
    await act(async () => {})
    expect(store.size).toBe(4)
})
test('the shortcuts of the Project menu: Alt+S save, Alt+N new, Alt+L load, Alt+I import, Alt+E export; Ctrl, Shift or AltGr leave them to the browser', async () => {
    projectsApi(new Map([[1, doc('Eerste', 'T1')], [2, doc('Tweede', 'T2')]]))
    await mount()
    await pageNamed('Blad Eerste')
    const press = (key, extra = {}, target = window) => {
        const event = new KeyboardEvent('keydown', {key, altKey: true, bubbles: true, cancelable: true, ...extra})
        act(() => target.dispatchEvent(event))
        return event.defaultPrevented
    }
    // Alt+L: the Project menu opens with the list of projects
    expect(press('l')).toBe(true)
    await waitFor(() => getById('project-list'))
    expect(getById('btn-load')).toHaveAttribute('aria-expanded', 'true')
    expect(getById('btn-load')).toHaveTextContent('Alt+L')
    fireEvent.click(await waitFor(() => getById('project-load-2')))
    await pageNamed('Blad Tweede')
    expect(byId('project-menu')).toBeNull()
    // Alt+E: the export dialog, a second time closes it again
    expect(press('E')).toBe(true)
    getById('export-confirm')
    press('e')
    expect(byId('export-confirm')).toBeNull()
    // Alt+I: the file picker
    const picker = vi.spyOn(byId('import-input'), 'click').mockImplementation(() => {})
    expect(press('i')).toBe(true)
    expect(picker).toHaveBeenCalledTimes(1)
    // the Ctrl keys are the browser's again; Alt with Shift, Cmd, or Ctrl (AltGr on Windows: AltGr+E = €) is not ours either
    expect(press('i', {altKey: false, ctrlKey: true})).toBe(false)
    expect(press('i', {shiftKey: true})).toBe(false)
    expect(press('i', {metaKey: true})).toBe(false)
    expect(press('€', {ctrlKey: true, code: 'KeyE'})).toBe(false)
    expect(picker).toHaveBeenCalledTimes(1)
    // a Mac types a special character with Option: the key on the keyboard counts (Option+I = ˆ)
    expect(press('Dead', {code: 'KeyI'})).toBe(true)
    expect(picker).toHaveBeenCalledTimes(2)
    // Alt+N: a new project, after asking about unsaved changes
    toProject()
    fireEvent.change(byId('project-name'), {target: {value: 'Gewijzigd'}})
    // in a text field Option+E on a Mac starts an accent (é): typing, not a shortcut; Alt+letter on Windows still works there
    expect(press('Dead', {code: 'KeyE'}, byId('project-name'))).toBe(false)
    expect(byId('export-confirm')).toBeNull()
    toProject()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    expect(press('n')).toBe(true)
    expect(confirm).toHaveBeenCalled()
    expect(pageButton(1)).toHaveTextContent('Blad Tweede')
    confirm.mockReturnValue(true)
    press('n')
    await statusIs(t('app.newProject'))
    expect(pageButton(1)).not.toHaveTextContent('Blad Tweede')
    // other keys stay with the browser
    expect(press('p')).toBe(false)
    expect(press('7', {code: 'Digit7'})).toBe(false)
    expect(press('x', {altKey: false})).toBe(false)
    toProject()
    expect(getById('btn-save')).toHaveTextContent('Alt+S')
    expect(getById('btn-new')).toHaveTextContent('Alt+N')
    expect(getById('btn-import')).toHaveTextContent('Alt+I')
    expect(getById('btn-export')).toHaveTextContent('Alt+E')
})
test('the editor opens the most recently saved own project, not a newer one of a coworker', async () => {
    const store = new Map([[1, doc('Eerste', 'T1')], [2, doc('Tweede', 'T2')], [3, doc('Derde', 'T3')]])
    projectsApi(store)
    const answer = global.fetch.getMockImplementation()
    global.fetch = vi.fn(async (url, o) => {
        if (url !== '/api/projects/summaries') return answer(url, o)
        // 1: a coworker's project saved today; 2: own, saved yesterday; 3: own, older
        return {
            ok: true,
            json: async () => [
                summary(1, {mine: false, canManage: false, updated: '2026-11-04T10:00:00Z'}),
                summary(2, {updated: '2026-11-03T10:00:00Z'}),
                summary(3, {updated: '2026-11-01T10:00:00Z'}),
            ],
        }
    })
    await mount()
    await pageNamed('Blad Tweede')
    toProject()
    expect(getById('project-number')).toHaveTextContent(t('projects.number', {number: 2}))
})
// hiding the tab: the automatic save does not wait for its timer (the timers themselves are tested in useAutoSave.test.js)
const hideTab = async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    visibility.mockRestore()
}
test('an own stored project is saved by itself after a change, with a short message; without a change nothing is sent', async () => {
    const store = new Map([[1, doc('Eerste', 'T1')]])
    projectsApi(store)
    await mount()
    await pageNamed('Blad Eerste')
    await hideTab()
    expect(puts()).toHaveLength(0)
    toProject()
    fireEvent.change(byId('project-name'), {target: {value: 'Woning Jan'}})
    await hideTab()
    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0][0]).toBe('/api/projects/1?name=Woning%20Jan')
    expect(puts()[0][1].keepalive).toBe(true)
    expect(store.get(1).name).toBe('Woning Jan')
    await waitFor(() => expect(status().textContent).toMatch(/^Automatisch opgeslagen om \d\d:\d\d ✓$/))
    // saved: leaving again sends nothing, and loading another project does not ask about unsaved changes
    await hideTab()
    expect(puts()).toHaveLength(1)
})
test('a failed automatic save says so', async () => {
    projectsApi(new Map([[1, doc('Eerste', 'T1')]]))
    const answer = global.fetch.getMockImplementation()
    global.fetch = vi.fn(async (url, o) => (o?.method === 'PUT' && url.startsWith('/api/projects/') ? {ok: false} : answer(url, o)))
    await mount()
    await pageNamed('Blad Eerste')
    toProject()
    fireEvent.change(byId('project-name'), {target: {value: 'Woning Jan'}})
    await hideTab()
    await statusIs(t('app.autoSaveFailed'))
})
test('a new project that was never saved, and a project of a coworker, are not saved by themselves', async () => {
    projectsApi(new Map([[1, doc('Eerste', 'T1')], [2, doc('Collega', 'T2')]]))
    const answer = global.fetch.getMockImplementation()
    global.fetch = vi.fn(async (url, o) =>
        url === '/api/projects/summaries'
            ? {ok: true, json: async () => [summary(1, {name: 'Eerste'}), summary(2, {name: 'Collega', mine: false, canManage: false, updated: '2025-01-01T10:00:00Z'})]}
            : answer(url, o),
    )
    await mount()
    await pageNamed('Blad Eerste')
    toProject()
    fireEvent.click(byId('btn-load'))
    await waitFor(() => getById('project-list'))
    fireEvent.click(getById('project-load-2'))
    await pageNamed('Blad Collega')
    toProject()
    fireEvent.change(byId('project-name'), {target: {value: 'Gewijzigd'}})
    await hideTab()
    expect(puts()).toHaveLength(0)
    // saved by hand it is stored as usual
    fireEvent.click(byId('btn-save'))
    await waitFor(() => expect(puts().at(-1)[0]).toBe('/api/projects/2?name=Gewijzigd'))
    // a new project: nothing until it got its number
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    toProject()
    fireEvent.click(byId('btn-new'))
    toProject()
    fireEvent.change(byId('project-name'), {target: {value: 'Nieuw'}})
    await hideTab()
    expect(puts()).toHaveLength(1)
})
test('without own projects, or when the list cannot be loaded, the editor opens a new project', async () => {
    global.fetch = vi.fn(async (url, o) =>
        symbols()(url, o) ?? (url === '/api/projects/summaries' ? {ok: true, json: async () => [summary(1, {mine: false, canManage: false})]} : {ok: false}),
    )
    await mount()
    await act(async () => {})
    expect(global.fetch.mock.calls.some((call) => call[0] === '/api/projects/1')).toBe(false)
    toProject()
    expect(getById('project-number')).toHaveTextContent(t('projects.notSaved'))
})
test('deleting the open project: saving it again makes a new project', async () => {
    const store = new Map([[1, doc('Eerste', 'T1')], [2, doc('Tweede', 'T2')]])
    projectsApi(store)
    await mount()
    await pageNamed('Blad Eerste')
    toProject()
    fireEvent.click(byId('btn-load'))
    await waitFor(() => getById('project-list'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(getById('project-delete-1'))
    await waitFor(() => expect(store.has(1)).toBe(false))
    // (the menu is still open)
    expect(getById('project-number')).toHaveTextContent(t('projects.notSaved'))
    fireEvent.click(byId('btn-save'))
    await waitFor(() => expect(store.has(3)).toBe(true))
    expect(store.get(3).name).toBe('Eerste')
})
test('a project can be deleted from the list after confirming', async () => {
    const store = new Map([[1, doc('Eerste', 'T1')], [2, doc('Tweede', 'T2')]])
    projectsApi(store)
    await mount()
    await pageNamed('Blad Eerste')
    toProject()
    fireEvent.click(byId('btn-load'))
    await waitFor(() => getById('project-list'))
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(getById('project-delete-2'))
    expect(store.has(2)).toBe(true)
    fireEvent.click(getById('project-delete-2'))
    await waitFor(() => expect(store.has(2)).toBe(false))
    await waitFor(() => expect(byId('project-load-2')).toBeNull())
})
test.each([
    ['een', 'eds-page', 'pages.sheetName'],
    ['sit', 'sit-page', 'pages.planName'],
])('page bar on %s', async (tab, prefix, nameKey) => {
    await mount()
    await act(async () => {})
    const page = (number) => byId(`${prefix}-${number}`)
    fireEvent.click(getById('tab-' + tab))
    fireEvent.click(getById(prefix + '-add'))
    expect(page(2)).toHaveTextContent(t(nameKey, {number: 2}))
    vi.spyOn(window, 'prompt').mockReturnValue('Nieuw')
    fireEvent.click(getById(prefix + '-rename'))
    expect(page(2)).toHaveTextContent('Nieuw')
    fireEvent.click(getById(prefix + '-duplicate'))
    expect(page(3)).toHaveTextContent(t('common.copyOf', {name: 'Nieuw'}))
    fireEvent.click(getById(prefix + '-earlier'))
    expect(page(2)).toHaveTextContent(t('common.copyOf', {name: 'Nieuw'}))
    fireEvent.click(getById(prefix + '-later'))
    fireEvent.click(getById(prefix + '-delete'))
    expect(page(3)).toBeNull()
    expect(page(2)).toHaveTextContent('Nieuw')
    fireEvent.click(page(1))
    fireEvent.click(getById(prefix + '-delete'))
    expect(page(1)).toHaveTextContent('Nieuw')
    expect(page(2)).toBeNull()
    expect(getById(prefix + '-delete')).toBeDisabled() // the last page cannot be deleted
})
test('duplicating an eendraad page regenerates node ids', async () => {
    setup({
        een: [{id: 'a', name: 'A', tree: [node('n1', 'bord')]}],
        sit: [{id: 'b', name: 'P', walls: [{id: 'w', x1: 0, y1: 0, x2: 1, y2: 1}], items: []}],
        custom: [],
        footer: {},
    })
    await mount()
    await treeRow('n1')
    fireEvent.click(getById('eds-page-duplicate'))
    clickSave()
    await statusIs(t('app.saved'))
    const b = JSON.parse(puts()[0][1].body)
    expect(b.een[1].tree[0].id).not.toBe('n1')
    fireEvent.click(getById('tab-sit'))
    fireEvent.click(getById('sit-page-duplicate'))
    clickSave()
    await waitFor(() => expect(puts()).toHaveLength(2))
    expect(JSON.parse(puts()[1][1].body).sit[1].walls[0].id).not.toBe('w')
})
test('footer edits flow into the project', async () => {
    await mount()
    await act(async () => {})
    fireEvent.click(getById('btn-footer'))
    fireEvent.change(getById('footer-ean'), {target: {value: '541448'}})
    expect(sheetText()).toContain('541448')
    fireEvent.change(getById('footer-schaal'), {target: {value: '1:75'}})
    expect(sheetText()).toContain('1:75')
})
test('pdf, print, json export and json import', async () => {
    await mount()
    await act(async () => {})
    fireEvent.click(getById('btn-pdf'))
    await waitFor(() => expect(makePdf).toHaveBeenCalled())
    expect(document.querySelectorAll('.export svg.sheet').length).toBe(0)
    makePdf.mockRejectedValueOnce(new Error('boom'))
    fireEvent.click(getById('btn-pdf'))
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(t('app.exportFailed', {reason: 'boom'})))
    fireEvent.click(getById('btn-print'))
    await waitFor(() => expect(window.print).toHaveBeenCalled())
    exportAs('json')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
    fireEvent.change(byId('import-input'), {target: {files: []}})
    importFile('oud.json', JSON.stringify(old))
    await waitFor(() => expect(getById('eds-tree-n')).toHaveTextContent('Oud sc'))
    await statusIs(t('app.projectImported'))
})

const flawed = {
    een: [
        {
            id: 'a',
            name: 'Hoofd',
            tree: [node('A', 'aansluiting', [node('B', 'bord', [node('K', 'kring', [node('S', 'stopcontact')], {info: 'B16 2,5mm²'})])])],
        },
    ],
    sit: [{id: 'b', name: 'P', walls: [], items: []}],
    custom: [],
    footer: {},
}
test('Controleer button shows counts, lists issues and navigates to the node', async () => {
    setup(flawed)
    await mount()
    await pageNamed('Hoofd')
    const btn = getById('btn-verify')
    expect(btn.textContent).toMatch(/✖2.*⚠/)
    fireEvent.click(btn)
    getById('verify-panel')
    fireEvent.click(issue('kring.noDiff'))
    expect(getById('eds-props')).toBeInTheDocument()
    expect(getById('eds-label')).toHaveValue('K')
    fireEvent.click(getById('verify-close'))
    expect(byId('verify-panel')).toBeNull()
})
test('Controleer sits in the eendraadschema bar and the tab shows errors and warnings', async () => {
    setup(flawed)
    await mount()
    await pageNamed('Hoofd')
    const tab = getById('tab-een')
    expect(tab.textContent).toMatch(/✖2.*⚠\d+/)
    expect(getById('btn-verify').closest('.bar')).toBeNull() // not in the header
    fireEvent.click(getById('tab-sit'))
    expect(byId('btn-verify')).toBeNull() // only on the eendraadschema tab
})
test('footer issue goes to eendraad tab, plan issue to situatieschema, global issue without node', async () => {
    setup(flawed)
    await mount()
    await pageNamed('Hoofd')
    fireEvent.click(getById('btn-verify'))
    fireEvent.click(getById('tab-sit'))
    fireEvent.click(issue('footer'))
    getById('footer-dialog')
    fireEvent.click(issue('plan.unplaced'))
    getById('sit-help')
    fireEvent.click(issue('earth'))
    getById('eds-tree-title')
})

const enc = (j) => 'EDS0040000' + btoa(String.fromCharCode(...pako.deflate(JSON.stringify(j))))
const row = (id, parent, type, props = {}) => ({id, parent, indent: 0, props: {type, ...props}})
const EDS = () => ({
    data: [
        row(1, 0, 'Aansluiting', {met_teller: true}),
        row(2, 1, 'Bord', {is_geaard: true}),
        row(3, 2, 'Kring', {naam: 'A', amperage: '16', aantal_polen: '2', type_kabel: 'XVB Cca 3G2,5'}),
        row(4, 3, 'Contactdoos', {adres: 'Keuken'}),
        row(5, 3, 'Rare'),
    ],
    properties: {owner: 'Jan<br>Dorpstraat 1<br>9000 Gent'},
})
test('a new project starts with aansluiting, kWh meter and bord; the verifier reports the empty board', async () => {
    await mount()
    await act(async () => {})
    expect(document.querySelector('svg.sheet').textContent).toContain('kWh')
    fireEvent.click(getById('btn-verify'))
    expect(issue('bord.empty')).toHaveTextContent(t('verify.rules.boardEmpty', {name: t('board.boardLabel')}))
})
test('an empty schema is reported as empty', async () => {
    setup({een: [{id: 'a', name: 'x', tree: []}], sit: [{id: 'b', name: 'P', walls: [], items: []}], custom: [], footer: {}})
    await mount()
    await pageNamed('x')
    fireEvent.click(getById('btn-verify'))
    expect(issue('tree.empty')).toHaveTextContent(t('verify.rules.treeEmpty'))
})
test('new sheets start with a default board', async () => {
    await mount()
    await act(async () => {})
    fireEvent.click(getById('eds-page-add'))
    clickSave()
    await statusIs(t('app.saved'))
    const b = JSON.parse(puts()[0][1].body)
    expect(b.een[1].tree[0].type).toBe('aansluiting')
    expect(b.een[1].tree[0].children[0].type).toBe('bord')
})
test('EDS import replaces schema and footer, reports a message and can be undone', async () => {
    await mount()
    await act(async () => {})
    importFile('huis.eds', enc(EDS()))
    await statusIs(t('app.edsImported', {circuits: 1, nodes: 5}) + ' ' + t('app.edsUnknown', {types: 'Rare'}))
    await treeRow('e4')
    expect(getById('eds-tree-e4')).toHaveTextContent('Keuken')
    expect(sheetText()).toContain('Dorpstraat 1, 9000 Gent')
    fireEvent.click(getById('btn-undo'))
    expect(byId('eds-tree-e4')).toBeNull()
})
test('EDS export downloads the schema as .eds, reports it, and the file imports again', async () => {
    await mount()
    await act(async () => {})
    importFile('huis.eds', enc(EDS()))
    await statusShows(t('app.edsImported', {circuits: 1, nodes: 5}))
    HTMLAnchorElement.prototype.click.mockClear()
    URL.createObjectURL.mockClear()
    exportAs('eds')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    await statusIs(t('app.edsExported', {circuits: 1, nodes: 5}))
    const r = importEds(await readBlob(URL.createObjectURL.mock.calls[0][0]))
    expect(r.stats).toMatchObject({circuits: 1, nodes: 5})
    expect(r.footer).toMatchObject({eigenaar: 'Jan', straat: 'Dorpstraat', nr: '1', postcode: '9000', gemeente: 'Gent'})
})
test('EDS import without unknown types and with an invalid file', async () => {
    await mount()
    await act(async () => {})
    const j = EDS()
    j.data.pop()
    importFile('huis.eds', enc(j))
    await statusIs(t('app.edsImported', {circuits: 1, nodes: 4}))
    importFile('kapot.eds', 'nope')
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(t('eds.notAnEdsFile')))
    fireEvent.change(byId('import-input'), {target: {files: []}})
})

const readBlob = (b) =>
    new Promise((res) => {
        const r = new FileReader()
        r.onload = () => res(r.result)
        r.readAsText(b)
    })
const zelf = {k: 'custom:z', name: 'Zelf', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}], v: 0, builtin: false, modified: false}
test('library comes from the backend and the own symbols travel along in the JSON export', async () => {
    setup(null, true, [zelf])
    await mount()
    fireEvent.click(getById('tab-comp'))
    await waitFor(() => expect(getById('comp-item-custom_z')).toHaveTextContent('Zelf'))
    expect(global.fetch).toHaveBeenCalledWith('/api/symbols', {headers: {'Accept-Language': 'nl'}})
    exportAs('json')
    const out = JSON.parse(await readBlob(URL.createObjectURL.mock.calls[0][0]))
    expect(out.custom).toEqual([{id: 'z', name: 'Zelf', cat: 'Eigen', parents: ['kring'], place: true, shapes: zelf.shapes}])
})
test('components stored inside an old project move into the library', async () => {
    setup({
        een: [{id: 'a', name: 'A', tree: [node('c', 'custom:c1')]}],
        sit: [{id: 'b', name: 'P', walls: [], items: []}],
        custom: [{id: 'c1', name: 'Mijn ding', shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}]}],
        footer: {},
    })
    await mount()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/symbols/custom%3Ac1', expect.objectContaining({method: 'PUT'})))
    // no parents are sent: the backend gives it the default ones
    expect(JSON.parse(global.fetch.mock.calls.find((c) => c[0] === '/api/symbols/custom%3Ac1')[1].body)).not.toHaveProperty('parents')
    fireEvent.click(getById('tab-comp'))
    await waitFor(() => expect(getById('comp-item-custom_c1')).toHaveTextContent('Mijn ding'))
    clickSave()
    await statusIs(t('app.saved'))
    expect(JSON.parse(puts().at(-1)[1].body).custom).toEqual([])
})
test('shows a message with a retry button while the backend has no symbols', async () => {
    let up = false
    global.fetch = vi.fn(async (url, o) => (up ? symbols()(url, o) ?? {ok: false} : {ok: false}))
    render(<App />)
    await waitFor(() => getById('library-error'))
    expect(byId('tab-comp')).toBeNull()
    up = true
    fireEvent.click(getById('library-retry'))
    await waitFor(() => getById('tab-comp'))
})
test('shows that the symbols are loading', async () => {
    let done
    global.fetch = vi.fn(() => new Promise((res) => (done = res)))
    render(<App />)
    // first the session is checked (mocked above), then the symbols load
    await waitFor(() => expect(getById('library-loading')).toHaveTextContent(t('app.loadingSymbols')))
    await act(async () => done({ok: false}))
})

test('import and export are one button each; the old separate JSON / EDS buttons are gone', async () => {
    await mount()
    await act(async () => {})
    toProject()
    expect(byId('btn-import')).toHaveTextContent(t('projects.import'))
    expect(byId('btn-export')).toHaveTextContent(t('projects.export'))
    expect(byId('import-input')).toHaveAttribute('accept', '.json,.eds')
    expect([...document.querySelectorAll('#top-bar button, #project-menu button')].map((button) => button.id).filter((id) => /json|eds/i.test(id))).toEqual([])
})
test('the import button opens the file picker', async () => {
    await mount()
    const click = vi.spyOn(byId('import-input'), 'click')
    toProject()
    fireEvent.click(byId('btn-import'))
    expect(click).toHaveBeenCalledTimes(1)
})
test('the export dialog offers both file types, json first, and downloads the chosen one', async () => {
    await mount()
    await act(async () => {})
    expect(byId('export-dialog')).toBeNull()
    toProject()
    fireEvent.click(byId('btn-export'))
    getById('export-dialog')
    expect(byId('export-type-json')).toBeChecked()
    expect(byId('export-type-eds')).not.toBeChecked()
    // choosing nothing exports the project file
    fireEvent.click(byId('export-confirm'))
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    expect(byId('export-dialog')).toBeNull()
    const out = JSON.parse(await readBlob(URL.createObjectURL.mock.calls[0][0]))
    expect(out.een).toHaveLength(1)
    // .eds: other file, and the message of the export
    exportAs('eds')
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2)
    await statusShows(t('app.edsExported', {circuits: 0, nodes: 2}))
})
test('the export dialog closes with the cross, Annuleer, Escape and the export button, without downloading', async () => {
    await mount()
    await act(async () => {})
    const dlg = () => byId('export-dialog')
    for (const close of [() => fireEvent.click(byId('export-close')), () => fireEvent.click(byId('export-cancel')), () => fireEvent.keyDown(dlg(), {key: 'Escape'}), () => (toProject(), fireEvent.click(byId('btn-export')))]) {
        toProject()
        fireEvent.click(byId('btn-export'))
        expect(dlg()).not.toBeNull()
        fireEvent.keyDown(dlg(), {key: 'a'})
        expect(dlg()).not.toBeNull()
        close()
        expect(dlg()).toBeNull()
    }
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})
test('the export dialog and the Kaderinfo dialog do not stay open together', async () => {
    await mount()
    await act(async () => {})
    toProject()
    fireEvent.click(byId('btn-export'))
    fireEvent.click(byId('btn-footer'))
    expect(byId('export-dialog')).toBeNull()
    getById('footer-dialog')
    toProject()
    fireEvent.click(byId('btn-export'))
    expect(byId('footer-dialog')).toBeNull()
    getById('export-dialog')
})
test('the import picks json or eds from the extension, or from the content when the name says nothing', async () => {
    await mount()
    await act(async () => {})
    importFile('project', JSON.stringify(old)) // no extension: not an EDS header, so json
    await waitFor(() => expect(getById('eds-tree-n')).toHaveTextContent('Oud sc'))
    importFile('schema', enc(EDS())) // no extension: EDS header
    await statusShows(t('app.edsImported', {circuits: 1, nodes: 5}))
    importFile('verkeerd.json', enc(EDS())) // the extension wins: not valid json
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(t('app.invalidProjectFile')))
    importFile('verkeerd.eds', JSON.stringify(old)) // the extension wins: not a valid eds
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(t('eds.notAnEdsFile')))
    importFile(undefined, enc(EDS())) // a file without name
    await statusShows(t('app.edsImported', {circuits: 1, nodes: 5}))
})
test('importing the same file twice works: the picker is reset after every choice', async () => {
    await mount()
    await act(async () => {})
    const input = byId('import-input')
    importFile('a.json', JSON.stringify(old))
    await waitFor(() => expect(getById('eds-tree-n')).toHaveTextContent('Oud sc'))
    expect(input.value).toBe('')
})
test('the Info tab shows the info page and the other tabs bring the editor back', async () => {
    await mount()
    await act(async () => {})
    expect(byId('info-page')).toBeNull()
    fireEvent.click(byId('tab-info'))
    expect(byId('info-page')).not.toBeNull()
    expect(byId('tab-info')).toHaveClass('on')
    expect(byId('tab-een')).not.toHaveClass('on')
    fireEvent.click(byId('tab-comp'))
    expect(byId('info-page')).toBeNull()
    expect(byId('tab-info')).not.toHaveClass('on')
    fireEvent.click(byId('tab-een'))
    expect(byId('tab-een')).toHaveClass('on')
    fireEvent.click(byId('tab-sit'))
    getById('sit-tool-select')
})

test('the language picker switches the whole editor and is remembered; the backend gets the language with every request', async () => {
    await mount()
    await act(async () => {})
    expect(getById('language-select')).toHaveValue('nl')
    expect(getById('tab-een')).toHaveTextContent('Eendraadschema')
    fireEvent.change(getById('language-select'), {target: {value: 'fr'}})
    expect(getById('tab-een')).toHaveTextContent('Schéma unifilaire')
    expect(getById('btn-footer')).toHaveTextContent('Cartouche')
    expect(getById('eds-page-1')).toHaveTextContent('Blad 1') // the name of an existing page is data: it is not translated
    fireEvent.click(getById('eds-page-add'))
    expect(getById('eds-page-2')).toHaveTextContent('Feuille 2') // a new page is named in the active language
    fireEvent.click(getById('eds-page-delete'))
    expect(document.documentElement.lang).toBe('fr')
    expect(localStorage.getItem('plugged.language')).toBe('fr')
    // the check messages follow the language
    fireEvent.click(getById('btn-verify'))
    expect(issue('bord.empty')).toHaveTextContent(t('verify.rules.boardEmpty', {name: 'Verdeelbord'}))
    expect(t('verify.rules.boardEmpty', {name: 'X'})).toMatch(/^Le tableau/)
    fireEvent.change(getById('language-select'), {target: {value: 'en'}})
    expect(getById('tab-sit')).toHaveTextContent('Site plan')
    clickSave()
    await statusIs('Saved ✓')
    expect(puts().at(-1)[1].headers).toMatchObject({'Accept-Language': 'en'})
    // the project itself is not translated: the stored labels stay as they were made
    expect(JSON.parse(puts().at(-1)[1].body).een[0].tree[0].label).toBe('Aansluiting net')
})
