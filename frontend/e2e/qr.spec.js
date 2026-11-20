// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The QR code for the circuit board: made from the Project menu (or Alt+Q, or the QR icon in the list of projects), printed or downloaded,
// and the page it opens for whoever scans it, without signing in, always with the newest saved version. A new key stops the old codes.
import {readFile} from 'node:fs/promises'
import {test, expect, t} from './fixtures.js'
import {withCircuit} from './data.js'

/** The page a scan opens: a browser of somebody else, without the session of the editor. */
const scan = async (browser, baseURL, backend, id, key) => {
    const context = await browser.newContext({baseURL, locale: 'nl-BE'}),
        page = await context.newPage()
    await backend.install(page)
    await page.goto(`/?schema=${id}&key=${encodeURIComponent(key)}`)
    return {page, close: () => context.close()}
}
const openQr = async (page, app) => {
    await app.project()
    await page.locator('#btn-qr').click()
    await expect(page.locator('#qr-dialog .qr-preview svg')).toBeVisible()
}

test('a new project has to be saved first; then Project → QR-code shows the code, prints it and downloads it as SVG', async ({page, app, backend}) => {
    await app.open(backend)
    await app.project()
    await expect(page.locator('#btn-qr')).toBeDisabled()
    await expect(page.locator('#btn-qr')).toHaveAttribute('title', t('qr.saveFirst'))
    await page.keyboard.press('Escape')
    await app.add('kring')
    await app.save(backend)
    await openQr(page, app)
    // the code, not the link as text: nobody reads the secret off the screen
    await expect(page.locator('#qr-dialog')).not.toContainText('key=')
    await expect(page.locator('#qr-dialog')).toContainText(t('qr.intro'))
    const download = page.waitForEvent('download')
    await page.locator('#qr-download').click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^qr-\d+\.svg$/)
    expect(await readFile(await file.path(), 'utf8')).toContain('<svg')
    // printing prints the label: the code with the name and number of the project (the rest of the screen is hidden)
    await page.emulateMedia({media: 'print'})
    await expect(page.locator('.qr-print svg')).toBeVisible()
    await expect(page.locator('#qr-dialog')).toBeHidden()
    await page.emulateMedia({media: 'screen'})
    await page.locator('#qr-close').click()
    await expect(page.locator('#qr-dialog')).toHaveCount(0)
})

test('Alt+Q opens the code of the open project; the QR icon in the list opens the code of another project without opening it', async ({page, app, backend}) => {
    await backend.seed(2, withCircuit({name: 'Garage', footer: {titel: 'Garage', datum: '2026-01-01', schaal: '1:50', rev: 'A'}}))
    await app.open(backend, withCircuit())
    // the open project is a stored one (the code refers to its number)
    await app.project()
    await expect(page.locator('#btn-qr')).toBeEnabled()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Alt+q')
    await expect(page.locator('#qr-dialog .qr-preview svg')).toBeVisible()
    await expect(page.locator('.qr-print')).toContainText(t('qr.printNumber', {number: backend.id(1)}))
    await page.keyboard.press('Escape')
    await expect(page.locator('#qr-dialog')).toHaveCount(0)
    await app.project()
    await page.locator('#btn-load').click()
    await page.locator('#project-qr-' + backend.id(2)).click()
    await expect(page.locator('#qr-dialog .qr-preview svg')).toBeVisible()
    await expect(page.locator('.qr-print')).toContainText('Garage')
    await expect(page.locator('.qr-print')).toContainText(t('qr.printNumber', {number: backend.id(2)}))
    await page.locator('#qr-close').click()
})

test('scanning the code shows the newest saved version to anybody, without signing in; a wrong key shows nothing', async ({page, app, backend, browser, baseURL}) => {
    await app.open(backend, withCircuit())
    await openQr(page, app) // the key is made the first time the code is asked for
    const id = backend.id(1),
        key = await backend.qrKey(1)
    const first = await scan(browser, baseURL, backend, id, key)
    await expect(first.page.locator('#schema-title')).toHaveText('Testproject')
    await expect(first.page.locator('#top-bar')).toHaveCount(0) // no editor, no sign-in screen
    const before = await first.page.locator('svg.sheet *').count()
    expect(before).toBeGreaterThan(0)
    await expect(first.page.locator('#schema-pdf')).toBeEnabled()

    // the schema changes and is saved: the same code shows the new version
    await page.locator('#qr-close').click()
    await app.add('kring')
    await app.save(backend)
    await first.page.reload()
    await expect(first.page.locator('#schema-title')).toHaveText('Testproject')
    await expect.poll(() => first.page.locator('svg.sheet *').count()).toBeGreaterThan(before)
    await first.close()

    // a wrong key or another project number: "does not exist", nothing tells them apart
    for (const [number, secret] of [
        [id, key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A')],
        [id, ''],
        [id + 1000, key],
    ]) {
        const other = await scan(browser, baseURL, backend, number, secret)
        await expect(other.page.locator('#schema-notfound')).toHaveText(t('schema.notfound', {number}))
        await expect(other.page.locator('svg.sheet')).toHaveCount(0)
        await other.close()
    }
})

test('Nieuwe sleutel asks first, then the codes printed before stop working and the new one works', async ({page, app, backend, browser, baseURL, dialogs}) => {
    await app.open(backend, withCircuit())
    await openQr(page, app)
    const id = backend.id(1),
        old = await backend.qrKey(1),
        codeBefore = await page.locator('#qr-dialog .qr-preview svg path').getAttribute('d')
    // cancelled: nothing changes
    dialogs.confirm = false
    await page.locator('#qr-renew').click()
    expect(dialogs.messages.at(-1)).toBe(t('qr.confirmRenew'))
    expect(await backend.qrKey(1)).toBe(old)
    // confirmed: a new code
    dialogs.confirm = true
    await page.locator('#qr-renew').click()
    await expect.poll(() => page.locator('#qr-dialog .qr-preview svg path').getAttribute('d')).not.toBe(codeBefore)
    const renewed = await backend.qrKey(1)
    expect(renewed).not.toBe(old)
    const oldScan = await scan(browser, baseURL, backend, id, old)
    await expect(oldScan.page.locator('#schema-notfound')).toBeVisible()
    await oldScan.close()
    const newScan = await scan(browser, baseURL, backend, id, renewed)
    await expect(newScan.page.locator('#schema-title')).toHaveText('Testproject')
    await newScan.close()
})

test('a project in the trash cannot be seen through its code', async ({page, app, backend, browser, baseURL, request}) => {
    await app.open(backend, withCircuit())
    await openQr(page, app)
    const id = backend.id(1),
        key = await backend.qrKey(1)
    // into the trash (the fake backend simply forgets the project)
    if (backend.fake) backend.projects.delete(id)
    else expect((await request.delete('/api/projects/' + id)).ok()).toBeTruthy()
    const scanned = await scan(browser, baseURL, backend, id, key)
    await expect(scanned.page.locator('#schema-notfound')).toBeVisible()
    await scanned.close()
})
