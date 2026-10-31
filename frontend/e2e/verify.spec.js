// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// "Controleer": the check according to AREI, its list of problems and jumping from a problem to the element.
import {test, expect} from './fixtures.js'
import {correct, flawed, node, project} from './data.js'

const panel = (page) => page.getByRole('region', {name: 'Controle'})
const open = (page) => page.getByRole('button', {name: /Controleer/}).click()

test('the panel lists the problems with their counts and can be closed', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await open(page)
    await expect(panel(page)).toContainText('Controle volgens AREI')
    await expect(panel(page)).toContainText(/\d+ fouten · \d+ waarschuwingen · \d+ opmerkingen/)
    await expect(panel(page).getByText(/hangt niet onder een differentieel/)).toBeVisible()
    await panel(page).getByText('Sluiten').click()
    await expect(panel(page)).toHaveCount(0)
    // the button toggles it too
    await open(page)
    await expect(panel(page)).toBeVisible()
    await open(page)
    await expect(panel(page)).toHaveCount(0)
})

test('a new project reports its empty board; an empty schema is reported as empty', async ({page, app, backend}) => {
    await app.open(backend)
    await open(page)
    await expect(panel(page).getByText(/heeft geen kringen/)).toBeVisible()
    await panel(page).getByText('Sluiten').click()
    await backend.seed(2, project({een: [{id: 'a', name: 'Leeg', tree: []}]}))
    await app.load(2)
    await expect(page.getByRole('button', {name: 'Leeg'})).toBeVisible()
    await open(page)
    await expect(panel(page).getByText('Het eendraadschema is leeg.')).toBeVisible()
})

test('a correct schema shows the success message; breaking it brings a warning', async ({page, app, backend}) => {
    await app.open(backend, correct())
    await expect(page.getByRole('button', {name: 'Controleer', exact: true})).toBeVisible() // no error or warning counts
    await open(page)
    await expect(panel(page)).toContainText('✓ Geen fouten of waarschuwingen gevonden')
    await panel(page).getByText('Sluiten').click()
    await app.treeRow('40A 30mA').click()
    await page.getByLabel('Verwijderen', {exact: true}).click()
    await expect(page.getByRole('button', {name: /Controleer/})).toHaveText(/⚠1/)
    await open(page)
    await expect(panel(page)).not.toContainText('Geen fouten of waarschuwingen gevonden')
})

test('clicking a problem selects the element it is about', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await open(page)
    await panel(page).getByText(/hangt niet onder een differentieel/).click()
    await expect(page.getByText('Eigenschappen')).toBeVisible()
    await expect(page.getByLabel('Letter')).toHaveValue('K')
})

test('a problem in the footer opens the Kaderinfo dialog; a problem of the plan opens the situatieschema; a global problem has no element', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await open(page)
    await panel(page).getByText(/Kaderinfo onvolledig/).click()
    await expect(page.getByRole('dialog', {name: 'Kaderinfo'})).toBeVisible()
    await page.getByRole('dialog', {name: 'Kaderinfo'}).getByText('✕').click()
    await panel(page).locator('li', {hasText: /staat niet op het situatieschema/}).first().click()
    await expect(page.getByText(/Muur: klik punten/)).toBeVisible()
    await panel(page).getByText(/Geen aarding/).click()
    await expect(page.getByText('Opbouw')).toBeVisible()
})

test('a problem on another sheet switches to that sheet', async ({page, app, backend}) => {
    const ok = {id: 'a', name: 'Eerste', tree: [node('A', 'aansluiting', [node('B', 'bord')])]}
    const bad = {id: 'b', name: 'Tweede', tree: [node('A2', 'aansluiting', [node('B2', 'bord', [node('K2', 'kring', [node('S2', 'stopcontact')], {info: 'B16 2,5mm²', label: 'Z'})])])]}
    await app.open(backend, project({een: [ok, bad]}))
    await expect(page.getByRole('button', {name: 'Eerste'})).toHaveClass(/on/)
    await open(page)
    await panel(page).getByText(/hangt niet onder een differentieel/).first().click()
    await expect(page.getByRole('button', {name: 'Tweede'})).toHaveClass(/on/)
    await expect(page.getByLabel('Letter')).toHaveValue('Z')
})

test('selecting the text of a message to copy it does not jump to the element', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await open(page)
    const li = panel(page).locator('li', {hasText: /hangt niet onder een differentieel/}).first()
    const box = await li.boundingBox()
    await page.mouse.move(box.x + 30, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + box.height / 2, {steps: 5})
    await page.mouse.up()
    await expect(page.getByText('Eigenschappen')).toHaveCount(0)
    // a plain click still jumps
    // (somewhere else on the line: the same spot twice would be a double click, which selects a word)
    await page.mouse.click(box.x + 8, box.y + box.height / 2)
    await expect(page.getByText('Eigenschappen')).toBeVisible()
})

test('the tab and the button show the number of errors', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await expect(page.locator('.bar').getByTitle('Fouten in eendraadschema').first()).toBeVisible()
    await expect(page.getByRole('button', {name: /Controleer ✖\d+/})).toBeVisible()
})

// Regression: the popup is sticky at the top of the screen, so the element it jumps to must be centred in the part of the screen below it
test('jumping to a problem far down the page scrolls the element to the middle of the visible area, below the popup', async ({page, app, backend}) => {
    const ks = Array.from({length: 16}, (_, i) => node('K' + i, 'kring', [node('S' + i, 'stopcontact')], {label: String.fromCharCode(65 + i), info: 'B16 2,5mm²'}))
    await app.open(backend, project({een: [{id: 'e1', name: 'Groot', tree: [node('A', 'aansluiting', [node('B', 'bord', ks)])]}]}))
    await expect(page.locator('[id^="eds-sheet-"]')).toHaveCount(2)
    await open(page)
    await expect(panel(page)).toBeVisible()
    const last = panel(page).locator('li.iss', {hasText: /hangt niet onder een differentieel/}).last()
    await last.click()
    await expect(page.getByLabel('Letter')).toHaveValue(/^[A-P]$/)
    const target = page.getByLabel('Letter')
    const letter = await target.inputValue()
    const el = page.locator(`svg.sheet [data-nid="K${letter.charCodeAt(0) - 65}"]`).first()
    await expect
        .poll(
            async () => {
                const [b, pop] = [await el.boundingBox(), await panel(page).boundingBox()]
                const vh = page.viewportSize().height,
                    top = pop.y + pop.height,
                    mid = top + (vh - top) / 2
                return Math.abs(b.y + b.height / 2 - mid)
            },
            {timeout: 5000, message: 'the element is centred below the popup'},
        )
        .toBeLessThan(80)
})
