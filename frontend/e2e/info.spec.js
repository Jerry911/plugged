// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The Info tab (about, how to, faq, contact, donate) and the combined import / export buttons of the top bar.
import {readFileSync} from 'node:fs'
import {test, expect, testInfo, t, REAL} from './fixtures.js'
import {edsFile, project, withCircuit} from './data.js'

test.describe('Info page', () => {
    test('the Info tab shows the page and the other tabs bring the editor back', async ({page, app, backend}) => {
        await app.open(backend)
        await page.locator('#tab-info').click()
        await expect(page.locator('#info-page')).toBeVisible()
        await expect(page.locator('#info-functies h2')).toBeVisible()
        await page.locator('#tab-een').click()
        await expect(page.locator('#info-page')).toHaveCount(0)
        await expect(page.locator('svg.sheet').first()).toBeVisible()
    })
    test('the donate button and the source code are at the top, visible without scrolling, and again at the bottom', async ({page, app, backend}) => {
        await app.open(backend)
        await page.locator('#tab-info').click()
        await expect(page.locator('#donate-button')).toBeInViewport()
        await expect(page.locator('#source-link')).toBeInViewport()
        await expect(page.locator('#source-link')).toHaveAttribute('href', 'https://github.com/Jerry911/plugged')
        await expect(page.locator('#btn-tour')).toBeInViewport()
        // the navigation leads to the support section, with the same buttons
        await page.locator('#nav-info-steun').click()
        await expect(page.locator('#donate-button-bottom')).toBeInViewport()
        await expect(page.locator('#donate-button-bottom')).toHaveAttribute('href', testInfo.donateUrl)
        await expect(page.locator('#source-link-bottom')).toHaveAttribute('href', 'https://github.com/Jerry911/plugged')
    })
    for (const language of ['nl', 'fr', 'en']) {
        test(`every screenshot exists in ${language} and is shown in the language of the application`, async ({page, app, backend}) => {
            await page.addInitScript((lang) => localStorage.setItem('plugged.language', lang), language)
            await app.open(backend)
            await page.locator('#tab-info').click()
            // the info page is loaded when it is first shown
            await expect(page.locator('.shot img')).toHaveCount(14)
            const sources = await page.locator('.shot img').evaluateAll((images) => images.map((image) => image.getAttribute('src')))
            for (const src of new Set(sources)) {
                expect(src).toContain(`/info/${language}/`)
                const response = await page.request.get(src)
                expect(response.ok(), src).toBeTruthy()
                const body = await response.body()
                expect(body.subarray(0, 4).toString(), src).toBe('RIFF') // WebP
                expect(body.subarray(8, 12).toString(), src).toBe('WEBP')
            }
            // the picture at the top is really drawn by the browser
            await expect.poll(() => page.locator('#info-hero img').evaluate((image) => image.complete && image.naturalWidth)).toBeGreaterThan(1000)
            await expect(page.locator('.shot')).toHaveCount(sources.length) // none missing
        })
    }
    test('a screenshot opens large and closes again', async ({page, app, backend}) => {
        await app.open(backend)
        await page.locator('#tab-info').click()
        await page.locator('#shot-situatieschema').scrollIntoViewIfNeeded()
        await page.locator('#shot-situatieschema').click()
        await expect(page.locator('#info-lightbox img')).toBeVisible()
        const large = await page.locator('#info-lightbox img').boundingBox(),
            small = await page.locator('#shot-situatieschema img').boundingBox()
        expect(large.width).toBeGreaterThan(small.width * 1.5)
        await page.keyboard.press('Escape')
        await expect(page.locator('#info-lightbox')).toHaveCount(0)
        await page.locator('#shot-situatieschema').click()
        await page.locator('#info-lightbox-close').click()
        await expect(page.locator('#info-lightbox')).toHaveCount(0)
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
        await expect(page.locator('#contact-hint')).toContainText(t('info.contact.opened'))
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
        await expect(page.locator('#export-dialog')).toBeVisible()
        await expect(page.locator('#export-type-json')).toBeChecked()
        await page.locator('#export-type-eds').check()
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-confirm').click()])
        expect(download.suggestedFilename()).toBe('Villa.eds')
        expect(readFileSync(await download.path(), 'utf8').startsWith('EDS')).toBe(true)
        await expect(page.locator('#export-dialog')).toHaveCount(0)
        await expect(page.locator('#status-message', {hasText: t('app.edsExported', {circuits: 0, nodes: 0}).split(':')[0]})).toBeVisible()
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
        await expect(page.locator('#export-dialog')).toHaveCount(0)
    })
    test('one Importeren button takes both json and eds files', async ({page, app, backend}) => {
        await app.open(backend)
        await expect(page.locator('#import-input')).toHaveAttribute('accept', '.json,.eds')
        await page.locator('#import-input').setInputFiles({name: 'huis.eds', mimeType: 'application/octet-stream', buffer: Buffer.from(edsFile())})
        await expect(page.locator('#status-message', {hasText: t('app.edsImported', {circuits: 1, nodes: 5}).split(':')[0]})).toBeVisible()
        await page.locator('#import-input').setInputFiles({name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project({footer: {titel: 'Uit json'}})))})
        await expect(page.locator('#status-message', {hasText: t('app.projectImported')})).toBeVisible()
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
        await expect.poll(() => dialogs.messages.at(-1)).toBe(t('app.invalidProjectFile'))
    })
})

test.describe('Info page without an account', () => {
    /** A browser of somebody without a session (in the fake: the server says nobody is signed in). */
    const visitor = async (browser, baseURL, backend) => {
        const context = await browser.newContext({baseURL, locale: 'nl-BE'}),
            page = await context.newPage()
        await backend.install(page)
        if (!REAL)
            await page.route('**/api/auth/status', (route) =>
                route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({setupRequired: false, adminEmail: testInfo.contactEmail, user: null})}),
            )
        return {page, close: () => context.close()}
    }
    test('anybody can read it: from the sign-in page, or straight from the address /#info', async ({browser, baseURL, backend}) => {
        const {page, close} = await visitor(browser, baseURL, backend)
        await page.goto('/')
        await expect(page.locator('#login-form')).toBeVisible()
        await page.locator('#link-info').click()
        await expect(page.locator('#info-page')).toBeVisible()
        await expect(page).toHaveURL(/#info$/)
        // everything is there, with its screenshots, the donate button and the source code
        await expect(page.locator('#info-functies article.feature')).toHaveCount(13)
        await expect(page.locator('#donate-button')).toBeInViewport()
        await expect(page.locator('#donate-button')).toHaveAttribute('href', testInfo.donateUrl)
        await expect(page.locator('#source-link')).toHaveAttribute('href', 'https://github.com/Jerry911/plugged')
        await expect.poll(() => page.locator('#info-hero img').evaluate((image) => image.complete && image.naturalWidth)).toBeGreaterThan(1000)
        await expect(page.locator('#btn-tour')).toHaveCount(0)
        // the language can be chosen there too
        await page.locator('#language-select').selectOption('en')
        await expect(page.locator('#info-functies h2')).toHaveText('What can you do with Plugged?')
        await page.locator('#language-select').selectOption('nl')
        // and from there to signing in or registering
        await page.locator('#info-register').click()
        await expect(page.locator('#register-form')).toBeVisible()
        await page.locator('#auth-info-link').click()
        await expect(page.locator('#info-page')).toBeVisible()
        await page.locator('#info-login').click()
        await expect(page.locator('#login-form')).toBeVisible()
        // straight from the address, e.g. a link in a mail or on a website
        await page.goto('/#info')
        await expect(page.locator('#info-page')).toBeVisible()
        await expect(page.locator('#login-form')).toHaveCount(0)
        await close()
    })
    test('somebody who is signed in and opens /#info gets the Info tab of the editor', async ({page, app, backend}) => {
        await backend.seed(1, withCircuit())
        await page.goto('/#info')
        await expect(page.locator('#tab-info')).toHaveClass(/on/)
        await expect(page.locator('#info-page')).toBeVisible()
        await expect(page.locator('#btn-tour')).toBeVisible()
        await expect(page.locator('#info-login')).toHaveCount(0)
        void app
    })
})
