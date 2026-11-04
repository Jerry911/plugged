// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The language of the application: Dutch, French or English, picked from the browser and changed with the picker in the top bar.
import {test, expect, t} from './fixtures.js'

const picker = (page) => page.locator('#language-select')

test('the picker switches every text, the html language and the names of the standard symbols; the choice survives a reload', async ({page, app, backend}) => {
    await app.open(backend)
    await expect(picker(page)).toHaveValue('nl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl')
    await expect(page.locator('#tab-een')).toContainText(t('tabs.oneWire'))
    await picker(page).selectOption('fr')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await expect(page.locator('#tab-een')).toContainText(t('tabs.oneWire', {}, 'fr'))
    await expect(page.locator('#tab-sit')).toContainText(t('tabs.situation', {}, 'fr'))
    await expect(page.locator('#eds-palette-stopcontact')).toContainText(t('symbols.stopcontact', {}, 'fr'))
    await page.reload()
    await expect(picker(page)).toHaveValue('fr')
    await expect(page.locator('#tab-comp')).toContainText(t('tabs.components', {}, 'fr'))
    await picker(page).selectOption('en')
    await expect(page.locator('#tab-info')).toContainText(t('tabs.info', {}, 'en'))
    await expect(page.locator('#eds-palette-stopcontact')).toContainText(t('symbols.stopcontact', {}, 'en'))
})

test('new sheets are named in the chosen language; the names of existing sheets stay', async ({page, app, backend}) => {
    await app.open(backend)
    await picker(page).selectOption('en')
    await page.locator('#eds-page-add').click()
    await expect(page.locator('#eds-page-2')).toHaveText(t('pages.sheetName', {number: 2}, 'en'))
    const saved = await app.save(backend, 1, 'en')
    expect(saved.een.map((sheet) => sheet.name)).toEqual([t('pages.sheetName', {number: 1}), t('pages.sheetName', {number: 2}, 'en')])
})

test('requests to the backend carry the chosen language', async ({page, app, backend}) => {
    await app.open(backend)
    await picker(page).selectOption('fr')
    const request = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === '/api/symbols')
    await page.reload()
    expect((await request).headers()['accept-language']).toBe('fr')
})

test.describe('a browser in English', () => {
    test.use({locale: 'en-GB'})
    test('starts in English', async ({page, app, backend}) => {
        await app.open(backend)
        await expect(picker(page)).toHaveValue('en')
        await expect(page.locator('#tab-een')).toContainText(t('tabs.oneWire', {}, 'en'))
    })
})

test.describe('a browser in a language Plugged does not speak', () => {
    test.use({locale: 'de-DE'})
    test('starts in Dutch', async ({page, app, backend}) => {
        await app.open(backend)
        await expect(picker(page)).toHaveValue('nl')
    })
})
