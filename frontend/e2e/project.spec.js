// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The project as a whole: start, load, save, project numbers, undo/redo and the JSON import / export.
import {readFileSync} from 'node:fs'
import {test, expect} from './fixtures.js'
import {flawed, oldFormat, project, withCircuit} from './data.js'

test('a new project starts with a connection, kWh meter and board; tabs switch; saving stores it', async ({page, app, backend}) => {
    await app.open(backend)
    await expect(page.locator('svg.sheet').first()).toContainText('kWh')
    await app.tab('Situatieschema')
    await expect(page.getByRole('button', {name: 'Selecteer'})).toBeVisible()
    await app.tab('Components')
    await expect(page.getByText('＋ Nieuw component')).toBeVisible()
    await app.tab('Eendraadschema')
    await expect(page.getByPlaceholder('Zoek element…')).toBeVisible()
    const saved = await app.save(backend)
    expect(saved.een).toHaveLength(1)
    expect(saved.een[0].tree[0].type).toBe('aansluiting')
    expect(saved.een[0].tree[0].children[0].type).toBe('bord')
    expect(saved.sit).toHaveLength(1)
})

test('a saved project is still there after reloading the page', async ({page, app, backend}) => {
    await app.open(backend, withCircuit())
    await expect(page.locator('.tree')).toContainText('Keuken stopcontact')
    await app.treeRow('Gang licht').click()
    await page.getByLabel('Verwijderen', {exact: true}).click()
    await app.save(backend)
    await page.reload()
    await expect(page.locator('.tree')).toContainText('Keuken stopcontact')
    await expect(page.locator('.tree')).not.toContainText('Gang licht')
})

test('shows a message when saving fails', async ({page, app, backend}) => {
    backend.failSave = true
    await app.open(backend)
    await page.getByRole('button', {name: 'Opslaan'}).click()
    await expect(page.getByText('Fout bij opslaan')).toBeVisible()
})

test('an old project (tree + plan) is migrated when it is loaded', async ({page, app, backend}) => {
    await app.open(backend, oldFormat())
    await expect(page.locator('.tree')).toContainText('Oud sc')
    await expect(page.getByTitle('Niet geplaatst op situatieschema').first()).toBeVisible()
    const saved = await app.save(backend)
    expect(saved.een[0].tree[0].label).toBe('Oud sc')
    expect(saved.sit[0].items[0].r).toBe(30)
    expect(saved.footer.titel).toBe('Oud')
})

test('other project numbers load their own project; an empty number goes back to project 1', async ({page, app, backend}) => {
    await backend.seed(2, project({een: [{id: 'a', name: 'Eigen blad', tree: []}]}))
    await app.open(backend, project({een: [{id: 'b', name: 'Blad van een', tree: []}]}))
    await expect(page.getByRole('button', {name: 'Blad van een'})).toBeVisible()
    await page.getByTitle('Project-nr').fill('2')
    await expect(page.getByRole('button', {name: 'Eigen blad'})).toBeVisible()
    await page.getByTitle('Project-nr').fill('')
    await expect(page.getByTitle('Project-nr')).toHaveValue('1')
    await expect(page.getByRole('button', {name: 'Blad van een'})).toBeVisible()
    // saving goes to the number that is shown
    await page.getByTitle('Project-nr').fill('3')
    const saved = await app.save(backend, 3)
    expect(saved).toBeTruthy()
})

test('undo and redo with the buttons and the keyboard', async ({page, app, backend}) => {
    await app.open(backend)
    const undo = page.getByRole('button', {name: /Ongedaan/}),
        redo = page.getByRole('button', {name: /Opnieuw/})
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()
    await page.getByText('＋ blad').click()
    await expect(page.getByRole('button', {name: 'Blad 2'})).toBeVisible()
    await undo.click()
    await expect(page.getByRole('button', {name: 'Blad 2'})).toHaveCount(0)
    await expect(redo).toBeEnabled()
    await redo.click()
    await expect(page.getByRole('button', {name: 'Blad 2'})).toBeVisible()
    await page.keyboard.press('Control+z')
    await expect(page.getByRole('button', {name: 'Blad 2'})).toHaveCount(0)
    await page.keyboard.press('Control+y')
    await expect(page.getByRole('button', {name: 'Blad 2'})).toBeVisible()
    await page.keyboard.press('Control+z')
    await expect(page.getByRole('button', {name: 'Blad 2'})).toHaveCount(0)
    await page.keyboard.press('Control+Shift+z')
    await expect(page.getByRole('button', {name: 'Blad 2'})).toBeVisible()
})

test('JSON export downloads the project with its own components; JSON import loads a project file', async ({page, app, backend}) => {
    await backend.addSymbol({k: 'custom:z', name: 'Zelf', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 24, y2: 12}]})
    await app.open(backend, withCircuit({footer: {titel: 'Villa'}}))
    await page.locator('#btn-export').click()
    await page.locator('#export-type-json').check()
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-confirm').click()])
    expect(download.suggestedFilename()).toBe('Villa.json')
    const out = JSON.parse(readFileSync(await download.path(), 'utf8'))
    expect(out.een[0].name).toBe('Hoofd')
    expect(out.custom.map((c) => c.id)).toContain('z')
    // import: an old-format file is migrated like a loaded project
    await page.locator('#import-input').setInputFiles({name: 'oud.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldFormat()))})
    await expect(page.locator('.tree')).toContainText('Oud sc')
})

test.describe('the backend has no symbols', () => {
    test('shows a message with a retry button until the symbols can be loaded', async ({page, backend}) => {
        backend.symbolsDown = true
        await page.goto('/')
        await expect(page.getByText(/symbolen konden niet geladen worden/)).toBeVisible()
        await expect(page.getByRole('button', {name: 'Components'})).toHaveCount(0)
        backend.symbolsDown = false
        await page.getByRole('button', {name: 'Opnieuw proberen'}).click()
        await expect(page.getByRole('button', {name: 'Components'})).toBeVisible()
    })
    test('shows that the symbols are loading', async ({page, backend}) => {
        let open
        backend.gate = new Promise((r) => (open = r))
        await page.goto('/')
        await expect(page.getByText('Symbolen laden…')).toBeVisible()
        open()
        await expect(page.getByRole('button', {name: 'Components'})).toBeVisible()
    })
})

test('the check button shows the number of errors and warnings of the schema', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await expect(page.getByRole('button', {name: /Controleer/})).toHaveText(/✖2.*⚠/)
})
