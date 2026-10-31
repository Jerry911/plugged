// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Shared fixtures of the end-to-end tests:
//  - `backend`  the REST API of the application: an in-memory fake (default) or the real Spring Boot application (E2E_REAL_BACKEND=1).
//  - `dialogs`  answers the alert / confirm / prompt dialogs of the browser and remembers what was said.
//  - `app`      small helpers to drive the editor (open it, switch tabs, save, click inside the drawing sheet).
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {test as base, expect} from '@playwright/test'
import {REAL, testInfo} from './mode.js'

export {REAL, testInfo}
// the standard symbols of the backend catalog (generated from StandardSymbols.java), the same ones the unit tests use
const standard = JSON.parse(readFileSync(fileURLToPath(new URL('../src/test/fixtures/standard-symbols.json', import.meta.url)), 'utf8'))
const clone = (x) => JSON.parse(JSON.stringify(x))
const keyOf = (path) => decodeURIComponent(path.split('/').filter(Boolean)[2] ?? '')

/** In-memory stand-in for the Spring Boot REST API (same URLs, status codes and bodies as the controllers). */
export class FakeBackend {
    fake = true
    projects = new Map()
    names = new Map() // id -> name given with ?name= on save
    symbols = clone(standard)
    puts = [] // every project save: {id, body}
    failSave = false // PUT /api/projects/:id answers 500
    symbolsDown = false // /api/symbols is not reachable
    gate = null // a promise the first symbol request waits for (to look at the loading state)
    info = {...testInfo} // GET /api/info: what the "test" profile of the real application says

    async install(page) {
        await page.route('**/api/**', (route) => this.handle(route))
    }

    async handle(route) {
        const req = route.request(),
            path = new URL(req.url()).pathname,
            m = req.method(),
            json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)}),
            empty = (status = 204) => route.fulfill({status})
        if (path.startsWith('/api/projects')) {
            const id = Number(path.split('/')[3])
            if (!path.split('/')[3]) return json([...this.projects.keys()])
            if (path === '/api/projects/summaries')
                return json([...this.projects].map(([pid, d]) => ({id: pid, name: this.names.get(pid) ?? d.name ?? null, updated: null})))
            if (m === 'GET') return this.projects.has(id) ? json(this.projects.get(id)) : empty(404)
            if (m === 'PUT') {
                if (this.failSave) return empty(500)
                const body = JSON.parse(req.postData())
                this.projects.set(id, body)
                this.names.set(id, new URL(req.url()).searchParams.get('name'))
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
        if (path === '/api/info') return json(this.info)
        if (path.startsWith('/api/components')) return m === 'GET' ? json([]) : empty()
        return empty(404)
    }

    async init() {}
    async seed(id, doc) {
        this.projects.set(id, clone(doc))
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
    failSave = false // PUT /api/projects/:id answers 500
    symbolsDown = false // /api/symbols answers 503
    gate = null // a promise every /api/symbols request waits for (to look at the loading state)
    info = null // GET /api/info answers this instead of the settings of the application
    constructor(request) {
        this.request = request
    }
    async install(page) {
        await page.route('**/api/**', async (route) => {
            const req = route.request(),
                path = new URL(req.url()).pathname
            if (path === '/api/info' && this.info) return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(this.info)})
            if (path.startsWith('/api/symbols')) {
                if (this.gate) await this.gate
                if (this.symbolsDown) return route.fulfill({status: 503})
            }
            if (path.startsWith('/api/projects/') && req.method() === 'PUT' && this.failSave) return route.fulfill({status: 500})
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
    async init() {
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

export const test = base.extend({
    backend: async ({page, request}, use) => {
        const b = REAL ? new RealBackend(request) : new FakeBackend()
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
        await use(new App(page))
    },
})
export {expect}

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
        await expect(this.page.getByRole('button', {name: 'Components'})).toBeVisible()
        await loaded
    }
    tab(name) {
        return this.page.locator('.bar').getByRole('button', {name, exact: false}).first().click()
    }
    /** opens the Project tab (Opslaan, Laden, Importeren, Exporteren) */
    project() {
        return this.page.locator('#tab-project').click()
    }
    /** loads a stored project through Project -> Laden */
    async load(id) {
        await this.project()
        await this.page.locator('#btn-load').click()
        await this.page.getByRole('table', {name: 'Opgeslagen projecten'}).getByTitle('Laad project ' + id).click()
    }
    /** saves with Ctrl+S (works on every tab) and returns the saved project document */
    async save(backend, id = 1) {
        await this.page.keyboard.press('Control+s')
        await expect(this.page.getByText('Opgeslagen ✓')).toBeVisible()
        return backend.saved(id)
    }
    /** a row in the "Opbouw" list of the eendraadschema */
    treeRow(label) {
        return this.page.locator('.tree > div').filter({hasText: label}).first()
    }
    /** adds an element from the component palette (left of the eendraadschema) to the schema */
    async add(name) {
        const search = this.page.getByPlaceholder('Zoek element…')
        await search.fill(name)
        await this.page.locator('.pal details button').filter({hasText: new RegExp('^\\s*' + name.replace(/[()]/g, '\\$&') + '\\s*$')}).first().click()
        await search.fill('')
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
