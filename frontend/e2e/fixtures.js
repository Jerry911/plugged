// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Shared fixtures of the end-to-end tests:
//  - `backend`  the REST API of the application: an in-memory fake (default) or the real Spring Boot application (E2E_REAL_BACKEND=1).
//               Either way the browser is signed in: the fake says so, against the real application the tests sign in as the
//               administrator (created on the first test of the run, with the address of plugged.admin.email of the test profile).
//  - `request`  (real application) API calls of the tests themselves, signed in as that administrator and with the CSRF token.
//  - `dialogs`  answers the alert / confirm / prompt dialogs of the browser and remembers what was said.
//  - `app`      small helpers to drive the editor (open it, switch tabs, save, click inside the drawing sheet).
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {test as base, expect} from '@playwright/test'
import {REAL, testInfo} from './mode.js'

// the requests to the REST API: only paths that start with /api/ (not the source modules under /src/api/ the Vite dev server serves)
const API_REQUEST = (url) => url.pathname.startsWith('/api/')
import {t} from './texts.js'

export {REAL, testInfo}
// the standard symbols of the backend catalog (generated from StandardSymbols.java), the same ones the unit tests use
// the catalog that ships with the application (made with Beheer → Symbolen), as the stored copies of a new installation
const standard = JSON.parse(readFileSync(fileURLToPath(new URL('../../backend/src/main/resources/catalog/standard-symbols.json', import.meta.url)), 'utf8')).map(
    (symbol) => ({...symbol, v: 11, builtin: true, modified: false}),
)
const clone = (x) => JSON.parse(JSON.stringify(x))
/** the localStorage key in which the browser remembers that this user saw the guided tour (see Tour.jsx) */
export const tourKey = (userId) => 'plugged.tour.' + userId
/** the user the fake backend says is signed in */
export const FAKE_USER = {id: 2, name: 'Test', surname: 'Gebruiker', email: 'test@example.be', admin: false, approved: true, created: null}
/** the administrator the tests sign in as against the real application */
export const ADMIN = {email: testInfo.contactEmail, name: 'E2E', surname: 'Beheerder', password: 'e2e-geheim-123'}
const keyOf = (path) => decodeURIComponent(path.split('/').filter(Boolean)[2] ?? '')

/** In-memory stand-in for the Spring Boot REST API (same URLs, status codes and bodies as the controllers). */
export class FakeBackend {
    fake = true
    projects = new Map()
    names = new Map() // id -> name given with ?name= on save
    updated = new Map() // id -> moment of the last save (the editor opens the most recent own project)
    clock = Date.now()
    /** a moment later than every earlier save, even within the same millisecond */
    now() {
        this.clock = Math.max(this.clock + 1, Date.now())
        return new Date(this.clock).toISOString()
    }
    symbols = clone(standard)
    puts = [] // every project save: {id, body}
    failSave = false // PUT /api/projects/:id answers 500
    symbolsDown = false // /api/symbols is not reachable
    gate = null // a promise the first symbol request waits for (to look at the loading state)
    info = {...testInfo} // GET /api/info: what the "test" profile of the real application says

    async install(page) {
        await page.route(API_REQUEST, (route) => this.handle(route))
    }

    async handle(route) {
        const req = route.request(),
            path = new URL(req.url()).pathname,
            m = req.method(),
            json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)}),
            empty = (status = 204) => route.fulfill({status})
        if (path.startsWith('/api/projects')) {
            const id = Number(path.split('/')[3])
            // a new project: the server gives the next number
            if (!path.split('/')[3] && m === 'POST') {
                if (this.failSave) return empty(500)
                const newId = Math.max(0, ...this.projects.keys()) + 1,
                    body = JSON.parse(req.postData())
                this.projects.set(newId, body)
                this.names.set(newId, new URL(req.url()).searchParams.get('name'))
                this.updated.set(newId, this.now())
                this.puts.push({id: newId, body})
                return json({id: newId}, 201)
            }
            if (!path.split('/')[3]) return json([...this.projects.keys()])
            if (path === '/api/projects/summaries')
                return json(
                    [...this.projects].map(([pid, d]) => ({
                        id: pid,
                        name: this.names.get(pid) ?? d.name ?? null,
                        updated: this.updated.get(pid) ?? null,
                        owner: {id: FAKE_USER.id, name: FAKE_USER.name + ' ' + FAKE_USER.surname},
                        groups: [],
                        mine: true,
                        canManage: true,
                    })),
                )
            if (m === 'GET') return this.projects.has(id) ? json(this.projects.get(id)) : empty(404)
            if (m === 'PUT') {
                if (this.failSave) return empty(500)
                const body = JSON.parse(req.postData())
                this.projects.set(id, body)
                this.names.set(id, new URL(req.url()).searchParams.get('name'))
                this.updated.set(id, this.now())
                this.puts.push({id, body})
                return empty()
            }
            if (m === 'DELETE') return this.projects.delete(id), empty(200)
        }
        if (path.startsWith('/api/symbols')) {
            if (this.gate) await this.gate
            if (this.symbolsDown) return empty(503)
            const parts = path.split('/').filter(Boolean), // api, symbols, k?, action?
                k = keyOf(path),
                cur = this.symbols.find((s) => s.k === k),
                std = standard.find((s) => s.k === k)
            if (parts.length === 2) return m === 'GET' ? json(this.symbols) : empty(405)
            if (k === 'template') return json({k: 'custom:' + Math.random().toString(36).slice(2, 8), name: '', cat: 'Eigen', parents: ['kring'], place: true, shapes: []})
            if (k === 'restore' && m === 'POST') return (this.symbols = clone(standard)), json(this.symbols)
            if (parts.length === 3 && m === 'GET') return cur ? json(cur) : empty(404)
            if (parts.length === 3 && m === 'PUT') {
                const body = JSON.parse(req.postData()),
                    saved = {cat: 'Eigen', parents: ['kring'], place: true, v: 0, ...body, builtin: !!std, modified: !!std}
                this.symbols = cur ? this.symbols.map((s) => (s.k === k ? saved : s)) : [...this.symbols, saved]
                return json(saved)
            }
            if (parts.length === 3 && m === 'DELETE') return (this.symbols = this.symbols.filter((s) => s.k !== k)), empty()
            if (parts[3] === 'restore' && std) return (this.symbols = this.symbols.some((s) => s.k === k) ? this.symbols.map((s) => (s.k === k ? clone(std) : s)) : [...this.symbols, clone(std)]), json(clone(std))
            if (parts[3] === 'standard') {
                if (!std) return empty(409)
                const s = {...cur, modified: false}
                this.symbols = this.symbols.map((x) => (x.k === k ? s : x))
                return json(s)
            }
        }
        if (path === '/api/auth/status') return json({setupRequired: false, adminEmail: testInfo.contactEmail, user: FAKE_USER})
        if (path === '/api/groups') return json([])
        if (path === '/api/info') return json(this.info)
        if (path.startsWith('/api/components')) return m === 'GET' ? json([]) : empty()
        return empty(404)
    }

    userId = FAKE_USER.id // the signed-in user (the tour remembers per user that it was seen: plugged.tour.<id>)
    async init() {}
    async seed(id, doc) {
        this.projects.set(id, clone(doc))
        this.updated.set(id, this.now())
    }
    async saved(id = 1) {
        return this.projects.get(id)
    }
    async addSymbol(sym) {
        this.symbols.push({cat: 'Eigen', parents: ['kring'], place: true, v: 0, builtin: false, modified: false, ...sym})
    }
    async symbol(k) {
        return this.symbols.find((s) => s.k === k)
    }
    async resetStandard() {} // the fake has no hidden rows
    async symbolByName(name) {
        return this.symbols.find((s) => s.name === name)
    }
    async symbolCount() {
        return this.symbols.length
    }
}

/** The real application: the same operations through its REST API. */
class RealBackend {
    fake = false
    // The same switches as the fake has. A backend that breaks on purpose is simulated in the browser: the requests of the page are answered
    // here instead of by the application (the requests of the tests themselves, through `request`, always reach the real one).
    failSave = false // saving a project (PUT /api/projects/:id, POST /api/projects) answers 500
    symbolsDown = false // /api/symbols answers 503
    gate = null // a promise every /api/symbols request waits for (to look at the loading state)
    info = null // GET /api/info answers this instead of the settings of the application
    constructor(request) {
        this.request = request
    }
    async install(page) {
        await page.route(API_REQUEST, async (route) => {
            const req = route.request(),
                path = new URL(req.url()).pathname
            if (path === '/api/info' && this.info) return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(this.info)})
            if (path.startsWith('/api/symbols')) {
                if (this.gate) await this.gate
                if (this.symbolsDown) return route.fulfill({status: 503})
            }
            const saving = (path.startsWith('/api/projects/') && req.method() === 'PUT') || (path === '/api/projects' && req.method() === 'POST')
            if (saving && this.failSave) return route.fulfill({status: 500})
            return route.continue()
        })
    }
    // "Maak standaard" keeps the chosen standard in a hidden row that the API cannot delete: make the original drawing the standard again
    async resetStandard(k) {
        const original = standard.find((s) => s.k === k)
        expect((await this.request.put('/api/symbols/' + encodeURIComponent(k), {data: original})).ok()).toBeTruthy()
        expect((await this.request.post('/api/symbols/' + encodeURIComponent(k) + '/standard')).ok()).toBeTruthy()
    }
    // clean slate: no projects, only the standard symbols
    userId = null // the signed-in administrator (the tour remembers per user that it was seen: plugged.tour.<id>)
    async init() {
        this.userId = (await (await this.request.get('/api/auth/status')).json()).user.id
        for (const id of await (await this.request.get('/api/projects')).json()) await this.request.delete('/api/projects/' + id)
        const list = await (await this.request.get('/api/symbols')).json()
        for (const s of list.filter((x) => !x.builtin)) await this.request.delete('/api/symbols/' + encodeURIComponent(s.k))
        await this.request.post('/api/symbols/restore')
    }
    async seed(id, doc) {
        const r = await this.request.put('/api/projects/' + id + (doc.name ? '?name=' + encodeURIComponent(doc.name) : ''), {data: JSON.stringify(doc), headers: {'Content-Type': 'application/json'}})
        expect(r.ok()).toBeTruthy()
    }
    async saved(id = 1) {
        const r = await this.request.get('/api/projects/' + id)
        return r.ok() ? r.json() : undefined
    }
    async addSymbol(sym) {
        const r = await this.request.put('/api/symbols/' + encodeURIComponent(sym.k), {data: sym})
        expect(r.ok()).toBeTruthy()
    }
    async symbol(k) {
        const r = await this.request.get('/api/symbols/' + encodeURIComponent(k))
        return r.ok() ? r.json() : undefined
    }
    async symbolByName(name) {
        return (await (await this.request.get('/api/symbols')).json()).find((s) => s.name === name)
    }
    async symbolCount() {
        return (await (await this.request.get('/api/symbols')).json()).length
    }
}

/** The CSRF token the application handed out to this request context (the XSRF-TOKEN cookie). */
const csrfOf = async (context) => (await context.storageState()).cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value
/**
 * Signs `context` (an APIRequestContext) in as the administrator; on the very first test of the run the administrator does not exist yet,
 * so it is created (the first start of the application). Answers the cookies of the session.
 */
export const signInAsAdmin = async (context) => {
    const status = await (await context.get('/api/auth/status')).json()
    const headers = {'X-XSRF-TOKEN': await csrfOf(context)}
    const response = status.setupRequired
        ? await context.post('/api/auth/setup', {data: {name: ADMIN.name, surname: ADMIN.surname, password: ADMIN.password}, headers})
        : await context.post('/api/auth/login', {data: {email: ADMIN.email, password: ADMIN.password}, headers})
    expect(response.ok(), 'sign in as the administrator: ' + (await response.text())).toBeTruthy()
    return (await context.storageState()).cookies
}
/** An APIRequestContext whose put/post/delete/patch/fetch carry the CSRF token, like the frontend does. */
const withCsrf = (context) =>
    new Proxy(context, {
        get(target, name) {
            const original = target[name]
            if (!['put', 'post', 'delete', 'patch', 'fetch'].includes(name)) return typeof original === 'function' ? original.bind(target) : original
            return async (url, options = {}) => original.call(target, url, {...options, headers: {'X-XSRF-TOKEN': await csrfOf(target), ...options.headers}})
        },
    })

export const test = base.extend({
    // against the real application: the API calls of the tests are made by the signed-in administrator
    request: async ({request, playwright, baseURL}, use) => {
        if (!REAL) return use(request)
        const context = await playwright.request.newContext({baseURL})
        await signInAsAdmin(context)
        await use(withCsrf(context))
        await context.dispose()
    },
    backend: async ({page, request}, use) => {
        const b = REAL ? new RealBackend(request) : new FakeBackend()
        // the browser shares the session of `request`: it opens the editor signed in
        if (REAL) await page.context().addCookies((await request.storageState()).cookies)
        await b.init()
        await b.install(page)
        await use(b)
    },
    // alert/confirm/prompt: `messages` lists what the application said; `answers` queues the answers to the next prompts (null = cancel)
    dialogs: async ({page}, use) => {
        const d = {messages: [], answers: [], confirm: true}
        page.on('dialog', async (dlg) => {
            d.messages.push(dlg.message())
            if (dlg.type() === 'prompt') {
                const a = d.answers.length ? d.answers.shift() : dlg.defaultValue()
                return a === null ? dlg.dismiss() : dlg.accept(a)
            }
            if (dlg.type() === 'confirm') return d.confirm ? dlg.accept() : dlg.dismiss()
            return dlg.accept()
        })
        await use(d)
    },
    app: async ({page, backend, dialogs}, use) => {
        void backend, void dialogs
        // the editor opens as a user who has seen the guided tour; tour.spec.js starts as a new user (and sets the session flag below)
        await page.addInitScript((key) => {
            if (!sessionStorage.getItem('e2e-new-visitor') && localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({v: 99, how: 'e2e'}))
        }, tourKey(backend.userId))
        await use(new App(page))
    },
})
export {expect}
export {t, textPattern} from './texts.js'

export class App {
    constructor(page) {
        this.page = page
    }
    /** opens the editor (optionally with a project in the database) and waits until the symbol library has loaded */
    async open(backend, doc, id = 1) {
        if (doc) await backend.seed(id, doc)
        // subscribe before navigating: the project is fetched right after the page has started
        const loaded = doc ? this.page.waitForResponse((r) => r.url().endsWith('/api/projects/' + id) && r.request().method() === 'GET') : null
        await this.page.goto('/')
        await expect(this.page.locator('#tab-comp')).toBeVisible()
        await loaded
    }
    /** opens a tab of the top bar: 'een' (eendraadschema), 'sit' (situatieschema), 'comp' (componenten) or 'info' */
    tab(id) {
        return this.page.locator('#tab-' + id).click()
    }
    /** the message in the top bar */
    status() {
        return this.page.locator('#status-message')
    }
    /** opens (or closes again) the Project menu: Opslaan, Laden, Importeren, Exporteren */
    project() {
        return this.page.locator('#tab-project').click()
    }
    /** loads a stored project through Project -> Laden */
    async load(id) {
        await this.project()
        await this.page.locator('#btn-load').click()
        await this.page.locator('#project-load-' + id).click()
    }
    /** saves with Ctrl+S (works on every tab) and returns the saved project document */
    /** saves with Ctrl+S and answers what the backend stored; `language` = the language the application is in (the status message is checked) */
    async save(backend, id = 1, language = 'nl') {
        // wait for the PUT itself: the "Opgeslagen ✓" message stays on screen after a first save, so on a second save it proves nothing
        // a stored project is saved with PUT /api/projects/{id}; a new one with POST /api/projects (the server gives it its number)
        const put = this.page.waitForResponse(
            (r) =>
                (r.request().method() === 'PUT' && new RegExp('/api/projects/' + id + '(\\?|$)').test(r.url())) ||
                (r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/projects'),
        )
        await this.page.keyboard.press('Control+s')
        await put
        await expect(this.status()).toHaveText(t('app.saved', {}, language))
        return backend.saved(id)
    }
    /** the row of the element with this id in the "Opbouw" list of the eendraadschema */
    treeRowById(id) {
        return this.page.locator('#eds-tree-' + id)
    }
    /** the row in the "Opbouw" list of the element that carries this label (a label the test typed, or a default label of the application) */
    treeRow(label) {
        return this.page.locator('#eds-tree > div').filter({has: this.page.locator('.tree-name', {hasText: new RegExp('^' + label.replace(/[()]/g, '\\$&') + '$')})}).first()
    }
    /** a symbol of the palette of the eendraadschema, by its symbol key */
    paletteButton(key) {
        return this.page.locator('#eds-palette-' + key.replace(/[^A-Za-z0-9_-]/g, '_'))
    }
    /** adds an element from the component palette (left of the eendraadschema) to the schema, by its symbol key */
    async add(key) {
        const button = this.paletteButton(key)
        // the categories are folded: open the one of this symbol first
        await button.evaluate((element) => (element.closest('details').open = true))
        await button.click()
    }
    /** the drawn element (circuit letter or symbol) with this id in the schema */
    drawn(id) {
        return this.page.locator(`svg.sheet [data-nid="${id}"]`).first()
    }
    /** screen position of a point in the coordinates (mm, 297 x 210) of the first drawing sheet */
    async sheetPoint(x, y, sheet = 'svg.sheet') {
        const loc = this.page.locator(sheet).first()
        await loc.scrollIntoViewIfNeeded()
        return loc.evaluate(
            (svg, [px, py]) => {
                const pt = svg.createSVGPoint()
                pt.x = px
                pt.y = py
                const r = pt.matrixTransform(svg.getScreenCTM())
                return {x: r.x, y: r.y}
            },
            [x, y],
        )
    }
    /** click in a small svg (e.g. the 24 x 24 drawing board of the Components tab) */
    async clickSvg(selector, x, y) {
        const p = await this.sheetPoint(x, y, selector)
        await this.page.mouse.click(p.x, p.y)
    }
    async clickSheet(x, y, opts = {}) {
        const p = await this.sheetPoint(x, y)
        await this.page.mouse.click(p.x, p.y, opts)
    }
    async moveSheet(x, y) {
        const p = await this.sheetPoint(x, y)
        await this.page.mouse.move(p.x, p.y)
    }
    async dragSheet(from, to) {
        const a = await this.sheetPoint(...from),
            b = await this.sheetPoint(...to)
        await this.page.mouse.move(a.x, a.y)
        await this.page.mouse.down()
        await this.page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, {steps: 4})
        await this.page.mouse.move(b.x, b.y, {steps: 4})
        await this.page.mouse.up()
    }
}