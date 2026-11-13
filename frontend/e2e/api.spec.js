// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Contract of the REST API of the Spring Boot backend. These only make sense against the real application, so they run with
// E2E_REAL_BACKEND=1 or `npm run e2e:all` (the other end-to-end tests then run against the same backend through the browser).
import {test, expect, REAL, t} from './fixtures.js'
import {project} from './data.js'

test.skip(!REAL, 'needs the real Spring Boot backend (E2E_REAL_BACKEND=1)')
const json = {'Content-Type': 'application/json'}

test.describe('/api/projects', () => {
    const create = async (request, doc, name) => {
        const response = await request.post('/api/projects' + (name ? '?name=' + encodeURIComponent(name) : ''), {data: JSON.stringify(doc), headers: json})
        expect(response.status()).toBe(201)
        return response
    }
    test('a project can be stored, listed, read back unchanged and deleted', async ({request}) => {
        const doc = project({footer: {titel: 'API test'}})
        const created = await create(request, doc)
        const {id, version} = await created.json()
        expect(version).toBe(0)
        expect(created.headers()['etag']).toBe('"0"')
        expect(await (await request.get('/api/projects')).json()).toContain(id)
        const response = await request.get('/api/projects/' + id)
        expect(response.status()).toBe(200)
        expect(response.headers()['content-type']).toContain('application/json')
        expect(response.headers()['etag']).toBe('"0"')
        expect(await response.json()).toEqual(doc)
        // saving again, based on the version that was read, replaces it and makes a new version
        const saved = await request.put('/api/projects/' + id, {data: JSON.stringify({...doc, footer: {titel: 'Nieuw'}}), headers: {...json, 'If-Match': '"0"'}})
        expect(saved.status()).toBe(204)
        expect(saved.headers()['etag']).toBe('"1"')
        expect((await (await request.get('/api/projects/' + id)).json()).footer.titel).toBe('Nieuw')
        await request.delete('/api/projects/' + id)
        expect((await request.get('/api/projects/' + id)).status()).toBe(404)
        expect(await (await request.get('/api/projects')).json()).not.toContain(id)
    })
    test('a save based on an older version, or without a version, is refused', async ({request}) => {
        const {id} = await (await create(request, project())).json()
        expect((await request.put('/api/projects/' + id, {data: '{}', headers: {...json, 'If-Match': '"0"'}})).status()).toBe(204)
        const stale = await request.put('/api/projects/' + id, {data: '{}', headers: {...json, 'If-Match': '"0"'}})
        expect(stale.status()).toBe(409)
        expect((await stale.json()).messageKey).toBe('project.changedElsewhere')
        expect((await request.put('/api/projects/' + id, {data: '{}', headers: json})).status()).toBe(428)
        await request.delete('/api/projects/' + id)
    })
    test('the client cannot choose a number, and only a project document is stored', async ({request}) => {
        expect((await request.put('/api/projects/987650', {data: '{}', headers: {...json, 'If-Match': '"0"'}})).status()).toBe(404)
        const invalid = await request.post('/api/projects', {data: '[1, 2, 3]', headers: json})
        expect(invalid.status()).toBe(400)
        expect((await invalid.json()).messageKey).toBe('project.invalidStructure')
        expect((await request.post('/api/projects', {data: '{"een": ', headers: json})).status()).toBe(400)
    })
    test('the name given on save is listed in the summaries, without the project document', async ({request}) => {
        const {id} = await (await create(request, project({footer: {titel: 'Lijst'}}), 'Woning Jan')).json()
        const rows = await (await request.get('/api/projects/summaries')).json()
        const row = rows.find((summary) => summary.id === id)
        expect(row).toMatchObject({id, name: 'Woning Jan'})
        expect(row.updated).toBeTruthy()
        expect(row.een).toBeUndefined()
        await request.delete('/api/projects/' + id)
    })
    test('an unknown project is a 404', async ({request}) => {
        expect((await request.get('/api/projects/987654')).status()).toBe(404)
    })
    test('every answer carries the security headers', async ({request}) => {
        const response = await request.get('/api/info')
        expect(response.headers()['content-security-policy']).toContain("script-src 'self'")
        expect(response.headers()['x-frame-options']).toBe('DENY')
    })
})

test.describe('/api/symbols', () => {
    test('the standard catalog is delivered with complete drawings', async ({request}) => {
        const list = await (await request.get('/api/symbols')).json()
        expect(list.length).toBeGreaterThan(50)
        const oven = list.find((symbol) => symbol.k === 'oven')
        expect(oven).toMatchObject({name: 'Oven', builtin: true, modified: false})
        expect(oven.shapes.length).toBeGreaterThan(0)
        expect(Array.isArray(oven.parents)).toBe(true)
    })
    test('a template for a new symbol has a fresh own key', async ({request}) => {
        const template = await (await request.get('/api/symbols/template')).json()
        expect(template.k).toMatch(/^custom:/)
        expect(template.shapes).toEqual([])
    })
    test('an own symbol can be stored, read, changed and deleted', async ({request}) => {
        const key = 'custom:api' + Date.now(),
            url = '/api/symbols/' + encodeURIComponent(key),
            symbol = {k: key, name: 'API ding', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}]}
        const put = await request.put(url, {data: symbol})
        expect(put.ok()).toBeTruthy()
        expect(await put.json()).toMatchObject({k: key, name: 'API ding', builtin: false})
        expect((await (await request.get(url)).json()).shapes).toHaveLength(1)
        await request.put(url, {data: {...symbol, name: 'API ding 2'}})
        expect((await (await request.get(url)).json()).name).toBe('API ding 2')
        expect((await request.delete(url)).status()).toBe(204)
        expect((await request.get(url)).ok()).toBeFalsy()
    })
    test('an error is answered in the language of the request, English when it is not spoken', async ({request}) => {
        const nameless = {k: 'custom:nameless', name: ' ', shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}]}
        const answer = async (language) => {
            const response = await request.put('/api/symbols/custom:nameless', {data: nameless, headers: {'Accept-Language': language}})
            expect(response.status()).toBe(400)
            return response.json()
        }
        expect(await answer('nl')).toMatchObject({detail: 'Geef het symbool een naam', messageKey: 'symbol.nameRequired'})
        expect((await answer('fr-BE')).detail).toBe('Donnez un nom au symbole')
        expect((await answer('en')).detail).toBe('Give the symbol a name')
        expect((await answer('de')).detail).toBe('Give the symbol a name')
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
        expect(all.find((symbol) => symbol.k === 'oven')).toBeTruthy()
    })
})
