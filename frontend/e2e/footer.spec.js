// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The "kader" (title block) at the bottom of every sheet and the Kaderinfo dialog.
import {test, expect, t} from './fixtures.js'
import {project, withCircuit} from './data.js'

const dialog = (page) => page.locator('#footer-dialog')
// the input of a footer field, by the key of the field (ean, straat, ...)
const field = (page, key) => page.locator('#footer-' + key)

test('the Kaderinfo dialog edits the footer of the sheets and the info is saved', async ({page, app, backend}) => {
    await app.open(backend, project({footer: {}}))
    await page.locator('#btn-footer').click()
    await expect(dialog(page)).toBeVisible()
    await field(page, 'ean').fill('541448820012345678')
    await field(page, 'straat').fill('Dorpstraat')
    await field(page, 'nr').fill('12')
    await field(page, 'postcode').fill('9000')
    await field(page, 'gemeente').fill('Gent')
    await field(page, 'eigenaar').fill('Jan Peeters')
    await field(page, 'tekenaar').fill('Piet')
    await field(page, 'schaal').fill('1:75')
    const sheet = page.locator('svg.sheet').first()
    await expect(sheet).toContainText('541448820012345678')
    await expect(sheet).toContainText('Dorpstraat 12, 9000 Gent')
    await expect(sheet).toContainText('Jan Peeters')
    await expect(sheet).toContainText('Piet')
    // the scale in its own box under the date
    await expect(sheet.locator('.sheet-scale')).toHaveText(t('sheet.cells.scale') + ' 1:75')
    const saved = await app.save(backend)
    expect(saved.footer).toMatchObject({ean: '541448820012345678', schaal: '1:75', straat: 'Dorpstraat', nr: '12', postcode: '9000', gemeente: 'Gent', eigenaar: 'Jan Peeters', tekenaar: 'Piet'})
})

test('the dialog closes with the cross and with Escape', async ({page, app, backend}) => {
    await app.open(backend)
    await page.locator('#btn-footer').click()
    await page.locator('#footer-close').click()
    await expect(dialog(page)).toHaveCount(0)
    await page.locator('#btn-footer').click()
    await dialog(page).locator('input').first().press('Escape')
    await expect(dialog(page)).toHaveCount(0)
})

test('clicking a cell of the footer opens the dialog on that field; empty cells show a hint', async ({page, app, backend}) => {
    await app.open(backend, project({footer: {}}))
    await expect(page.locator('svg.sheet').first()).toContainText(t('sheet.clickToFill'))
    const cell = (field) => page.locator('#eds-sheet-1-drawing-footer-' + field)
    await expect(page.locator('#eds-sheet-1-drawing .fcell')).toHaveCount(11)
    await cell('tekenaar').click()
    await expect(dialog(page)).toBeVisible()
    await expect(field(page, 'tekenaar')).toBeFocused()
    await page.locator('#footer-close').click()
    await cell('ean').click()
    await expect(field(page, 'ean')).toBeFocused()
    await page.locator('#footer-close').click()
    // the scale box opens the dialog on the scale
    await cell('schaal').click()
    await expect(field(page, 'schaal')).toBeFocused()
    await page.locator('#footer-close').click()
    // the cell of the measurements opens it on the earth resistance
    await cell('aardingsweerstand').click()
    await expect(field(page, 'aardingsweerstand')).toBeFocused()
    // fields that are gone from the kader
    await expect(page.locator('#footer-titel')).toHaveCount(0)
    await expect(page.locator('#footer-keurder')).toHaveCount(0)
})

test('the situatieschema shows the same footer; the sheet number follows the number of sheets', async ({page, app, backend}) => {
    await app.open(backend, withCircuit({footer: {eigenaar: 'Villa'}}))
    const sheet = page.locator('svg.sheet').first()
    await expect(sheet).toContainText(t('sheet.pageOf', {number: 1, total: 1}))
    await page.locator('#eds-page-add').click()
    await expect(sheet).toContainText(t('sheet.pageOf', {number: 2, total: 2}))
    await app.tab('sit')
    await expect(sheet).toContainText('Villa')
    await page.locator('#sit-sheet-footer-ean').click()
    await expect(dialog(page)).toBeVisible()
})
