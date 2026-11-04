// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The "Components" tab: the symbol library with its drawing editor. Symbols are stored by the backend and shared by both schemas.
import {test, expect, t} from './fixtures.js'
import {withCircuit} from './data.js'

const board = '#comp-drawing'
const menu = (page) => page.locator('#comp-menu')
// a button of the menu, by the key of its symbol
const entry = (page, key) => page.locator('#comp-item-' + key.replace(/[^A-Za-z0-9_-]/g, '_'))
// the categories of the menu are folded: open the one of the symbol and click it
const pick = async (page, key) => {
    await entry(page, key).evaluate((button) => (button.closest('details').open = true))
    await entry(page, key).click()
}
const name = (page) => page.locator('#comp-name')
const shapes = (page) => page.locator(`${board} > g`).first().locator('> *')
const mine = {k: 'custom:1', name: 'Mijn ding', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 1, y1: 12, x2: 20, y2: 12}]}
const open = async (page, app, backend, doc) => {
    await app.open(backend, doc)
    await app.tab('comp')
    await expect(page.locator('#comp-new')).toBeVisible()
}
const newComponent = async (page) => {
    await page.locator('#comp-new').click()
    await expect(name(page)).toBeVisible()
}

test('the menu groups the components by category and can be searched', async ({page, app, backend}) => {
    await open(page, app, backend)
    expect(await menu(page).locator('details').count()).toBeGreaterThan(3)
    const search = page.locator('#comp-search')
    await search.fill('oven')
    await expect(entry(page, 'oven')).toBeVisible()
    await expect(entry(page, 'motor')).toHaveCount(0)
    await search.fill('zzzz')
    await expect(menu(page).locator('details')).toHaveCount(0)
    await search.fill('')
    expect(await menu(page).locator('details').count()).toBeGreaterThan(3)
})

test('opening a standard component shows its drawing and keeps its key when saved', async ({page, app, backend}) => {
    await open(page, app, backend)
    await pick(page, 'oven')
    await expect(page.locator('#comp-origin', {hasText: new RegExp('^' + t('symbolEditor.origin.standard') + '$')})).toBeVisible()
    expect(await shapes(page).count()).toBeGreaterThan(0)
    await name(page).fill('Oven 2')
    await expect(page.locator('#comp-dirty')).toBeVisible()
    await page.locator('#comp-save').click()
    await expect(page.locator('#comp-dirty')).toHaveCount(0)
    await expect.poll(() => backend.symbolByName('Oven 2')).toBeTruthy()
    const saved = await backend.symbolByName('Oven 2')
    expect(saved.k).toBe('oven')
    await page.locator('#comp-search').fill('Oven 2')
    await expect(entry(page, 'oven')).toHaveText(/Oven 2 ✎$/) // an edited standard symbol is marked
    await expect(page.locator('#comp-origin', {hasText: t('symbolEditor.origin.modified')})).toBeVisible()
})

test('drawing shapes: line, circle, rectangle, half circle and text; undo and clear', async ({page, app, backend, dialogs}) => {
    await open(page, app, backend)
    await newComponent(page)
    await expect(page.locator('#comp-origin', {hasText: new RegExp('^' + t('symbolEditor.origin.own') + '$')})).toBeVisible()
    await expect(shapes(page)).toHaveCount(0)
    await app.clickSvg(board, 2, 12)
    await app.clickSvg(board, 10, 12)
    await expect(shapes(page)).toHaveCount(1)
    await page.locator('#comp-tool-circle').click()
    await app.clickSvg(board, 12, 12)
    await app.clickSvg(board, 15, 12)
    await page.locator('#comp-tool-rect').click()
    await app.clickSvg(board, 5, 5)
    await app.clickSvg(board, 9, 9)
    await page.locator('#comp-tool-arc').click()
    await app.clickSvg(board, 12, 12)
    await app.clickSvg(board, 15, 12)
    dialogs.answers.push('X')
    await page.locator('#comp-tool-text').click()
    await app.clickSvg(board, 6, 6)
    await expect(shapes(page)).toHaveCount(5)
    await page.locator('#comp-undo-shape').click()
    await expect(shapes(page)).toHaveCount(4)
    await page.locator('#comp-clear').click()
    await expect(shapes(page)).toHaveCount(0)
})

test('a new component needs a name and a shape', async ({page, app, backend, dialogs}) => {
    await open(page, app, backend)
    await newComponent(page)
    await page.locator('#comp-save').click()
    expect(dialogs.messages.at(-1)).toBe(t('symbolEditor.nameAndShapeRequired'))
    await name(page).fill('Zonder vorm')
    await page.locator('#comp-save').click()
    expect(dialogs.messages.filter((message) => message === t('symbolEditor.nameAndShapeRequired')).length).toBe(2)
    expect(await backend.symbolByName('Zonder vorm')).toBeUndefined()
})

test('a new component is stored by the backend and then available in the eendraadschema and on the situatieschema', async ({page, app, backend}) => {
    await open(page, app, backend, withCircuit())
    await newComponent(page)
    await app.clickSvg(board, 2, 12)
    await app.clickSvg(board, 22, 12)
    await name(page).fill('Testlamp')
    await page.locator('#comp-category').fill('Testcategorie')
    await page.locator('#comp-save').click()
    await expect.poll(() => backend.symbolByName('Testlamp')).toBeTruthy() // the backend answers asynchronously
    const stored = await backend.symbolByName('Testlamp')
    await page.locator('#comp-search').fill('Testlamp')
    await expect(entry(page, stored.k)).toBeVisible()
    expect(stored).toMatchObject({cat: 'Testcategorie', place: true})
    expect(stored.k).toMatch(/^custom:/)
    expect(stored.shapes).toHaveLength(1)
    // eendraadschema: in the palette, under its category, and addable under a circuit
    await app.tab('een')
    await app.drawn('K').click()
    await app.add(stored.k)
    const saved = await app.save(backend)
    const kids = saved.een[0].tree[0].children[0].children[0].children
    expect(kids.at(-1).type).toBe(stored.k)
    // situatieschema: it is one of the components of the schema that still have to be placed, and a general component
    await app.tab('sit')
    await expect(page.locator('#sit-unplaced-title')).toHaveText(new RegExp(t('situation.unplacedTitle', {count: 4}).replace(/[()]/g, '\\$&')))
    await page.locator('#comp-filter').fill('Testlamp')
    await expect(page.locator('.compbtn[id^="comp-"]')).toHaveCount(1)
    // and it travels along in the JSON export
    await app.project()
    await page.locator('#btn-export').click()
    await page.locator('#export-type-json').check()
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-confirm').click()])
    const out = JSON.parse(await (await import('node:fs')).promises.readFile(await download.path(), 'utf8'))
    expect(out.custom.map((c) => c.name)).toContain('Testlamp')
})

test('placement and parents of a component can be changed', async ({page, app, backend}) => {
    await backend.addSymbol(mine)
    await open(page, app, backend)
    await pick(page, 'custom:1')
    await expect(page.locator('#comp-parents summary')).toHaveText(t('symbolEditor.parents', {count: 1}))
    await page.locator('#comp-parents summary').click() // the list is folded
    await page.locator('#comp-parents-all').click()
    await expect(page.locator('#comp-parents summary')).toHaveText(/\(\d{2,}\)/)
    await page.locator('#comp-parents-none').click()
    await expect(page.locator('#comp-parents summary')).toHaveText(t('symbolEditor.parents', {count: 0}))
    await page.locator('#comp-parent-kring').check()
    await page.locator('#comp-placeable').uncheck()
    await page.locator('#comp-save').click()
    await expect.poll(async () => (await backend.symbol('custom:1')).place).toBe(false)
    expect((await backend.symbol('custom:1')).parents).toEqual(['kring'])
})

test('duplicate makes an own copy of a standard component', async ({page, app, backend}) => {
    await open(page, app, backend)
    await pick(page, 'oven')
    await page.locator('#comp-duplicate').click()
    await expect(name(page)).toHaveValue('Oven (kopie)')
    await expect(page.locator('#comp-origin', {hasText: new RegExp('^' + t('symbolEditor.origin.own') + '$')})).toBeVisible()
    await expect(page.locator('#comp-restore')).toHaveCount(0)
})

test('switching away from unsaved changes asks for confirmation', async ({page, app, backend, dialogs}) => {
    await open(page, app, backend)
    await pick(page, 'oven')
    await name(page).fill('Oven 2')
    dialogs.confirm = false
    await pick(page, 'motor')
    await expect(name(page)).toHaveValue('Oven 2')
    expect(dialogs.messages.at(-1)).toBe(t('symbolEditor.confirmDiscard'))
    dialogs.confirm = true
    await pick(page, 'motor')
    await expect(name(page)).toHaveValue('Motor')
})

test('a standard component can be restored; "Maak standaard" makes the edit the new standard', async ({page, app, backend}) => {
    await open(page, app, backend)
    await pick(page, 'oven')
    await expect(page.locator('#comp-restore')).toBeDisabled()
    await name(page).fill('Oven 2')
    await page.locator('#comp-save').click()
    await expect(page.locator('#comp-origin', {hasText: t('symbolEditor.origin.modified')})).toBeVisible()
    await page.locator('#comp-restore').click()
    await expect(name(page)).toHaveValue('Oven')
    await expect(page.locator('#comp-origin', {hasText: new RegExp('^' + t('symbolEditor.origin.standard') + '$')})).toBeVisible()
    await expect.poll(async () => (await backend.symbol('oven')).name).toBe('Oven')
    // make the edit the standard
    try {
        await name(page).fill('Oven 3')
        await page.locator('#comp-save').click()
        await page.locator('#comp-make-standard').click()
        await expect(page.locator('#comp-origin', {hasText: new RegExp('^' + t('symbolEditor.origin.standard') + '$')})).toBeVisible()
    } finally {
        // the real application remembers the new standard until the end of the run: put the original back so the other tests find "Oven"
        await backend.resetStandard('oven')
    }
})

test('own components can be removed after confirmation; standard ones too, and "Alle standaard herstellen" brings them back', async ({page, app, backend, dialogs}) => {
    await backend.addSymbol(mine)
    await open(page, app, backend)
    await pick(page, 'custom:1')
    dialogs.confirm = false
    await page.locator('#comp-delete').click()
    expect(await backend.symbol('custom:1')).toBeTruthy()
    dialogs.confirm = true
    await page.locator('#comp-delete').click()
    await page.locator('#comp-search').fill('Mijn')
    await expect(entry(page, 'custom:1')).toHaveCount(0)
    await expect(page.locator('#comp-intro')).toBeVisible()
    await expect.poll(() => backend.symbol('custom:1')).toBeFalsy()
    // a standard component: the confirmation mentions the way back
    await page.locator('#comp-search').fill('')
    await pick(page, 'oven')
    await page.locator('#comp-delete').click()
    expect(dialogs.messages.at(-1)).toContain(t('symbolEditor.deleteStandardNote'))
    await page.locator('#comp-search').fill('Oven')
    await expect(entry(page, 'oven')).toHaveCount(0)
    await page.locator('#comp-restore-all').click()
    await expect(page.locator('#comp-message', {hasText: t('symbolEditor.allRestored')})).toBeVisible()
    await page.locator('#comp-search').fill('Oven')
    await expect(entry(page, 'oven')).toBeVisible()
})

test('a symbol the backend refuses is reported and the changes are kept', async ({page, app, backend}) => {
    await open(page, app, backend)
    await pick(page, 'oven')
    await name(page).fill('Oven 2')
    backend.symbolsDown = true
    await page.locator('#comp-save').click()
    await expect(page.locator('#comp-message', {hasText: t('symbolEditor.notSaved')})).toBeVisible()
    await expect(name(page)).toHaveValue('Oven 2')
})

test('the grid size changes the grid of the drawing board', async ({page, app, backend}) => {
    await open(page, app, backend)
    await newComponent(page)
    await page.locator('#comp-grid').selectOption('2')
    await app.clickSvg(board, 3, 12) // snaps to the grid of 2
    await app.clickSvg(board, 9, 12)
    await name(page).fill('Raster')
    await page.locator('#comp-save').click()
    await expect.poll(() => backend.symbolByName('Raster')).toBeTruthy() // the backend answers asynchronously
    const snapped = await backend.symbolByName('Raster')
    expect(snapped.shapes[0].x1 % 2).toBe(0)
    expect(snapped.shapes[0].x2 % 2).toBe(0)
})
