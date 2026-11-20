// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The situatieschema on a 10" tablet, with fingers: one finger draws, selects and drags; two fingers pan and pinch to zoom without drawing;
// a swipe never leaves the page; the Eigenschappen at the bottom of a portrait screen never hide the rest of the page.
import {test, expect} from './fixtures.js'
import {withCircuit} from './data.js'

const placed = (id, x, y) => ({id: 'i' + id, kind: 'sym', node: id, x, y, r: 0, s: 7})
const plan = () => ({...withCircuit(), sit: [{id: 's1', name: 'Plattegrond 1', walls: [], items: [placed('B', 200, 60)]}]})

// fingers through the DevTools protocol, at the pace of a real hand (a move every 16 ms, a moment between two actions)
const fingers = async (page) => {
    const cdp = await page.context().newCDPSession(page)
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map((p, id) => ({x: p.x, y: p.y, id}))})
    const move = async (from, to, steps = 10) => {
        await send('touchStart', from)
        for (let i = 1; i <= steps; i++) {
            await send('touchMove', from.map((a, n) => ({x: a.x + ((to[n].x - a.x) * i) / steps, y: a.y + ((to[n].y - a.y) * i) / steps})))
            await page.waitForTimeout(16)
        }
        await send('touchEnd', [])
        await page.waitForTimeout(400)
    }
    return {drag: (a, b) => move([a], [b]), twoFingers: (from, to) => move(from, to)}
}

for (const [name, width, height] of [
    ['iPad 10.2" landscape', 1080, 810],
    ['Android 10" portrait', 800, 1280],
])
    test.describe(name, () => {
        test.use({viewport: {width, height}, hasTouch: true, isMobile: true, deviceScaleFactor: 2})

        test('one finger draws, selects and drags; two fingers pan and zoom; a swipe stays in the application', async ({page, app, backend}) => {
            const {drag, twoFingers} = await fingers(page)
            const tap = async (x, y) => {
                const p = await app.sheetPoint(x, y)
                await page.touchscreen.tap(p.x, p.y)
                await page.waitForTimeout(350)
            }
            await app.open(backend, plan())
            await page.locator('#tab-sit').tap()
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
            // a wall with three taps (the last one on the same point ends it)
            await page.locator('#sit-tool-wall').tap()
            await tap(120, 60)
            await tap(200, 60)
            await tap(200, 60)
            expect((await app.save(backend)).sit[0].walls).toHaveLength(1)
            // a symbol: tapped it is selected, a finger drags it
            await page.locator('#sit-tool-select').tap()
            const symbol = page.locator('svg.sheet g[style*="move"]').last()
            const box = await symbol.boundingBox()
            await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
            await expect(page.locator('#sit-props')).toBeVisible()
            await drag({x: box.x + box.width / 2, y: box.y + box.height / 2}, {x: box.x + box.width / 2 + 80, y: box.y + box.height / 2 + 50})
            const moved = (await app.save(backend)).sit[0].items.find((item) => item.node === 'B')
            expect(moved.x).toBeGreaterThan(200)
            // portrait: the Eigenschappen lie along the bottom, and the page scrolls far enough that the list of what is not placed comes above them
            const unplaced = page.locator('#sit-unplaced .compbtn')
            const count = await unplaced.count()
            await unplaced.first().tap()
            await expect(unplaced).toHaveCount(count - 1)
            // a swipe that starts on the tool rail does not go back in the history nor scroll the page
            await page.evaluate(() => scrollTo(0, 0))
            const rail = await page.locator('#sit-tool-erase').boundingBox()
            await drag({x: rail.x + rail.width / 2, y: rail.y + rail.height / 2}, {x: rail.x + 260, y: rail.y + 120})
            expect(page.url()).toMatch(/^https?:\/\/(localhost|127\.0\.0\.1)/)
            await expect(page.locator('#sit-tools')).toBeVisible()
            // pinch: zoom in, with the wall tool on; two fingers never draw
            await page.locator('#sit-tool-wall').tap()
            const pane = page.locator('.main .zoomscroll').first()
            const area = await pane.boundingBox()
            const cx = area.x + area.width / 2,
                cy = Math.min(area.y + area.height / 2, height / 2)
            await twoFingers([{x: cx - 30, y: cy}, {x: cx + 30, y: cy}], [{x: cx - 110, y: cy}, {x: cx + 110, y: cy}])
            await expect(page.locator('#sit-zoom-reset')).toHaveText('400%')
            // two fingers pan the zoomed drawing
            const before = await pane.evaluate((element) => [element.scrollLeft, element.scrollTop])
            await twoFingers([{x: cx - 40, y: cy}, {x: cx + 40, y: cy}], [{x: cx - 140, y: cy - 80}, {x: cx - 60, y: cy - 80}])
            const after = await pane.evaluate((element) => [element.scrollLeft, element.scrollTop])
            expect(after[0]).toBeGreaterThan(before[0] + 50)
            expect(after[1]).toBeGreaterThan(before[1] + 30)
            expect((await app.save(backend)).sit[0].walls).toHaveLength(1)
            // pinch back out
            await twoFingers([{x: cx - 90, y: cy}, {x: cx + 90, y: cy}], [{x: cx - 15, y: cy}, {x: cx + 15, y: cy}])
            await expect(page.locator('#sit-zoom-reset')).toHaveText('75%')
        })
    })
