// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The guided tour: starts on a first visit, waits for the person to do the steps, is remembered and can be started again from Info.
import {test, expect, t, tourKey} from './fixtures.js'
import {withCircuit} from './data.js'

const card = (page) => page.locator('#tour-card')
// the card shows this step (by the id of the step, see tourSteps.jsx)
const showsStep = (page, id, options) => expect(card(page)).toHaveAttribute('data-step', id, options)
// the other specs start as a visitor who has seen the tour (fixtures.js); these tests start as a new visitor (once per browser session, so a reload keeps what the tour stored)
const asNewVisitor = (page, backend) =>
    page.addInitScript((key) => {
        if (sessionStorage.getItem('e2e-new-visitor')) return
        sessionStorage.setItem('e2e-new-visitor', '1')
        localStorage.removeItem(key)
    }, tourKey(backend.userId))
// what the browser remembers of the tour of the signed-in user
const storedTour = (page, backend) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), tourKey(backend.userId))

test('a first visit starts the tour, which waits for the first circuit and is not shown again', async ({page, app, backend}) => {
    await asNewVisitor(page, backend)
    await app.open(backend)
    await showsStep(page, 'welkom')
    await primary(page).click()
    await primary(page).click() // the two schemas
    await primary(page).click() // the palette
    await showsStep(page, 'kring')
    // the tour opened the category with the button it points to
    await page.locator('#eds-palette-kring').click()
    await expect(page.locator('#tour-ok')).toHaveText('✓ ' + t('tour.steps.kring.done'))
    await showsStep(page, 'eigenschappen')
    await page.locator('#tour-close').click()
    await expect(card(page)).toHaveCount(0)
    await page.reload()
    await expect(page.locator('#tab-comp')).toBeVisible()
    await expect(card(page)).toHaveCount(0)
})

test('Info starts the tour again', async ({page, app, backend}) => {
    await app.open(backend)
    await expect(card(page)).toHaveCount(0)
    await page.locator('#tab-info').click()
    await page.locator('#btn-tour').click()
    await showsStep(page, 'welkom')
    await page.keyboard.press('Escape')
    await expect(card(page)).toHaveCount(0)
})

// ---- the whole tour, with the real mouse -------------------------------------------------------------------------------------------
const step = (page) => card(page).getAttribute('data-step')
const primary = (page) => page.locator('#tour-next')
const startTour = async (page, app, backend, doc) => {
    await asNewVisitor(page, backend)
    await app.open(backend, doc)
    await showsStep(page, 'welkom')
}
// press the main button (Volgende / Sla over) until the card shows this step
const advanceTo = async (page, wanted) => {
    for (let i = 0; i < 25; i++) {
        if ((await step(page)) === wanted) return
        await primary(page).click()
    }
    throw new Error('the tour never showed: ' + wanted)
}
// the highlight glides to its new place when a step starts: measure it when it has arrived
const spotBox = async (page) => {
    await page.waitForTimeout(500)
    return box(page.locator('#tour-spot'))
}
// the drawing of an element of the "Opbouw" list, found by its node id (not by its place in the page): `row` is its row in the list
const drawingOf = async (page, row) => {
    const rowId = await row.getAttribute('id')
    return page.locator(`svg.sheet [data-nid="${rowId.replace('eds-tree-', '')}"]`).first()
}
// the selected element (a new circuit is selected), and its first child (the stopcontact added to it: the circuit stays selected)
const drawnSelection = (page) => drawingOf(page, page.locator('#eds-tree > div.sel'))
const drawnFirstChildOfSelection = (page) => drawingOf(page, page.locator('#eds-tree > div.sel + div'))
const box = async (loc) => (await loc.boundingBox()) ?? {x: 0, y: 0, width: 0, height: 0}
const overlap = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1
const hits = (a, p) => p.x >= a.x && p.x <= a.x + a.width && p.y >= a.y && p.y <= a.y + a.height
const SIT_TOOLS = {Muur: 'wall', Deur: 'door', Selecteer: 'select', Kamer: 'room', Raam: 'window', Symbool: 'sym'}
const tool = (page, name) => page.locator('#sit-tool-' + SIT_TOOLS[name])
// an interactive step: do the work, see the "well done" line, wait for the next card
const completes = async (page, stepId, work) => {
    await showsStep(page, stepId)
    await work()
    await expect(page.locator('#tour-ok')).toBeVisible()
    await expect(card(page)).not.toHaveAttribute('data-step', stepId, {timeout: 5000})
}

test('the whole tour: a circuit, a stopcontact, walls with a typed length and a new scale, Kaderinfo, a door and a symbol, all with the real mouse and keyboard; nothing the person made is hidden behind the card', async ({page, app, backend}) => {
    test.setTimeout(150_000)
    await startTour(page, app, backend)
    await primary(page).click() // Start rondleiding
    await advanceTo(page, 'kring')
    await expect(page.locator('#tour-spot')).toBeVisible()

    await showsStep(page, 'kring')
    await page.locator('#eds-palette-kring').click()
    await expect(page.locator('#tour-ok')).toBeVisible()
    // the card is next to what was just made, not on top of it
    const circuit = await box(await drawnSelection(page))
    expect(circuit.width).toBeGreaterThan(0)
    expect(overlap(await box(card(page)), circuit)).toBe(false)
    await showsStep(page, 'eigenschappen', {timeout: 5000})
    // the properties of the new circuit are what the highlight points at
    const props = await box(page.locator('[data-tour="eds-props"]'))
    const spot = await spotBox(page)
    expect(hits(spot, {x: props.x + props.width / 2, y: props.y + 10})).toBe(true)
    await expect(page.locator('#eds-label')).toBeVisible()

    await primary(page).click()
    await completes(page, 'stopcontact', async () => {
        await page.locator('#eds-palette-stopcontact').click()
        await expect(page.locator('#tour-ok')).toBeVisible()
        const socket = await box(await drawnFirstChildOfSelection(page))
        expect(socket.width).toBeGreaterThan(0)
        expect(overlap(await box(card(page)), socket)).toBe(false)
    })
    await advanceTo(page, 'naar-situatie')
    await completes(page, 'naar-situatie', () => page.locator('#tab-sit').click())

    // ---- the first wall: two clicks, on the left of the sheet ----
    await completes(page, 'muur', async () => {
        await expect(tool(page, 'Muur')).toBeVisible()
        await tool(page, 'Muur').click()
        await expect(tool(page, 'Muur')).toHaveClass(/on/)
        await app.clickSheet(40, 40)
        await app.clickSheet(40, 100)
    })

    // ---- a second wall with a typed length that is too long for the scale: the length box is what the highlight points at ----
    await showsStep(page, 'muur-lengte')
    const dim = page.locator('[data-tour="dim-input"]')
    await expect(dim).toBeFocused()
    const dimBox = await box(page.locator('[data-tour="dimbox"]')),
        dimSpot = await spotBox(page)
    expect(hits(dimSpot, {x: dimBox.x + dimBox.width / 2, y: dimBox.y + dimBox.height / 2})).toBe(true)
    // a length that fits does not finish the step, and neither does one that would not fit after the new scale
    await page.keyboard.type('5')
    await page.waitForTimeout(700)
    await expect(card(page).locator('.tour-ok')).toHaveCount(0)
    await expect(page.locator('[data-tour="dim-scale"]')).toHaveCount(0) // 5 m fits at 1:50: no other scale is proposed
    await page.keyboard.press('Control+A')
    await page.keyboard.type('40')
    await page.waitForTimeout(700)
    await expect(card(page).locator('.tour-ok')).toHaveCount(0)
    await page.keyboard.press('Control+A')
    await page.keyboard.type('15')
    await page.keyboard.press('ArrowRight') // draw to the right
    await expect(page.locator('#tour-ok')).toBeVisible()
    await expect(page.locator('#sit-dimension-error')).toContainText(t('situation.dimension.doesNotFit', {scale: 50})) // what the application says about it
    await showsStep(page, 'schaal-kiezen', {timeout: 5000})

    // ---- the application proposes a scale: the button is what the highlight points at ----
    const scaleBtn = page.locator('[data-tour="dim-scale"]')
    await expect(scaleBtn).toHaveText(t('situation.dimension.scaleButton', {scale: 75}))
    const sb = await box(scaleBtn),
        ss = await spotBox(page)
    expect(hits(ss, {x: sb.x + sb.width / 2, y: sb.y + sb.height / 2})).toBe(true)
    await expect(page.locator('svg.sheet')).toContainText('3,00 m') // the first wall measures 60 mm on the sheet: 3 m at 1:50
    await scaleBtn.click()
    await expect(page.locator('#tour-ok')).toBeVisible()
    await showsStep(page, 'muur-bevestig', {timeout: 5000})
    await expect(page.locator('svg.sheet')).toContainText('4,50 m') // the same wall, now at 1:75
    await expect(page.locator('svg.sheet')).not.toContainText('3,00 m')

    // ---- confirm with Enter: the second wall is placed ----
    await expect(page.locator('.dimbox .dimerr')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(page.locator('#tour-ok')).toBeVisible()

    // ---- Kaderinfo: where the scale can be seen and changed ----
    await showsStep(page, 'kaderinfo', {timeout: 5000})
    const kb = await box(page.locator('#btn-footer')),
        ks = await spotBox(page)
    expect(hits(ks, {x: kb.x + kb.width / 2, y: kb.y + kb.height / 2})).toBe(true)
    await page.locator('#btn-footer').click()
    await expect(page.locator('#tour-ok')).toBeVisible()
    await showsStep(page, 'kaderinfo-schaal', {timeout: 5000})
    const field = page.locator('[data-tour="footer-schaal"]')
    await expect(field).toHaveValue('1:75') // the scale that was just chosen
    const fb = await box(field),
        fs = await spotBox(page)
    expect(hits(fs, {x: fb.x + fb.width / 2, y: fb.y + fb.height / 2})).toBe(true)
    expect(overlap(await box(card(page)), fb)).toBe(false) // the card does not hide the field
    await page.waitForTimeout(1300) // opening is not enough: the step is finished by closing the dialog
    await showsStep(page, 'kaderinfo-schaal')
    await page.locator('#footer-close').click()
    await expect(page.locator('#tour-ok')).toBeVisible()

    // ---- the rest of the tour: a door on the second wall, a symbol, selecting it ----
    await showsStep(page, 'deur', {timeout: 5000})
    await tool(page, 'Deur').click()
    await app.clickSheet(140, 104)
    await expect(page.locator('#tour-ok')).toBeVisible()
    await showsStep(page, 'symbool', {timeout: 5000})
    await page.locator('#comp-stopcontact').click()
    await app.clickSheet(100, 70)
    await expect(page.locator('#tour-ok')).toBeVisible()
    // nothing that was drawn is under the card (it is in the corner of the window)
    await advanceTo(page, 'selecteer')
    const drawn = [[40, 40], [40, 100], [240, 100], [140, 100], [100, 70]]
    const cardBox = await box(card(page))
    for (const [x, y] of drawn) expect(hits(cardBox, await app.sheetPoint(x, y))).toBe(false)
    await completes(page, 'selecteer', async () => {
        await tool(page, 'Selecteer').click()
        await app.clickSheet(100, 70)
    })
    // the properties of the selected symbol are highlighted and the card does not hide the drawing
    await showsStep(page, 'eigenschappen-situatie')
    await expect(page.locator('#sit-props')).toBeVisible()
    const sp = await box(page.locator('#sit-props')),
        hl = await spotBox(page)
    expect(hits(hl, {x: sp.x + sp.width / 2, y: sp.y + sp.height / 2})).toBe(true)
    const cb = await box(card(page))
    for (const [x, y] of drawn) expect(hits(cb, await app.sheetPoint(x, y))).toBe(false)

    await advanceTo(page, 'klaar')
    await primary(page).click()
    await expect(card(page)).toHaveCount(0)
    expect((await storedTour(page, backend)).how).toBe('done')
    // what was drawn is really in the project, including the new scale
    const doc = await app.save(backend)
    expect(JSON.stringify(doc.een)).toContain('"type":"kring"')
    expect(JSON.stringify(doc.een)).toContain('"type":"stopcontact"')
    expect(doc.footer.schaal).toBe('1:75')
    expect(doc.sit[0].walls).toHaveLength(2)
    expect(doc.sit[0].walls[1]).toMatchObject({x1: 40, y1: 100, x2: 240, y2: 100}) // 15 m at 1:75 is 200 mm
    expect(doc.sit[0].items.map((i) => i.kind).sort()).toEqual(['door', 'sym'])
})

test('skipping the Kaderinfo step does not finish the next one; opening and closing the dialog does', async ({page, app, backend}) => {
    await startTour(page, app, backend)
    await advanceTo(page, 'kaderinfo')
    await primary(page).click() // Sla over
    await showsStep(page, 'kaderinfo-schaal')
    await expect(page.locator('#tour-hint')).toHaveText(t('tour.steps.kaderinfo-schaal.missing'))
    await page.waitForTimeout(1500)
    await showsStep(page, 'kaderinfo-schaal') // still here: nothing was opened and closed
    await page.locator('#btn-footer').click()
    await expect(page.locator('[data-tour="footer-schaal"]')).toHaveValue('1:50')
    await expect(card(page).locator('.tour-hint')).toHaveCount(0)
    await page.locator('#footer-close').click()
    await expect(page.locator('#tour-ok')).toBeVisible()
    await showsStep(page, 'deur', {timeout: 5000})
})

test('the steps of the typed length explain what to do when the length box is not there', async ({page, app, backend}) => {
    await startTour(page, app, backend)
    await advanceTo(page, 'muur-lengte')
    await expect(page.locator('#tour-hint')).toHaveText(t('tour.steps.muur-lengte.missing'))
    await primary(page).click()
    await showsStep(page, 'schaal-kiezen')
    await expect(page.locator('#tour-hint')).toHaveText(t('tour.steps.schaal-kiezen.missing'))
    await primary(page).click()
    await showsStep(page, 'muur-bevestig')
    await expect(page.locator('#tour-hint')).toHaveText(t('tour.steps.muur-bevestig.missing'))
})

test('Nu niet on the first card closes the tour for good', async ({page, app, backend}) => {
    await startTour(page, app, backend)
    await page.locator('#tour-close').click()
    await expect(card(page)).toHaveCount(0)
    expect((await storedTour(page, backend)).how).toBe('skip')
    await page.reload()
    await expect(page.locator('#tab-comp')).toBeVisible()
    await page.waitForTimeout(600)
    await expect(card(page)).toHaveCount(0)
})

test('an explaining step blocks the page behind it; an interactive step does not', async ({page, app, backend}) => {
    await startTour(page, app, backend)
    await advanceTo(page, 'palet')
    // a click on the page behind the card (the Components tab) does nothing
    const tab = await box(page.locator('#tab-comp'))
    await page.mouse.click(tab.x + tab.width / 2, tab.y + tab.height / 2)
    await expect(page.locator('#tab-comp')).not.toHaveClass(/on/)
    await expect(page.locator('#tab-een')).toHaveClass(/on/)
    await primary(page).click()
    // the kring step is interactive: the page itself is clickable (the highlighted button), and Escape belongs to the page
    await showsStep(page, 'kring')
    await page.keyboard.press('Escape')
    await expect(card(page)).toBeVisible()
    await expect(page.locator('#tour-try')).toHaveText(t('tour.tryYourself'))
})

test('Escape closes an explaining step; Enter on the first card starts the tour', async ({page, app, backend}) => {
    await startTour(page, app, backend)
    await page.keyboard.press('Enter') // the main button has the focus
    await showsStep(page, 'tabs')
    await page.keyboard.press('Escape')
    await expect(card(page)).toHaveCount(0)
    expect((await storedTour(page, backend)).how).toBe('skip')
})

test('Sla over skips an interactive step, a step whose target is not there says what to do, and Terug goes back', async ({page, app, backend}) => {
    await startTour(page, app, backend)
    await advanceTo(page, 'kring')
    await primary(page).click() // Sla over: no circuit was made
    await showsStep(page, 'eigenschappen')
    await expect(page.locator('#tour-hint')).toHaveText(t('tour.steps.eigenschappen.missing'))
    await expect(page.locator('#tour-spot')).toHaveCount(0) // nothing to point at, the page is just dimmed
    await page.locator('#tour-back').click()
    await showsStep(page, 'kring')
    await expect(page.locator('#tour-spot')).toBeVisible()
})

test('Leeg project starten ends the tour and begins a new, empty project', async ({page, app, backend, dialogs}) => {
    test.setTimeout(60_000)
    await startTour(page, app, backend)
    await advanceTo(page, 'kring')
    await page.locator('#eds-palette-kring').click()
    await advanceTo(page, 'klaar')
    await expect(page.locator('#btn-undo')).toBeEnabled() // the circuit is in the project
    await page.locator('#tour-extra').click()
    await expect(card(page)).toHaveCount(0)
    // the circuit made during the tour is unsaved work: the application asks before throwing it away
    expect(dialogs.messages.join('\n')).toContain('niet-opgeslagen')
    await expect(page.locator('#status-message')).toContainText(t('app.newProject'))
    await expect(page.locator('#btn-undo')).toBeDisabled()
    expect((await storedTour(page, backend)).how).toBe('done')
})

test('a new browser that finds real work on the server does not get the tour by itself; Info asks before starting it', async ({page, app, backend, dialogs}) => {
    await asNewVisitor(page, backend)
    await app.open(backend, withCircuit())
    await page.waitForTimeout(700)
    await expect(card(page)).toHaveCount(0)
    // not marked as seen either: it can still be started on purpose
    await page.locator('#tab-info').click()
    dialogs.confirm = false
    await page.locator('#btn-tour').click()
    await expect(card(page)).toHaveCount(0)
    expect(dialogs.messages).toContain(t('tour.confirmStart'))
    dialogs.confirm = true
    await page.locator('#btn-tour').click()
    await showsStep(page, 'welkom')
    // it goes back to the eendraadschema by itself
    await expect(page.locator('#tab-een')).toHaveClass(/on/)
})

for (const [w, h] of [[1500, 1000], [1024, 700], [800, 600]]) {
    test(`every card fits in a ${w}x${h} window and stays off the highlighted element`, async ({page, app, backend}) => {
        test.setTimeout(120_000)
        await page.setViewportSize({width: w, height: h})
        await startTour(page, app, backend)
        const seen = []
        for (let i = 0; i < 30; i++) {
            const name = await step(page)
            seen.push(name)
            await page.waitForTimeout(450) // the highlight glides to its place
            const c = await box(card(page).locator('xpath=.'))
            expect(c.x, name).toBeGreaterThanOrEqual(-1)
            expect(c.y, name).toBeGreaterThanOrEqual(-1)
            expect(c.x + c.width, name).toBeLessThanOrEqual(w + 1)
            expect(c.y + c.height, name).toBeLessThanOrEqual(h + 1)
            // next to the highlight (an arrow shows), never on top of it
            const side = await card(page).getAttribute('data-side')
            if (side && side !== 'none' && (await page.locator('#tour-spot').count())) expect(overlap(c, await spotBox(page)), name).toBe(false)
            if (name === 'klaar') break
            await primary(page).click()
        }
        expect(seen).toHaveLength(22)
    })
}