// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Accounts against the real application: registering, waiting for approval, the administrator approving, signing in and out.
// The administrator itself is created by the fixtures (first start) with the address of plugged.admin.email of the test profile.
import {test, expect, REAL, t, ADMIN, tourKey} from './fixtures.js'

test.skip(!REAL, 'needs the real Spring Boot backend (E2E_REAL_BACKEND=1)')

const uniqueEmail = () => `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.be`

test('a new user registers, cannot sign in until the administrator approves, then can', async ({browser, page, app, backend}) => {
    const email = uniqueEmail()
    const context = await browser.newContext({locale: 'nl-BE'})
    // a browser in which somebody else already saw the guided tour: the new account still gets it (the tour is remembered per user)
    await context.addInitScript(() => localStorage.setItem('plugged.tour.1', JSON.stringify({v: 1, how: 'done'})))
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

    // the administrator approves the account under Beheer → Gebruikers
    await app.open(backend)
    await page.locator('#tab-admin').click()
    const row = page.locator('#admin-users tr', {hasText: email})
    await row.locator('button.accent').click()
    await expect(page.locator('#admin-message')).toHaveText(t('users.approved', {name: 'Jan Peeters'}))

    await visitor.locator('#auth-submit').click()
    await expect(visitor.locator('#tab-comp')).toBeVisible()
    await expect(visitor.locator('#tour-card')).toHaveAttribute('data-step', 'welkom')
    await visitor.locator('#tour-close').click()
    await expect(visitor.locator('#tour-card')).toHaveCount(0)
    await expect(visitor.locator('#tab-admin')).toHaveCount(0)
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

/** An approved account (registered through the API, approved by the administrator of `request`) and a browser signed in with it. */
const coworker = async ({browser, playwright, baseURL, request}, name) => {
    const email = uniqueEmail(),
        anonymous = await playwright.request.newContext({baseURL})
    await anonymous.get('/api/auth/status')
    const token = (await anonymous.storageState()).cookies.find((cookie) => cookie.name === 'XSRF-TOKEN').value
    const registered = await anonymous.post('/api/auth/register', {data: {name, surname: 'Test', email, password: 'geheim123'}, headers: {'X-XSRF-TOKEN': token}})
    const user = await registered.json()
    await anonymous.dispose()
    expect((await request.post(`/api/admin/users/${user.id}/approve`)).ok()).toBeTruthy()
    const context = await browser.newContext({locale: 'nl-BE'})
    // a coworker who has seen the guided tour
    await context.addInitScript((key) => localStorage.setItem(key, JSON.stringify({v: 99, how: 'e2e'})), tourKey(user.id))
    const page = await context.newPage()
    await page.goto('/')
    await page.locator('#auth-email').fill(email)
    await page.locator('#auth-password').fill('geheim123')
    await page.locator('#auth-submit').click()
    await expect(page.locator('#tab-comp')).toBeVisible()
    return {user, page}
}

test('a project is private until its owner shares it with a group; members can open and save it, only the owner deletes it', async ({browser, playwright, baseURL, request, page, app, backend}) => {
    const alice = await coworker({browser, playwright, baseURL, request}, 'Alice'),
        bob = await coworker({browser, playwright, baseURL, request}, 'Bob')
    // the administrator makes a group with both of them, under Beheer → Groepen
    await app.open(backend)
    await page.locator('#tab-admin').click()
    await page.locator('#admin-tab-groups').click()
    const name = 'Team ' + Date.now()
    await page.locator('#groups-new-name').fill(name)
    await page.locator('#groups-create').click()
    const card = page.locator('.groupcard', {hasText: name})
    for (const member of [alice.user, bob.user]) {
        // choosing the user adds him at once
        await card.locator('select').selectOption(String(member.id))
        await expect(card.locator('.memberchip', {hasText: member.name})).toBeVisible()
    }

    // Alice saves a project: Bob does not see it
    await alice.page.locator('#tab-project').click()
    await alice.page.locator('#project-name').fill('Woning Alice')
    await alice.page.locator('#btn-save').click()
    await expect(alice.page.locator('#status-message')).toHaveText(t('app.saved'))
    await alice.page.locator('#tab-project').click()
    const id = Number((await alice.page.locator('#project-number').textContent()).replace(/\D/g, ''))
    const bobList = async () => {
        await bob.page.locator('#tab-project').click()
        await bob.page.locator('#btn-load').click()
    }
    await bobList()
    await expect(bob.page.locator('#project-row-' + id)).toHaveCount(0)
    await bob.page.keyboard.press('Escape')

    // she shares it with the group
    await alice.page.locator('#btn-load').click()
    await alice.page.locator('#project-sharebtn-' + id).click()
    await alice.page.locator('#project-share-1, .pm-share label', {hasText: name}).locator('input').check()
    await alice.page.locator('#project-share-save').click()
    await expect(alice.page.locator('#project-meta-' + id)).toHaveText(t('projects.sharedWith', {groups: name}))

    // Bob opens it, sees whose it is, saves it; he cannot delete or share it
    await bobList()
    await expect(bob.page.locator('#project-meta-' + id)).toContainText(t('projects.ownedBy', {name: 'Alice Test'}))
    await expect(bob.page.locator('#project-delete-' + id)).toHaveCount(0)
    await expect(bob.page.locator('#project-sharebtn-' + id)).toHaveCount(0)
    await bob.page.locator('#project-load-' + id).click()
    await expect(bob.page.locator('#status-message')).toHaveText(t('app.projectLoaded', {number: id}))
    await bob.page.keyboard.press('Alt+s')
    await expect(bob.page.locator('#status-message')).toHaveText(t('app.saved'))

    // working together: Alice, who has the project open, sees Bob in it, and his save comes to her by itself
    await expect(alice.page.locator('#presence')).toContainText('Bob Test', {timeout: 15_000})
    await expect(bob.page.locator('#presence')).toContainText('Alice Test', {timeout: 15_000})
    await expect(alice.page.locator('#status-message')).toHaveText(t('presence.followed', {name: 'Bob Test'}), {timeout: 15_000})
    // Bob closes his window: after a while Alice no longer sees him
    await bob.page.goto('about:blank')
    await expect(alice.page.locator('#presence')).toHaveCount(0, {timeout: 15_000})

    // the administrator sees it too
    expect((await backend.stored(id)).name).toBe('Woning Alice')
    for (const person of [alice, bob]) await person.page.context().close()
})

test('educational mode: the teacher switches it on, the student can no longer validate, import or export; the teacher still can', async ({browser, playwright, baseURL, request, page, app, backend}) => {
    const teacher = await coworker({browser, playwright, baseURL, request}, 'Leraar'),
        student = await coworker({browser, playwright, baseURL, request}, 'Student')
    // the administrator makes the group, with the teacher as owner (★) and the student as member
    const group = await (await request.post('/api/admin/groups', {data: {name: 'Klas ' + Date.now()}})).json()
    expect((await request.put(`/api/admin/groups/${group.id}/owners/${teacher.user.id}`)).ok()).toBeTruthy()
    expect((await request.put(`/api/admin/groups/${group.id}/members/${student.user.id}`)).ok()).toBeTruthy()
    await expect(student.page.locator('#btn-verify')).toBeVisible()

    // the teacher: Mijn groepen → educational mode on
    await teacher.page.reload()
    await teacher.page.locator('#tab-teacher').click()
    await teacher.page.locator(`#group-${group.id}-educational`).check()
    await expect(teacher.page.locator('#teacher-message')).toHaveText(t('educational.switchedOn', {group: group.name}))

    // the student: as soon as the window gets the focus again, validation, import and export are gone
    await student.page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(student.page.locator('#educational-badge')).toBeVisible()
    await expect(student.page.locator('#btn-verify')).toHaveCount(0)
    await student.page.locator('#tab-project').click()
    await expect(student.page.locator('#btn-import')).toBeDisabled()
    await expect(student.page.locator('#btn-export')).toBeDisabled()

    // the teacher and the administrator are not restricted
    await teacher.page.locator('#tab-een').click()
    await expect(teacher.page.locator('#btn-verify')).toBeVisible()
    await app.open(backend)
    await expect(page.locator('#educational-badge')).toHaveCount(0)
    await expect(page.locator('#btn-verify')).toBeVisible()
    for (const person of [teacher, student]) await person.page.context().close()
})
