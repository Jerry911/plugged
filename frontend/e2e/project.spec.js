// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The project as a whole: start, load, save, project numbers, undo/redo and the JSON import / export.
import {readFileSync} from 'node:fs'
import {test, expect, t} from './fixtures.js'
import {flawed, oldFormat, project, withCircuit} from './data.js'

test('a new project starts with a connection, kWh meter and board; tabs switch; saving stores it', async ({page, app, backend}) => {
    await app.open(backend)
    await expect(page.locator('svg.sheet').first()).toContainText('kWh')
    await app.tab('sit')
    await expect(page.locator('#sit-tool-select')).toBeVisible()
    await app.tab('comp')
    await expect(page.locator('#comp-new')).toBeVisible()
    await app.tab('een')
    await expect(page.locator('#eds-palette-search')).toBeVisible()
    const saved = await app.save(backend)
    expect(saved.een).toHaveLength(1)
    expect(saved.een[0].tree[0].type).toBe('aansluiting')
    expect(saved.een[0].tree[0].children[0].type).toBe('bord')
    expect(saved.sit).toHaveLength(1)
})

test('a saved project is still there after reloading the page', async ({page, app, backend}) => {
    await app.open(backend, withCircuit())
    await expect(page.locator('#eds-tree')).toContainText('Keuken stopcontact')
    await app.treeRow('Gang licht').click()
    await page.locator('#eds-delete').click()
    await app.save(backend)
    await page.reload()
    await expect(page.locator('#eds-tree')).toContainText('Keuken stopcontact')
    await expect(page.locator('#eds-tree')).not.toContainText('Gang licht')
})

test('shows a message when saving fails', async ({page, app, backend}) => {
    backend.failSave = true
    await app.open(backend)
    await page.keyboard.press('Alt+s')
    await expect(page.locator('#status-message', {hasText: t('app.saveFailed')})).toBeVisible()
})

test('an old project (tree + plan) is migrated when it is loaded', async ({page, app, backend}) => {
    await app.open(backend, oldFormat())
    await expect(page.locator('#eds-tree')).toContainText('Oud sc')
    await expect(page.locator('#tab-sit-unplaced').first()).toBeVisible()
    const saved = await app.save(backend)
    expect(saved.een[0].tree[0].label).toBe('Oud sc')
    expect(saved.sit[0].items[0].r).toBe(30)
    expect(saved.footer.titel).toBe('Oud')
})

test('Laden lists the stored projects by name and opens the chosen one; saving goes to that project', async ({page, app, backend}) => {
    await backend.seed(2, project({name: 'Tweede woning', een: [{id: 'a', name: 'Eigen blad', tree: []}]}))
    await app.open(backend, project({name: 'Eerste woning', een: [{id: 'b', name: 'Blad van een', tree: []}]}))
    await expect(page.locator('#eds-page-1')).toHaveText('Blad van een')
    await app.project()
    await page.locator('#btn-load').click()
    const list = page.locator('#project-list')
    await expect(list).toContainText('Eerste woning')
    await expect(list).toContainText('Tweede woning')
    await page.locator('#project-load-2').click()
    await expect(page.locator('#eds-page-1')).toHaveText('Eigen blad')
    const saved = await app.save(backend, 2)
    expect(saved.name).toBe('Tweede woning')
})

test('Nieuw starts an empty project that is saved under a new number with its name', async ({page, app, backend}) => {
    await app.open(backend, project({name: 'Eerste woning'}))
    await app.project()
    await page.locator('#btn-new').click()
    await expect(app.status()).toHaveText(t('app.newProject'))
    await app.project()
    await page.locator('#project-name').fill('Garage')
    await page.locator('#btn-save').click()
    await expect(page.locator('#status-message', {hasText: t('app.saved')})).toBeVisible()
    expect((await backend.saved(2)).name).toBe('Garage')
    expect((await backend.saved(1)).name).toBe('Eerste woning')
})

test('undo and redo with the buttons and the keyboard', async ({page, app, backend}) => {
    await app.open(backend)
    const undo = page.locator('#btn-undo'),
        redo = page.locator('#btn-redo')
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()
    await page.locator('#eds-page-add').click()
    await expect(page.locator('#eds-page-2')).toBeVisible()
    await undo.click()
    await expect(page.locator('#eds-page-2')).toHaveCount(0)
    await expect(redo).toBeEnabled()
    await redo.click()
    await expect(page.locator('#eds-page-2')).toBeVisible()
    await page.keyboard.press('Control+z')
    await expect(page.locator('#eds-page-2')).toHaveCount(0)
    await page.keyboard.press('Control+y')
    await expect(page.locator('#eds-page-2')).toBeVisible()
    await page.keyboard.press('Control+z')
    await expect(page.locator('#eds-page-2')).toHaveCount(0)
    await page.keyboard.press('Control+Shift+z')
    await expect(page.locator('#eds-page-2')).toBeVisible()
})

test('JSON export downloads the project with its own components; JSON import loads a project file', async ({page, app, backend}) => {
    await backend.addSymbol({k: 'custom:z', name: 'Zelf', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}]})
    await app.open(backend, withCircuit({footer: {titel: 'Villa'}}))
    await app.project()
    await page.locator('#btn-export').click()
    await page.locator('#export-type-json').check()
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-confirm').click()])
    expect(download.suggestedFilename()).toBe('Villa.json')
    const out = JSON.parse(readFileSync(await download.path(), 'utf8'))
    expect(out.een[0].name).toBe('Hoofd')
    expect(out.custom.map((c) => c.id)).toContain('z')
    // import: an old-format file is migrated like a loaded project
    await page.locator('#import-input').setInputFiles({name: 'oud.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldFormat()))})
    await expect(page.locator('#eds-tree')).toContainText('Oud sc')
})

test.describe('the backend has no symbols', () => {
    test('shows a message with a retry button until the symbols can be loaded', async ({page, backend}) => {
        backend.symbolsDown = true
        await page.goto('/')
        await expect(page.locator('#library-error')).toBeVisible()
        await expect(page.locator('#tab-comp')).toHaveCount(0)
        backend.symbolsDown = false
        await page.locator('#library-retry').click()
        await expect(page.locator('#tab-comp')).toBeVisible()
    })
    test('shows that the symbols are loading', async ({page, backend}) => {
        let open
        backend.gate = new Promise((r) => (open = r))
        await page.goto('/')
        await expect(page.locator('#library-loading')).toBeVisible()
        open()
        await expect(page.locator('#tab-comp')).toBeVisible()
    })
})

test('the check button shows the number of errors and warnings of the schema', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await expect(page.locator('#btn-verify')).toHaveText(/✖2.*⚠/)
})

test('an own stored project is saved by itself once the user stops changing it, and when the tab is hidden', async ({page, app, backend}) => {
    await page.clock.install()
    await app.open(backend, project({name: 'Eerste woning'}))
    await app.project()
    await page.locator('#project-name').fill('Woning Jan')
    await app.project()
    // nothing is sent while the user is still busy
    await page.clock.runFor(5_000)
    expect((await backend.saved(1)).name).toBe('Eerste woning')
    const put = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/api\/projects\/1(\?|$)/.test(r.url()))
    await page.clock.runFor(20_000)
    await put
    await expect(app.status()).toHaveText(/^Automatisch opgeslagen om \d\d:\d\d ✓$/)
    expect((await backend.saved(1)).name).toBe('Woning Jan')
    // another change, then the tab is hidden: saved right away
    await app.project()
    await page.locator('#project-name').fill('Woning Piet')
    await app.project()
    const hidden = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/api\/projects\/1(\?|$)/.test(r.url()))
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'})
        document.dispatchEvent(new Event('visibilitychange'))
    })
    await hidden
    expect((await backend.saved(1)).name).toBe('Woning Piet')
})

test('the keyboard shortcuts of the Project menu: Alt+L load, Alt+E export, Alt+I import, Alt+N new', async ({page, app, backend}) => {
    await backend.seed(2, project({name: 'Tweede woning', een: [{id: 'a', name: 'Eigen blad', tree: []}]}))
    await app.open(backend, project({name: 'Eerste woning'}))
    await page.keyboard.press('Alt+l')
    await expect(page.locator('#project-list')).toContainText('Tweede woning')
    await expect(page.locator('#btn-load')).toContainText('Alt+L')
    await page.locator('#project-load-2').click()
    await expect(page.locator('#eds-page-1')).toHaveText('Eigen blad')
    await page.keyboard.press('Alt+e')
    await expect(page.locator('#export-confirm')).toBeVisible()
    await page.keyboard.press('Alt+e')
    await expect(page.locator('#export-confirm')).toHaveCount(0)
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press('Alt+i')
    await chooser
    await page.keyboard.press('Alt+n')
    await expect(app.status()).toHaveText(t('app.newProject'))
    await app.project()
    await expect(page.locator('#project-number')).toHaveText(t('projects.notSaved'))
    await expect(page.locator('#btn-new')).toContainText('Alt+N')
})
