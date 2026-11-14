// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Account → Controleregels: a user switches rules of Controleer off for himself; it is saved on the server and stays after a reload.
import {test, expect, t} from './fixtures.js'
import {flawed} from './data.js'

test('rules switched off on the Account page leave Controleer, also after a reload, until they are switched on again', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    // no earth, no differential at the origin, the circuit without differential
    await expect(page.locator('#btn-verify')).toHaveText(/✖3/)
    await page.locator('#tab-account').click()
    await page.locator('#account-tab-rules').click()
    // all on: nothing to switch on
    await expect(page.locator('#rules-all')).toBeDisabled()
    await page.locator('#rules-main_diff').uncheck()
    await expect(page.locator('#rules-status')).toHaveText(t('ruleSettings.saved'))
    await page.locator('#rules-kring_noDiff').uncheck()
    await expect(page.locator('#rules-status')).toHaveText(t('ruleSettings.saved'))
    await expect(page.locator('#account-tab-rules')).toContainText('2')
    await page.locator('#tab-een').click()
    await expect(page.locator('#btn-verify')).toHaveText(/✖1(?!\d)/)
    // stored for this user: after a reload they are still off
    await page.reload()
    await expect(page.locator('#btn-verify')).toHaveText(/✖1(?!\d)/)
    // Controleer says so and leads back to them
    await page.locator('#btn-verify').click()
    await page.locator('#verify-disabled').click()
    await expect(page.locator('#account-tab-rules')).toHaveClass(/on/)
    await expect(page.locator('#rules-main_diff')).not.toBeChecked()
    await page.locator('#rules-all').click()
    await expect(page.locator('#rules-status')).toHaveText(t('ruleSettings.saved'))
    await page.locator('#tab-een').click()
    await expect(page.locator('#btn-verify')).toHaveText(/✖3/)
})
