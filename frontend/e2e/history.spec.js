// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Against the real backend: the history of a project, duplicating, the trash, and Mijn account (a new password, a temporary one of the
// administrator).
import {expect, test, tourKey} from './fixtures.js'
import {REAL} from './mode.js'
import {t} from './texts.js'

test.skip(!REAL, 'history, trash and accounts live on the server')

const openList = async (page) => {
    await page.locator('#tab-project').click()
    await page.locator('#btn-load').click()
    await expect(page.locator('#project-list')).toBeVisible()
}

test('every save is in the history; an older version comes back as the newest', async ({page, app, backend}) => {
    await app.open(backend)
    await page.locator('#tab-project').click()
    await page.locator('#project-name').fill('Versie een')
    await page.locator('#btn-save').click()
    await expect(page.locator('#status-message')).toHaveText(t('app.saved'))
    await page.locator('#tab-project').click()
    await page.locator('#project-name').fill('Versie twee')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Alt+s')
    await expect(page.locator('#status-message')).toHaveText(t('app.saved'))
    const id = backend.id(1)
    await openList(page)
    await page.locator('#project-historybtn-' + id).click()
    await expect(page.locator(`#project-version-${id}-1`)).toContainText('E2E Beheerder')
    await page.locator(`#project-version-restore-${id}-0`).click()
    await expect(page.locator('#status-message')).toHaveText(t('app.versionRestored', {version: 0, number: id}))
    expect((await backend.saved(1)).name).toBe('Versie een')
    // the menu is still open: the open project is the restored version
    await expect(page.locator('#project-name')).toHaveValue('Versie een')
})

test('a duplicate is a new project; a deleted project waits in the trash until it is restored or removed for good', async ({page, app, backend}) => {
    await app.open(backend, {een: [{id: 'p', name: 'Blad 1', tree: []}], sit: [{id: 's', name: 'Plan 1', walls: [], items: []}], footer: {}, name: 'Origineel'})
    const id = backend.id(1)
    await openList(page)
    await page.locator('#project-copy-' + id).click()
    await expect(page.locator('#status-message')).toContainText(t('app.projectCopied', {number: ''}).trim())
    // the list (still open) has the copy now
    await expect(page.locator('#project-list tbody tr[id^="project-row-"]')).toHaveCount(2)
    await page.locator('#project-search').fill(t('common.copyOf', {name: 'Origineel'}))
    await expect(page.locator('#project-list tbody tr[id^="project-row-"]')).toHaveCount(1)
    await page.locator('#project-search').fill('')
    await page.locator('#project-delete-' + id).click()
    await expect(page.locator('#status-message')).toHaveText(t('app.projectTrashed', {number: id}))
    await expect(page.locator('#project-row-' + id)).toHaveCount(0)
    await page.locator('#project-trash-toggle').click()
    await page.locator('#project-untrash-' + id).click()
    await expect(page.locator('#project-trash-row-' + id)).toHaveCount(0)
    await page.locator('#project-trash-toggle').click()
    await expect(page.locator('#project-row-' + id)).toBeVisible()
    await page.locator('#project-delete-' + id).click()
    await expect(page.locator('#project-row-' + id)).toHaveCount(0)
    await page.locator('#project-trash-toggle').click()
    await page.locator('#project-purge-' + id).click()
    await expect(page.locator('#project-trash-row-' + id)).toHaveCount(0)
    expect(await backend.saved(1)).toBeUndefined()
})

test('a temporary password of the administrator has to be replaced at the next sign-in', async ({browser, playwright, baseURL, page, app, backend, request}) => {
    // a coworker, registered and approved
    const email = 'tijdelijk-' + Date.now() + '@example.be',
        anonymous = await playwright.request.newContext({baseURL})
    await anonymous.get('/api/auth/status')
    const token = (await anonymous.storageState()).cookies.find((cookie) => cookie.name === 'XSRF-TOKEN').value
    const user = await (await anonymous.post('/api/auth/register', {data: {name: 'Tijdelijk', surname: 'Test', email, password: 'geheim123'}, headers: {'X-XSRF-TOKEN': token}})).json()
    await anonymous.dispose()
    expect((await request.post(`/api/admin/users/${user.id}/approve`)).ok()).toBeTruthy()
    // the administrator gives him a temporary password under Beheer → Gebruikers
    await app.open(backend)
    await page.locator('#tab-admin').click()
    await page.locator('#users-password-' + user.id).click()
    const message = await page.locator('#admin-message').textContent()
    const temporary = message.match(/[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}/)[0]
    // he signs in with it and has to choose his own first
    const context = await browser.newContext({locale: 'nl-BE'})
    // he has seen the guided tour
    await context.addInitScript((key) => localStorage.setItem(key, JSON.stringify({v: 99, how: 'e2e'})), tourKey(user.id))
    const his = await context.newPage()
    await his.goto('/')
    await his.locator('#auth-email').fill(email)
    await his.locator('#auth-password').fill(temporary)
    await his.locator('#auth-submit').click()
    await expect(his.locator('#must-change-password')).toBeVisible()
    await his.locator('#password-current').fill(temporary)
    await his.locator('#password-new').fill('mijneigen123')
    await his.locator('#password-repeat').fill('mijneigen123')
    await his.locator('#password-submit').click()
    await expect(his.locator('#tab-comp')).toBeVisible()
    // Mijn account: his data to download
    await his.locator('#btn-account').click()
    const download = his.waitForEvent('download')
    await his.locator('#account-export').click()
    expect((await download).suggestedFilename()).toBe('plugged-mijn-gegevens.json')
    await context.close()
})
