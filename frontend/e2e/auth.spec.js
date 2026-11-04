// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Accounts against the real application: registering, waiting for approval, the administrator approving, signing in and out.
// The administrator itself is created by the fixtures (first start) with the address of plugged.admin.email of the test profile.
import {test, expect, REAL, t, ADMIN} from './fixtures.js'

test.skip(!REAL, 'needs the real Spring Boot backend (E2E_REAL_BACKEND=1)')

const uniqueEmail = () => `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.be`

test('a new user registers, cannot sign in until the administrator approves, then can', async ({browser, page, app, backend}) => {
    const email = uniqueEmail()
    const context = await browser.newContext({locale: 'nl-BE'})
    // a browser that has seen the guided tour (a new browser gets it after signing in, see tour.spec.js)
    await context.addInitScript(() => localStorage.setItem('plugged.tour', JSON.stringify({v: 99, how: 'e2e'})))
    const visitor = await context.newPage()
    await visitor.goto('/')
    await expect(visitor.locator('#login-form')).toBeVisible()
    await visitor.locator('#link-register').click()
    await visitor.locator('#auth-name').fill('Jan')
    await visitor.locator('#auth-surname').fill('Peeters')
    await visitor.locator('#auth-email').fill(email)
    await visitor.locator('#auth-password').fill('geheim123')
    await visitor.locator('#auth-password2').fill('geheim123')
    await visitor.locator('#auth-submit').click()
    await expect(visitor.locator('#auth-notice')).toHaveText(t('auth.register.done'))
    await expect(visitor.locator('#auth-email')).toHaveValue(email)
    await visitor.locator('#auth-password').fill('geheim123')
    await visitor.locator('#auth-submit').click()
    await expect(visitor.locator('#auth-error')).toBeVisible()
    await expect(visitor.locator('#tab-comp')).toHaveCount(0)

    // the administrator approves the account on the Gebruikers tab
    await app.open(backend)
    await page.locator('#tab-users').click()
    const row = page.locator('#users-page tr', {hasText: email})
    await row.locator('button.accent').click()
    await expect(page.locator('#users-message')).toHaveText(t('users.approved', {name: 'Jan Peeters'}))

    await visitor.locator('#auth-submit').click()
    await expect(visitor.locator('#tab-comp')).toBeVisible()
    await expect(visitor.locator('#user-name')).toHaveText('Jan Peeters')
    await expect(visitor.locator('#tab-users')).toHaveCount(0)
    await visitor.locator('#btn-logout').click()
    await expect(visitor.locator('#auth-notice')).toHaveText(t('auth.signedOut'))
    await visitor.context().close()
})

test('without signing in the API answers 401 and the administrator cannot be created a second time', async ({playwright, baseURL}) => {
    const anonymous = await playwright.request.newContext({baseURL})
    expect((await anonymous.get('/api/projects')).status()).toBe(401)
    expect((await anonymous.get('/api/info')).status()).toBe(200)
    const status = await (await anonymous.get('/api/auth/status')).json()
    expect(status).toEqual({setupRequired: false, adminEmail: ADMIN.email, user: null})
    const token = (await anonymous.storageState()).cookies.find((cookie) => cookie.name === 'XSRF-TOKEN').value
    const again = await anonymous.post('/api/auth/setup', {data: {name: 'X', surname: 'Y', password: 'geheim123'}, headers: {'X-XSRF-TOKEN': token}})
    expect(again.status()).toBe(409)
    // a change without the CSRF token is refused
    expect((await anonymous.post('/api/auth/login', {data: {email: ADMIN.email, password: ADMIN.password}})).status()).toBe(403)
    await anonymous.dispose()
})
