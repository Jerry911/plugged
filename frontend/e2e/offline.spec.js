// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Working without a connection (the PWA): saves kept on the device and sent later, and the application opening without a network.
import {test, expect, t, REAL} from './fixtures.js'
import {withCircuit} from './data.js'

const goOnline = (page, backend) => {
    backend.offline = false
    return page.evaluate(() => dispatchEvent(new Event('online')))
}

test('without a connection a save is kept on the device, survives a reload and reaches the server when the connection is back', async ({page, app, backend}) => {
    await app.open(backend, withCircuit())
    await app.treeRow('Gang licht').click()
    await page.locator('#eds-delete').click()
    backend.offline = true
    await page.keyboard.press('Alt+s')
    await expect(app.status()).toHaveText(t('offline.savedLocally'))
    await expect(page.locator('#offline-status')).toHaveText(t('offline.pending', {count: 1}))
    // the page is closed and opened again, still without a connection to save: the work of the device opens, not the server copy
    await page.reload()
    await expect(page.locator('#tab-comp')).toBeVisible()
    await expect(app.status()).toHaveText(t('offline.restored'))
    await expect(page.locator('#eds-tree')).not.toContainText('Gang licht')
    await goOnline(page, backend)
    await expect(app.status()).toHaveText(t('offline.synced'))
    await expect(page.locator('#offline-status')).toHaveCount(0)
    const stored = await backend.saved(1)
    expect(JSON.stringify(stored)).not.toContain('Gang licht')
    expect(JSON.stringify(stored)).toContain('Keuken stopcontact')
})

test.describe('the installed application', () => {
    test.skip(!REAL, 'the service worker is part of the build (the real application), not of the Vite dev server')
    test.use({serviceWorkers: 'allow'})
    test('it can be installed and opens without a network once it was used', async ({page, app, backend, context}) => {
        const manifest = await (await page.request.get('/manifest.webmanifest')).json()
        expect(manifest).toMatchObject({name: 'Plugged', display: 'standalone', start_url: '/'})
        expect((await page.request.get('/icons/icon-512.png')).ok()).toBeTruthy()
        await app.open(backend, withCircuit())
        await page.evaluate(async () => {
            await navigator.serviceWorker.ready
            if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve))
        })
        // once more online, so the answers of the API are in the store of the service worker
        await page.reload()
        await expect(page.locator('#eds-tree')).toContainText('Keuken stopcontact')
        await context.setOffline(true)
        await page.reload()
        await expect(page.locator('#tab-comp')).toBeVisible()
        await expect(page.locator('#eds-tree')).toContainText('Keuken stopcontact')
        await expect(page.locator('#offline-status')).toBeVisible()
        await context.setOffline(false)
    })
})
