// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Account → Mijn account → Thema: the colours of the interface, stored on the server for every device. The drawings never change colour.
import {test, expect} from './fixtures.js'
import {withCircuit} from './data.js'

const background = (locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor)

test('a theme chosen on Mijn account shows at once, comes back from the server on another browser, and leaves the drawings black on white', async ({page, app, backend}) => {
    await app.open(backend, withCircuit())
    // Marine: the navy top bar
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'marine')
    expect(await background(page.locator('#top-bar'))).toBe('rgb(31, 58, 95)')
    await page.locator('#tab-account').click()
    await page.locator('#account-tab-account').click()
    await expect(page.locator('#account-theme-marine')).toBeChecked()
    // Werkbank: dark at once
    const stored = page.waitForResponse((response) => response.url().endsWith('/api/account/theme') && response.request().method() === 'PUT')
    await page.locator('#account-theme-werkbank').check()
    expect((await stored).ok()).toBeTruthy()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'werkbank')
    expect(await background(page.locator('#top-bar'))).toBe('rgb(11, 24, 40)')
    expect(await background(page.locator('body'))).toBe('rgb(15, 31, 51)')
    // the sheet is paper: white, whatever the theme
    await app.tab('een')
    expect(await background(page.locator('.main svg.sheet').first())).toBe('rgb(255, 255, 255)')
    // another browser (nothing remembered here): the theme comes from the server after signing in
    await page.evaluate(() => localStorage.removeItem('plugged.theme'))
    await page.reload()
    await expect(page.locator('#tab-comp')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'werkbank')
    // Helder: a white top bar
    await page.locator('#tab-account').click()
    await page.locator('#account-tab-account').click()
    await page.locator('#account-theme-helder').check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'helder')
    expect(await background(page.locator('#top-bar'))).toBe('rgb(255, 255, 255)')
    await page.locator('#account-theme-marine').check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'marine')
})
