// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The layout on screens of different sizes: the side panels reach to the bottom of the window, the situatieschema fits in the window,
// and on a phone the panels stand above and below the drawing, the top bar stays short and the Eigenschappen sit along the bottom.
import {test, expect, t} from './fixtures.js'
import {withCircuit} from './data.js'

const placed = (id, x, y) => ({id: 'i' + id, kind: 'sym', node: id, x, y, r: 0, s: 7})
// the board and the light are placed, the socket is not
const plan = () => ({...withCircuit(), sit: [{id: 's1', name: 'Plattegrond 1', walls: [], items: [placed('B', 200, 60), placed('L', 120, 60)]}]})
const bottomOf = async (locator) => {
    const box = await locator.boundingBox()
    return box.y + box.height
}

test.describe('a desktop screen', () => {
    for (const viewport of [
        {width: 1500, height: 1000},
        {width: 1280, height: 720},
    ])
        test(`${viewport.width}x${viewport.height}: the panels reach to the bottom of the window, the plan takes all the width between them`, async ({page, app, backend}) => {
            await page.setViewportSize(viewport)
            await app.open(backend, plan())
            // eendraadschema: palette and Opbouw down to 10 px above the bottom, no white space under Opbouw
            const palette = page.locator('#eds-palette')
            await expect.poll(() => bottomOf(palette)).toBeCloseTo(viewport.height - 10, -1)
            expect(await bottomOf(page.locator('#eds-tree'))).toBeGreaterThan(viewport.height - 40)
            await app.tab('sit')
            const left = page.locator('.row > .side'),
                right = page.locator('#sit-unplaced-panel'),
                sheet = page.locator('.row .main svg.sheet')
            await expect.poll(() => bottomOf(left)).toBeCloseTo(viewport.height - 10, -1)
            await expect.poll(() => bottomOf(right)).toBeCloseTo(viewport.height - 10, -1)
            // no white space between the drawing and the panel on its right
            const before = await sheet.boundingBox(),
                rightBox = await right.boundingBox()
            expect(rightBox.x - (before.x + before.width)).toBeLessThan(40)
            // the toggle of the right panel sits above the drawing, in the line of the page buttons
            const toggle = await page.locator('#sit-unplaced-toggle').boundingBox(),
                sheetBox = await sheet.boundingBox()
            expect(toggle.y + toggle.height).toBeLessThan(sheetBox.y)
            // collapsed, the panel takes no room: the row ends at the toggle
            await page.locator('#sit-unplaced-toggle').click()
            expect((await right.boundingBox()).width).toBe(0)
            await expect(page.locator('#sit-unplaced-toggle')).toBeVisible()
            // and the drawing takes its place
            await expect.poll(async () => (await sheet.boundingBox()).width).toBeGreaterThan(before.width + 200)
            expect((await sheet.boundingBox()).x + (await sheet.boundingBox()).width).toBeGreaterThan(viewport.width - 50)
            // Componenten: the list down to the bottom too
            await app.tab('comp')
            await expect.poll(() => bottomOf(page.locator('#comp-menu'))).toBeCloseTo(viewport.height - 10, -1)
        })

    test('the Eigenschappen of both drawings look the same: heading, close button, icon buttons with a hover text', async ({page, app, backend}) => {
        await app.open(backend, plan())
        await page.locator('#eds-tree').getByText('Gang licht').click()
        await expect(page.locator('#eds-props.props #eds-props-title')).toHaveText(t('oneWire.properties'))
        await expect(page.locator('#eds-rotate-cw')).toHaveAttribute('title', t('oneWire.toolbar.rotateClockwiseTitle', {degrees: 15}))
        await app.tab('sit')
        await page.locator('#sit-tool-select').click()
        // the light: its marking A2 is next to it; click the symbol itself
        await page.locator('svg.sheet g[style*="move"]').nth(1).click()
        await expect(page.locator('#sit-props.props #sit-props-heading')).toHaveText(t('situation.properties'))
        await page.locator('#sit-rotate-90').hover()
        await expect(page.locator('#sit-rotate-90')).toHaveAttribute('title', t('situation.rotateClockwiseTitle', {degrees: 90}))
        await page.locator('#sit-delete').click()
        await expect(page.locator('#sit-props')).toHaveCount(0)
        await expect(page.locator('#sit-unplaced')).toContainText('Gang licht')
    })
})

test.describe('a phone', () => {
    test.use({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true})

    test('the top bar keeps to a few lines, the panels stand above and below the drawing, the Eigenschappen along the bottom', async ({page, app, backend}) => {
        await app.open(backend, plan())
        // the less used buttons show only their icon; their text is the hover text
        expect((await page.locator('#top-bar').boundingBox()).height).toBeLessThan(140)
        await expect(page.locator('#tab-account .bar-text')).toBeHidden()
        expect([t('account.buttonTitle'), t('account.buttonTitleAdmin')]).toContain(await page.locator('#tab-account').getAttribute('title'))
        // nothing is wider than the screen
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
        // eendraadschema: the palette and Opbouw above the drawing, as wide as the screen
        const palette = await page.locator('#eds-palette').boundingBox(),
            drawing = await page.locator('#eds-sheet-1').boundingBox()
        expect(palette.width).toBeGreaterThan(350)
        expect(drawing.y).toBeGreaterThan(palette.y + palette.height - 1)
        // a tap on an element opens its Eigenschappen at the bottom of the screen
        await page.locator('#eds-tree').getByText('Gang licht').tap()
        const props = await page.locator('#eds-props').boundingBox()
        expect(props.y + props.height).toBeCloseTo(844, -1)
        await expect(page.locator('#eds-delete')).toBeInViewport()
        await page.locator('#eds-close').tap()
        // situatieschema: the drawing as wide as the screen, the list of what is not placed under it, with words on its toggle
        await app.tab('sit')
        const sheet = await page.locator('.row .main svg.sheet').boundingBox()
        expect(sheet.width).toBeGreaterThan(340)
        const right = await page.locator('#sit-unplaced-panel').boundingBox()
        expect(right.y).toBeGreaterThan(sheet.y + sheet.height - 1)
        await expect(page.locator('#sit-unplaced-toggle .paneltoggle-text')).toBeVisible()
        await expect(page.locator('#sit-help')).toBeHidden()
        // a tap places the socket and selects it: its Eigenschappen are in reach at the bottom
        await page.locator('#sit-unplaced .unprow button').first().tap()
        await expect(page.locator('#sit-props')).toBeInViewport()
        await page.locator('#sit-rotate-90').tap()
        await page.locator('#sit-delete').tap()
        await expect(page.locator('#sit-props')).toHaveCount(0)
    })
})
