// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// "Controleer": the check according to AREI, its list of problems and jumping from a problem to the element.
import {test, expect, t} from './fixtures.js'
import {correct, flawed, node, project} from './data.js'

const panel = (page) => page.locator('#verify-panel')
// the messages of the panel about one rule of the check
const issues = (page, rule) => panel(page).locator(`[data-rule="${rule}"]`)
const open = (page) => page.locator('#btn-verify').click()

test('the panel lists the problems with their counts and can be closed', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await open(page)
    await expect(panel(page)).toContainText(t('verify.heading'))
    await expect(page.locator('#verify-summary')).toHaveText(/^\d+ .* · \d+ .* · \d+ /)
    await expect(issues(page, 'kring.noDiff')).toBeVisible()
    await page.locator('#verify-close').click()
    await expect(panel(page)).toHaveCount(0)
    // the button toggles it too
    await open(page)
    await expect(panel(page)).toBeVisible()
    await open(page)
    await expect(panel(page)).toHaveCount(0)
})

test('a new project reports its empty board; an empty schema is reported as empty', async ({page, app, backend}) => {
    await app.open(backend)
    await open(page)
    await expect(issues(page, 'bord.empty')).toBeVisible()
    await page.locator('#verify-close').click()
    await backend.seed(2, project({een: [{id: 'a', name: 'Leeg', tree: []}]}))
    await app.load(2)
    await expect(page.locator('#eds-page-1', {hasText: 'Leeg'})).toBeVisible()
    await open(page)
    await expect(issues(page, 'tree.empty')).toBeVisible()
})

test('a correct schema shows the success message; breaking it brings a warning', async ({page, app, backend}) => {
    await app.open(backend, correct())
    await expect(page.locator('#btn-verify')).toBeVisible() // no error or warning counts
    await open(page)
    await expect(page.locator('#verify-ok')).toHaveText('✓ ' + t('verify.noProblems'))
    await page.locator('#verify-close').click()
    await app.treeRowById('D').click() // the differential
    await page.locator('#eds-delete').click()
    await expect(page.locator('#btn-verify')).toHaveText(/⚠1/)
    await open(page)
    await expect(page.locator('#verify-ok')).toHaveCount(0)
})

test('clicking a problem selects the element it is about', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await open(page)
    await issues(page, 'kring.noDiff').click()
    await expect(page.locator('#eds-props')).toBeVisible()
    await expect(page.locator('#eds-label')).toHaveValue('K')
})

test('a problem in the footer opens the Kaderinfo dialog; a problem of the plan opens the situatieschema; a global problem has no element', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await open(page)
    await issues(page, 'footer').click()
    await expect(page.locator('#footer-dialog')).toBeVisible()
    await page.locator('#footer-close').click()
    await issues(page, 'plan.unplaced').first().click()
    await expect(page.locator('#sit-help')).toBeVisible()
    await issues(page, 'earth').click()
    await expect(page.locator('#eds-tree-title')).toBeVisible()
})

test('a problem on another sheet switches to that sheet', async ({page, app, backend}) => {
    const ok = {id: 'a', name: 'Eerste', tree: [node('A', 'aansluiting', [node('B', 'bord')])]}
    const bad = {id: 'b', name: 'Tweede', tree: [node('A2', 'aansluiting', [node('B2', 'bord', [node('K2', 'kring', [node('S2', 'stopcontact')], {info: 'B16 2,5mm²', label: 'Z'})])])]}
    await app.open(backend, project({een: [ok, bad]}))
    await expect(page.locator('#eds-page-1')).toHaveClass(/on/)
    await open(page)
    await issues(page, 'kring.noDiff').first().click()
    await expect(page.locator('#eds-page-2')).toHaveClass(/on/)
    await expect(page.locator('#eds-label')).toHaveValue('Z')
})

test('selecting the text of a message to copy it does not jump to the element', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await open(page)
    const li = issues(page, 'kring.noDiff').first()
    const box = await li.boundingBox()
    await page.mouse.move(box.x + 30, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + box.height / 2, {steps: 5})
    await page.mouse.up()
    await expect(page.locator('#eds-props')).toHaveCount(0)
    // a plain click still jumps
    // (somewhere else on the line: the same spot twice would be a double click, which selects a word)
    await page.mouse.click(box.x + 8, box.y + box.height / 2)
    await expect(page.locator('#eds-props')).toBeVisible()
})

test('the tab and the button show the number of errors', async ({page, app, backend}) => {
    await app.open(backend, flawed())
    await expect(page.locator('#tab-een-errors')).toBeVisible()
    await expect(page.locator('#btn-verify', {hasText: /✖\d+/})).toBeVisible()
})

// Regression: the popup is sticky at the top of the screen, so the element it jumps to must be centred in the part of the screen below it
test('jumping to a problem far down the page scrolls the element to the middle of the visible area, below the popup', async ({page, app, backend}) => {
    const ks = Array.from({length: 16}, (_, i) => node('K' + i, 'kring', [node('S' + i, 'stopcontact')], {label: String.fromCharCode(65 + i), info: 'B16 2,5mm²'}))
    await app.open(backend, project({een: [{id: 'e1', name: 'Groot', tree: [node('A', 'aansluiting', [node('B', 'bord', ks)])]}]}))
    await expect(page.locator('div[id^="eds-sheet-"]')).toHaveCount(2)
    await open(page)
    await expect(panel(page)).toBeVisible()
    const last = issues(page, 'kring.noDiff').last()
    await last.click()
    await expect(page.locator('#eds-label')).toHaveValue(/^[A-P]$/)
    const target = page.locator('#eds-label')
    const letter = await target.inputValue()
    const el = page.locator(`svg.sheet [data-nid="K${letter.charCodeAt(0) - 65}"]`).first()
    await expect
        .poll(
            async () => {
                const [b, pop] = [await el.boundingBox(), await panel(page).boundingBox()]
                const vh = page.viewportSize().height,
                    top = pop.y + pop.height,
                    mid = top + (vh - top) / 2
                return Math.abs(b.y + b.height / 2 - mid)
            },
            {timeout: 5000, message: 'the element is centred below the popup'},
        )
        .toBeLessThan(80)
})
