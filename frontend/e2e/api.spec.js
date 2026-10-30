// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Contract of the REST API of the Spring Boot backend. These only make sense against the real application, so they run with
// E2E_REAL_BACKEND=1 (the other end-to-end tests then run against the same backend through the browser).
import {test, expect, REAL} from './fixtures.js'
import {project} from './data.js'

test.skip(!REAL, 'needs the real Spring Boot backend (E2E_REAL_BACKEND=1)')
const json = {'Content-Type': 'application/json'}

test.describe('/api/projects', () => {
    test('a project can be stored, listed, read back unchanged and deleted', async ({request}) => {
        const doc = project({footer: {titel: 'API test'}})
        expect((await request.put('/api/projects/4242', {data: JSON.stringify(doc), headers: json})).status()).toBe(204)
        expect(await (await request.get('/api/projects')).json()).toContain(4242)
        const r = await request.get('/api/projects/4242')
        expect(r.status()).toBe(200)
        expect(r.headers()['content-type']).toContain('application/json')
        expect(await r.json()).toEqual(doc)
        // saving again replaces it
        await request.put('/api/projects/4242', {data: JSON.stringify({...doc, footer: {titel: 'Nieuw'}}), headers: json})
        expect((await (await request.get('/api/projects/4242')).json()).footer.titel).toBe('Nieuw')
        await request.delete('/api/projects/4242')
        expect((await request.get('/api/projects/4242')).status()).toBe(404)
        expect(await (await request.get('/api/projects')).json()).not.toContain(4242)
    })
    test('an unknown project is a 404', async ({request}) => {
        expect((await request.get('/api/projects/987654')).status()).toBe(404)
    })
})

test.describe('/api/symbols', () => {
    test('the standard catalog is delivered with complete drawings', async ({request}) => {
        const list = await (await request.get('/api/symbols')).json()
        expect(list.length).toBeGreaterThan(50)
        const oven = list.find((s) => s.k === 'oven')
        expect(oven).toMatchObject({name: 'Oven', builtin: true, modified: false})
        expect(oven.shapes.length).toBeGreaterThan(0)
        expect(Array.isArray(oven.parents)).toBe(true)
    })
    test('a template for a new symbol has a fresh own key', async ({request}) => {
        const t = await (await request.get('/api/symbols/template')).json()
        expect(t.k).toMatch(/^custom:/)
        expect(t.shapes).toEqual([])
    })
    test('an own symbol can be stored, read, changed and deleted', async ({request}) => {
        const k = 'custom:api' + Date.now(),
            url = '/api/symbols/' + encodeURIComponent(k),
            sym = {k, name: 'API ding', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}]}
        const put = await request.put(url, {data: sym})
        expect(put.ok()).toBeTruthy()
        expect(await put.json()).toMatchObject({k, name: 'API ding', builtin: false})
        expect((await (await request.get(url)).json()).shapes).toHaveLength(1)
        await request.put(url, {data: {...sym, name: 'API ding 2'}})
        expect((await (await request.get(url)).json()).name).toBe('API ding 2')
        expect((await request.delete(url)).status()).toBe(204)
        expect((await request.get(url)).ok()).toBeFalsy()
    })
    test('an edited standard symbol is marked modified and can be restored; "restore all" brings back deleted ones', async ({request}) => {
        const url = '/api/symbols/oven',
            oven = await (await request.get(url)).json()
        await request.put(url, {data: {...oven, name: 'Oven aangepast'}})
        expect(await (await request.get(url)).json()).toMatchObject({name: 'Oven aangepast', modified: true})
        const back = await (await request.post(url + '/restore')).json()
        expect(back).toMatchObject({name: 'Oven', modified: false})
        await request.delete(url)
        expect((await request.get(url)).ok()).toBeFalsy()
        const all = await (await request.post('/api/symbols/restore')).json()
        expect(all.find((s) => s.k === 'oven')).toBeTruthy()
    })
})
