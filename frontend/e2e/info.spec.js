// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Info tab (about, how to, faq, contact, donate) and the combined import / export buttons of the top bar.
import {readFileSync} from 'node:fs'
import {test, expect, testInfo} from './fixtures.js'
import {edsFile, project, withCircuit} from './data.js'

test.describe('Info page', () => {
    test('the Info tab shows the page and the other tabs bring the editor back', async ({page, app, backend}) => {
        await app.open(backend)
        await page.locator('#tab-info').click()
        await expect(page.locator('#info-page')).toBeVisible()
        await expect(page.getByRole('heading', {name: 'Hoe gebruik je Plugged?'})).toBeVisible()
        await page.locator('#tab-een').click()
        await expect(page.locator('#info-page')).toHaveCount(0)
        await expect(page.locator('svg.sheet').first()).toBeVisible()
    })
    test('faq entries fold open', async ({page, app, backend}) => {
        await app.open(backend)
        await page.locator('#tab-info').click()
        const q = page.locator('details.faq').first()
        await expect(q).not.toHaveAttribute('open', '')
        await q.locator('summary').click()
        await expect(q).toHaveAttribute('open', '')
    })
    test('the donate button links to the configured PayPal page', async ({page, app, backend}) => {
        await app.open(backend)
        await page.locator('#tab-info').click()
        await expect(page.locator('#donate-button')).toHaveAttribute('href', testInfo.donateUrl)
    })
    test('the contact form opens the mail program and never sends anything itself', async ({page, app, backend}) => {
        const posted = []
        page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/contact') && posted.push(r.url()))
        await app.open(backend)
        await page.locator('#tab-info').click()
        await page.locator('#contact-name').fill('Jan')
        await page.locator('#contact-message').fill('Dit is een testbericht')
        // a click on a mailto: link is handed to the system; Playwright sees no navigation, so look at the link that is clicked
        await page.evaluate(() => {
            window.__mailto = []
            HTMLAnchorElement.prototype.click = function () {
                window.__mailto.push(this.href)
            }
        })
        await page.locator('#contact-send').click()
        const [href] = await page.evaluate(() => window.__mailto)
        expect(href).toBe(`mailto:${testInfo.contactEmail}?subject=Plugged%20-%20Jan&body=Dit%20is%20een%20testbericht%0A%0AJan`)
        await expect(page.locator('#contact-hint')).toContainText('zou nu moeten openen')
        await expect(page.locator('#contact-address')).toHaveAttribute('href', 'mailto:' + testInfo.contactEmail)
        expect(posted).toEqual([])
    })
    test('without a contact address there is no form', async ({page, app, backend}) => {
        backend.info = {donateUrl: '', contactEmail: ''}
        await app.open(backend)
        await page.locator('#tab-info').click()
        await expect(page.locator('#contact-form')).toHaveCount(0)
        await expect(page.locator('#contact-disabled')).toBeVisible()
        await expect(page.locator('#donate-button')).toBeDisabled()
    })
})

test.describe('import and export buttons', () => {
    test('Exporteren opens a dialog; .eds gives an .eds file named after the project', async ({page, app, backend}) => {
        await app.open(backend, withCircuit({footer: {titel: 'Villa'}}))
        await app.project()
        await page.locator('#btn-export').click()
        await expect(page.getByRole('dialog', {name: 'Exporteren'})).toBeVisible()
        await expect(page.locator('#export-type-json')).toBeChecked()
        await page.locator('#export-type-eds').check()
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-confirm').click()])
        expect(download.suggestedFilename()).toBe('Villa.eds')
        expect(readFileSync(await download.path(), 'utf8').startsWith('EDS')).toBe(true)
        await expect(page.getByRole('dialog', {name: 'Exporteren'})).toHaveCount(0)
        await expect(page.getByText(/EDS geëxporteerd/)).toBeVisible()
    })
    test('the default choice is the project file; Escape closes the dialog without a download', async ({page, app, backend}) => {
        await app.open(backend, withCircuit({footer: {titel: 'Villa'}}))
        await app.project()
        await page.locator('#btn-export').click()
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-confirm').click()])
        expect(download.suggestedFilename()).toBe('Villa.json')
        await app.project()
        await page.locator('#btn-export').click()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog', {name: 'Exporteren'})).toHaveCount(0)
    })
    test('one Importeren button takes both json and eds files', async ({page, app, backend}) => {
        await app.open(backend)
        await expect(page.locator('#import-input')).toHaveAttribute('accept', '.json,.eds')
        await page.locator('#import-input').setInputFiles({name: 'huis.eds', mimeType: 'application/octet-stream', buffer: Buffer.from(edsFile())})
        await expect(page.getByText(/EDS geïmporteerd/)).toBeVisible()
        await page.locator('#import-input').setInputFiles({name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project({footer: {titel: 'Uit json'}})))})
        await expect(page.getByText('Project geïmporteerd')).toBeVisible()
    })
    test('Importeren opens the file chooser', async ({page, app, backend}) => {
        await app.open(backend)
        await app.project()
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#btn-import').click()])
        expect(chooser).toBeTruthy()
    })
    test('an invalid project file is refused with a message', async ({page, app, backend, dialogs}) => {
        await app.open(backend)
        await page.locator('#import-input').setInputFiles({name: 'kapot.json', mimeType: 'application/json', buffer: Buffer.from('geen json')})
        await expect.poll(() => dialogs.messages.at(-1)).toBe('Dit is geen geldig projectbestand (.json).')
    })
})
