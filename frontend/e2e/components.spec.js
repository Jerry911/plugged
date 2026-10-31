// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The "Components" tab: the symbol library with its drawing editor. Symbols are stored by the backend and shared by both schemas.
import {test, expect} from './fixtures.js'
import {withCircuit} from './data.js'

const board = 'svg[viewBox="0 0 24 24"]'
const menu = (page) => page.locator('.pal')
// a button of the menu: the icon of some symbols contains a letter of its own (the M of the motor), so allow a short prefix
const entry = (page, name) => menu(page).locator('button').filter({hasText: new RegExp('^.{0,2}' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')})
// the categories of the menu are folded: searching opens them
const pick = async (page, name) => {
    await page.getByPlaceholder('Zoek component…').fill(name.replace(/ ✎$/, ''))
    await entry(page, name).click()
    await page.getByPlaceholder('Zoek component…').fill('')
}
const name = (page) => page.getByPlaceholder('Naam component')
const shapes = (page) => page.locator(`.cdraw ${board} > g`).first().locator('> *')
const mine = {k: 'custom:1', name: 'Mijn ding', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 1, y1: 12, x2: 20, y2: 12}]}
const open = async (page, app, backend, doc) => {
    await app.open(backend, doc)
    await app.tab('Components')
    await expect(page.getByText('＋ Nieuw component')).toBeVisible()
}
const newComponent = async (page) => {
    await page.getByText('＋ Nieuw component').click()
    await expect(name(page)).toBeVisible()
}

test('the menu groups the components by category and can be searched', async ({page, app, backend}) => {
    await open(page, app, backend)
    expect(await menu(page).locator('details').count()).toBeGreaterThan(3)
    const search = page.getByPlaceholder('Zoek component…')
    await search.fill('oven')
    await expect(entry(page, 'Oven')).toBeVisible()
    await expect(entry(page, 'Motor')).toHaveCount(0)
    await search.fill('zzzz')
    await expect(menu(page).locator('details')).toHaveCount(0)
    await search.fill('')
    expect(await menu(page).locator('details').count()).toBeGreaterThan(3)
})

test('opening a standard component shows its drawing and keeps its key when saved', async ({page, app, backend}) => {
    await open(page, app, backend)
    await pick(page, 'Oven')
    await expect(page.getByText('Standaardsymbool', {exact: true})).toBeVisible()
    expect(await shapes(page).count()).toBeGreaterThan(0)
    await name(page).fill('Oven 2')
    await expect(page.getByText('● niet opgeslagen')).toBeVisible()
    await page.locator('.cactions').getByRole('button', {name: 'Opslaan', exact: true}).click()
    await expect(page.getByText('● niet opgeslagen')).toHaveCount(0)
    await expect.poll(() => backend.symbolByName('Oven 2')).toBeTruthy()
    const saved = await backend.symbolByName('Oven 2')
    expect(saved.k).toBe('oven')
    await page.getByPlaceholder('Zoek component…').fill('Oven 2')
    await expect(menu(page).getByText('Oven 2 ✎')).toBeVisible() // an edited standard symbol is marked
    await expect(page.getByText('Standaardsymbool, aangepast')).toBeVisible()
})

test('drawing shapes: line, circle, rectangle, half circle and text; undo and clear', async ({page, app, backend, dialogs}) => {
    await open(page, app, backend)
    await newComponent(page)
    await expect(page.getByText('Eigen symbool', {exact: true})).toBeVisible()
    await expect(shapes(page)).toHaveCount(0)
    await app.clickSvg(`.cdraw ${board}`, 2, 12)
    await app.clickSvg(`.cdraw ${board}`, 10, 12)
    await expect(shapes(page)).toHaveCount(1)
    await page.getByRole('button', {name: 'Cirkel (midden, rand)', exact: true}).click()
    await app.clickSvg(`.cdraw ${board}`, 12, 12)
    await app.clickSvg(`.cdraw ${board}`, 15, 12)
    await page.getByRole('button', {name: 'Rechthoek'}).click()
    await app.clickSvg(`.cdraw ${board}`, 5, 5)
    await app.clickSvg(`.cdraw ${board}`, 9, 9)
    await page.getByRole('button', {name: 'Halve cirkel (midden, rand)', exact: true}).click()
    await app.clickSvg(`.cdraw ${board}`, 12, 12)
    await app.clickSvg(`.cdraw ${board}`, 15, 12)
    dialogs.answers.push('X')
    await page.getByRole('button', {name: 'Tekst', exact: true}).click()
    await app.clickSvg(`.cdraw ${board}`, 6, 6)
    await expect(shapes(page)).toHaveCount(5)
    await page.getByTitle('Laatste vorm ongedaan maken').click()
    await expect(shapes(page)).toHaveCount(4)
    await page.getByText('Leegmaken').click()
    await expect(shapes(page)).toHaveCount(0)
})

test('a new component needs a name and a shape', async ({page, app, backend, dialogs}) => {
    await open(page, app, backend)
    await newComponent(page)
    await page.getByRole('button', {name: 'Toevoegen'}).click()
    expect(dialogs.messages.at(-1)).toBe('Geef een naam en teken minstens één vorm.')
    await name(page).fill('Zonder vorm')
    await page.getByRole('button', {name: 'Toevoegen'}).click()
    expect(dialogs.messages.filter((m) => m.startsWith('Geef een naam')).length).toBe(2)
    expect(await backend.symbolByName('Zonder vorm')).toBeUndefined()
})

test('a new component is stored by the backend and then available in the eendraadschema and on the situatieschema', async ({page, app, backend}) => {
    await open(page, app, backend, withCircuit())
    await newComponent(page)
    await app.clickSvg(`.cdraw ${board}`, 2, 12)
    await app.clickSvg(`.cdraw ${board}`, 22, 12)
    await name(page).fill('Testlamp')
    await page.getByPlaceholder('Categorie').fill('Testcategorie')
    await page.getByRole('button', {name: 'Toevoegen'}).click()
    await page.getByPlaceholder('Zoek component…').fill('Testlamp')
    await expect(entry(page, 'Testlamp')).toBeVisible()
    await expect.poll(() => backend.symbolByName('Testlamp')).toBeTruthy() // the backend answers asynchronously
    const stored = await backend.symbolByName('Testlamp')
    expect(stored).toMatchObject({cat: 'Testcategorie', place: true})
    expect(stored.k).toMatch(/^custom:/)
    expect(stored.shapes).toHaveLength(1)
    // eendraadschema: in the palette, under its category, and addable under a circuit
    await app.tab('Eendraadschema')
    await app.drawn('K').click()
    await app.add('Testlamp')
    const saved = await app.save(backend)
    const kids = saved.een[0].tree[0].children[0].children[0].children
    expect(kids.at(-1).type).toBe(stored.k)
    // situatieschema: it is one of the components of the schema that still have to be placed, and a general component
    await app.tab('Situatieschema')
    await expect(page.getByText(/Nergens geplaatst \(4\)/)).toBeVisible()
    await page.getByLabel('Zoek component').fill('Testlamp')
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
    await pick(page, 'Mijn ding')
    await page.getByText('Mag hangen onder (1)').click() // the list is folded
    await page.getByRole('button', {name: 'Alles', exact: true}).click()
    await expect(page.getByText(/Mag hangen onder \(\d{2,}\)/)).toBeVisible()
    await page.getByRole('button', {name: 'Geen', exact: true}).click()
    await expect(page.getByText('Mag hangen onder (0)')).toBeVisible()
    await page.getByLabel('Kring (automaat)').check()
    await page.getByLabel(/Plaatsbaar op het/).uncheck()
    await page.locator('.cactions').getByRole('button', {name: 'Opslaan', exact: true}).click()
    await expect.poll(async () => (await backend.symbol('custom:1')).place).toBe(false)
    expect((await backend.symbol('custom:1')).parents).toEqual(['kring'])
})

test('duplicate makes an own copy of a standard component', async ({page, app, backend}) => {
    await open(page, app, backend)
    await pick(page, 'Oven')
    await page.getByRole('button', {name: 'Dupliceer'}).click()
    await expect(name(page)).toHaveValue('Oven (kopie)')
    await expect(page.getByText('Eigen symbool', {exact: true})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Standaard herstellen', exact: true})).toHaveCount(0)
})

test('switching away from unsaved changes asks for confirmation', async ({page, app, backend, dialogs}) => {
    await open(page, app, backend)
    await pick(page, 'Oven')
    await name(page).fill('Oven 2')
    dialogs.confirm = false
    await pick(page, 'Motor')
    await expect(name(page)).toHaveValue('Oven 2')
    expect(dialogs.messages.at(-1)).toMatch(/Niet-opgeslagen wijzigingen/)
    dialogs.confirm = true
    await pick(page, 'Motor')
    await expect(name(page)).toHaveValue('Motor')
})

test('a standard component can be restored; "Maak standaard" makes the edit the new standard', async ({page, app, backend}) => {
    await open(page, app, backend)
    await pick(page, 'Oven')
    await expect(page.getByRole('button', {name: 'Standaard herstellen', exact: true})).toBeDisabled()
    await name(page).fill('Oven 2')
    await page.locator('.cactions').getByRole('button', {name: 'Opslaan', exact: true}).click()
    await expect(page.getByText('Standaardsymbool, aangepast')).toBeVisible()
    await page.getByRole('button', {name: 'Standaard herstellen', exact: true}).click()
    await expect(name(page)).toHaveValue('Oven')
    await expect(page.getByText('Standaardsymbool', {exact: true})).toBeVisible()
    await expect.poll(async () => (await backend.symbol('oven')).name).toBe('Oven')
    // make the edit the standard
    try {
        await name(page).fill('Oven 3')
        await page.locator('.cactions').getByRole('button', {name: 'Opslaan', exact: true}).click()
        await page.getByRole('button', {name: /Maak standaard/}).click()
        await expect(page.getByText('Standaardsymbool', {exact: true})).toBeVisible()
    } finally {
        // the real application remembers the new standard until the end of the run: put the original back so the other tests find "Oven"
        await backend.resetStandard('oven')
    }
})

test('own components can be removed after confirmation; standard ones too, and "Alle standaard herstellen" brings them back', async ({page, app, backend, dialogs}) => {
    await backend.addSymbol(mine)
    await open(page, app, backend)
    await pick(page, 'Mijn ding')
    dialogs.confirm = false
    await page.getByRole('button', {name: 'Verwijder'}).click()
    expect(await backend.symbol('custom:1')).toBeTruthy()
    dialogs.confirm = true
    await page.getByRole('button', {name: 'Verwijder'}).click()
    await page.getByPlaceholder('Zoek component…').fill('Mijn')
    await expect(entry(page, 'Mijn ding')).toHaveCount(0)
    await expect(page.getByText(/Kies links een component/)).toBeVisible()
    await expect.poll(() => backend.symbol('custom:1')).toBeFalsy()
    // a standard component: the confirmation mentions the way back
    await pick(page, 'Oven')
    await page.getByRole('button', {name: 'Verwijder'}).click()
    expect(dialogs.messages.at(-1)).toMatch(/Alle standaard herstellen/)
    await page.getByPlaceholder('Zoek component…').fill('Oven')
    await expect(entry(page, 'Oven')).toHaveCount(0)
    await page.getByRole('button', {name: 'Alle standaard herstellen'}).click()
    await expect(page.getByText('Alle standaardsymbolen hersteld ✓')).toBeVisible()
    await page.getByPlaceholder('Zoek component…').fill('Oven')
    await expect(entry(page, 'Oven')).toBeVisible()
})

test('a symbol the backend refuses is reported and the changes are kept', async ({page, app, backend}) => {
    await open(page, app, backend)
    await pick(page, 'Oven')
    await name(page).fill('Oven 2')
    backend.symbolsDown = true
    await page.locator('.cactions').getByRole('button', {name: 'Opslaan', exact: true}).click()
    await expect(page.getByText(/Niet opgeslagen: de backend/)).toBeVisible()
    await expect(name(page)).toHaveValue('Oven 2')
})

test('the grid size changes the grid of the drawing board', async ({page, app, backend}) => {
    await open(page, app, backend)
    await newComponent(page)
    await page.getByLabel('Raster').selectOption('2')
    await app.clickSvg(`.cdraw ${board}`, 3, 12) // snaps to the grid of 2
    await app.clickSvg(`.cdraw ${board}`, 9, 12)
    await name(page).fill('Raster')
    await page.getByRole('button', {name: 'Toevoegen'}).click()
    await expect.poll(() => backend.symbolByName('Raster')).toBeTruthy() // the backend answers asynchronously
    const c = await backend.symbolByName('Raster')
    expect(c.shapes[0].x1 % 2).toBe(0)
    expect(c.shapes[0].x2 % 2).toBe(0)
})
