// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The "kader" (title block) at the bottom of every sheet and the Kaderinfo dialog.
import {test, expect} from './fixtures.js'
import {project, withCircuit} from './data.js'

const dialog = (page) => page.getByRole('dialog', {name: 'Kaderinfo'})
const field = (page, label) => dialog(page).locator('label', {hasText: new RegExp('^' + label + '$')}).locator('xpath=following-sibling::input[1]')

test('the Kaderinfo dialog edits the footer of the sheets and the info is saved', async ({page, app, backend}) => {
    await app.open(backend, project({footer: {}}))
    await page.getByRole('button', {name: /Kaderinfo/}).click()
    await expect(dialog(page)).toBeVisible()
    await field(page, 'Titel').fill('Villa Zonneweide')
    await field(page, 'Straat').fill('Dorpstraat')
    await field(page, 'Nr').fill('12')
    await field(page, 'Postcode').fill('9000')
    await field(page, 'Gemeente').fill('Gent')
    await field(page, 'Eigenaar').fill('Jan Peeters')
    await field(page, 'Getekend door').fill('Piet')
    const sheet = page.locator('svg.sheet').first()
    await expect(sheet).toContainText('Villa Zonneweide')
    await expect(sheet).toContainText('Dorpstraat 12, 9000 Gent')
    await expect(sheet).toContainText('Jan Peeters')
    await expect(sheet).toContainText('Piet')
    const saved = await app.save(backend)
    expect(saved.footer).toMatchObject({titel: 'Villa Zonneweide', straat: 'Dorpstraat', nr: '12', postcode: '9000', gemeente: 'Gent', eigenaar: 'Jan Peeters', tekenaar: 'Piet'})
})

test('the dialog closes with the cross and with Escape', async ({page, app, backend}) => {
    await app.open(backend)
    await page.getByRole('button', {name: /Kaderinfo/}).click()
    await dialog(page).getByText('✕').click()
    await expect(dialog(page)).toHaveCount(0)
    await page.getByRole('button', {name: /Kaderinfo/}).click()
    await dialog(page).locator('input').first().press('Escape')
    await expect(dialog(page)).toHaveCount(0)
})

test('clicking a cell of the footer opens the dialog on that field; empty cells show a hint', async ({page, app, backend}) => {
    await app.open(backend, project({footer: {}}))
    await expect(page.locator('svg.sheet').first()).toContainText('klik om in te vullen')
    const cells = page.locator('svg.sheet .fcell')
    await expect(cells).toHaveCount(7)
    await cells.nth(3).click() // "getekend door"
    await expect(dialog(page)).toBeVisible()
    await expect(field(page, 'Getekend door')).toBeFocused()
    await dialog(page).getByText('✕').click()
    await cells.nth(0).click() // title
    await expect(field(page, 'Titel')).toBeFocused()
})

test('the situatieschema shows the same footer; the sheet number follows the number of sheets', async ({page, app, backend}) => {
    await app.open(backend, withCircuit({footer: {titel: 'Villa'}}))
    const sheet = page.locator('svg.sheet').first()
    await expect(sheet).toContainText('Blad 1/1')
    await page.getByRole('button', {name: '＋ blad', exact: true}).click()
    await expect(sheet).toContainText('Blad 2/2')
    await app.tab('Situatieschema')
    await expect(sheet).toContainText('Villa')
    await sheet.locator('.fcell').first().click()
    await expect(dialog(page)).toBeVisible()
})
