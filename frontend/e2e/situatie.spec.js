// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The situatieschema: drawing walls and rooms, placing doors, windows, symbols and text, selecting and editing, and the list of
// components that are not placed yet. Everything is done with the real mouse on the drawing; the result is checked in the saved project.
import {test, expect} from './fixtures.js'
import {node, project, withCircuit} from './data.js'

const tool = (page, name) => page.getByRole('button', {name, exact: true})
const sit = async (app, backend) => (await app.save(backend)).sit[0]
const wall = (id, x1, y1, x2, y2) => ({id, x1, y1, x2, y2})
const withItems = (items, walls = [], base = withCircuit()) => ({...base, sit: [{id: 's1', name: 'Plattegrond 1', walls, items}]})
// the board counts as a component too: it has to be placed as well
const everything = () => [placed('B', 200, 60), placed('S', 80, 60), placed('L', 120, 60)]
const placed = (id, x, y, extra = {}) => ({id: 'i' + id, kind: 'sym', node: id, x, y, r: 0, s: 7, ...extra})
const goto = async (page, app, backend, doc) => {
    await app.open(backend, doc)
    await app.tab('Situatieschema')
    await expect(tool(page, 'Selecteer')).toBeVisible()
}
const unplaced = (page) => page.getByText(/Nergens geplaatst \(\d+\)/)

test.describe('walls and rooms', () => {
    test('walls are drawn as a chain; clicking the last point again stops; right click goes back to Selecteer', async ({page, app, backend}) => {
        await goto(page, app, backend, project())
        await tool(page, 'Muur').click()
        await app.clickSheet(40, 40)
        await app.clickSheet(120, 40)
        await app.clickSheet(120, 100)
        await app.clickSheet(120, 100) // the same point again: stop
        await app.clickSheet(60, 120) // starts a new chain (one point only)
        await app.clickSheet(80, 80, {button: 'right'})
        await expect(tool(page, 'Selecteer')).toHaveClass(/on/)
        const s = await sit(app, backend)
        expect(s.walls).toHaveLength(2)
        expect(s.walls[0]).toMatchObject({x1: 40, y1: 40, x2: 120, y2: 40})
        expect(s.walls[1]).toMatchObject({x1: 120, y1: 40, x2: 120, y2: 100})
    })
    test('clicks in the footer area are ignored', async ({page, app, backend}) => {
        await goto(page, app, backend, project())
        await tool(page, 'Muur').click()
        await app.clickSheet(40, 40)
        await app.clickSheet(60, 195)
        await app.clickSheet(100, 40)
        expect((await sit(app, backend)).walls).toHaveLength(1)
    })
    test('the room tool draws four walls from two corners', async ({page, app, backend}) => {
        await goto(page, app, backend, project())
        await tool(page, 'Kamer').click()
        await app.clickSheet(40, 40)
        await app.clickSheet(140, 100)
        const s = await sit(app, backend)
        expect(s.walls).toHaveLength(4)
        expect(Math.min(...s.walls.map((w) => w.x1))).toBe(40)
        expect(Math.max(...s.walls.map((w) => w.x2))).toBe(140)
    })
    test('Escape cancels the wall that is being drawn', async ({page, app, backend}) => {
        await goto(page, app, backend, project())
        await tool(page, 'Muur').click()
        await app.clickSheet(40, 40)
        await page.keyboard.press('Escape')
        await expect(tool(page, 'Selecteer')).toHaveClass(/on/)
        await tool(page, 'Muur').click()
        await app.clickSheet(100, 40)
        await app.clickSheet(100, 40)
        expect((await sit(app, backend)).walls).toHaveLength(0)
    })
    test('while drawing, the length of the wall is shown and a typed length continues the chain', async ({page, app, backend}) => {
        await goto(page, app, backend, project()) // scale 1:50: 1 mm on the sheet = 5 cm
        await tool(page, 'Muur').click()
        await app.clickSheet(40, 40)
        await app.moveSheet(120, 40)
        const input = page.getByPlaceholder('bv. 3,5 of 350cm')
        await expect(input).toBeVisible()
        await input.fill('3,5')
        await input.press('Enter')
        await app.moveSheet(70, 120)
        await input.fill('200cm')
        await input.press('Enter')
        await page.keyboard.press('Escape')
        const s = await sit(app, backend)
        expect(s.walls).toHaveLength(2)
        expect(Math.hypot(s.walls[0].x2 - s.walls[0].x1, s.walls[0].y2 - s.walls[0].y1)).toBeCloseTo(70, 0) // 3,5 m at 1:50
        expect(Math.hypot(s.walls[1].x2 - s.walls[1].x1, s.walls[1].y2 - s.walls[1].y1)).toBeCloseTo(40, 0) // 200 cm
    })
    test('the room tool accepts "width x height" in metres', async ({page, app, backend}) => {
        await goto(page, app, backend, project())
        await tool(page, 'Kamer').click()
        await app.clickSheet(40, 40)
        await app.moveSheet(150, 110)
        const input = page.getByPlaceholder('bv. 4x3,5 (m)')
        await input.fill('4x3')
        await input.press('Enter')
        const s = await sit(app, backend)
        expect(s.walls).toHaveLength(4)
        const xs = s.walls.flatMap((w) => [w.x1, w.x2]),
            ys = s.walls.flatMap((w) => [w.y1, w.y2])
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(80, 0)
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(60, 0)
    })
    test('wall lengths follow the scale of the footer and can be hidden with the Maten button', async ({page, app, backend}) => {
        await goto(page, app, backend, project({sit: [{id: 's1', name: 'P', walls: [wall('w', 40, 40, 140, 40)], items: []}]}))
        const sheet = page.locator('svg.sheet').first()
        await expect(sheet).toContainText('5,00 m') // 100 mm at 1:50
        await page.getByTitle('Maten tonen/verbergen').click()
        await expect(sheet).not.toContainText('5,00 m')
        await page.getByTitle('Maten tonen/verbergen').click()
        await expect(sheet).toContainText('5,00 m')
    })
    test('the length of a wall can be typed in the inspector', async ({page, app, backend}) => {
        await goto(page, app, backend, project({sit: [{id: 's1', name: 'P', walls: [wall('w', 40, 40, 140, 40)], items: []}]}))
        await app.clickSheet(90, 40)
        const len = page.getByLabel(/Lengte/)
        await expect(len).toHaveValue('5,00 m')
        await len.fill('3')
        await len.press('Enter')
        const w = (await sit(app, backend)).walls[0]
        expect(Math.hypot(w.x2 - w.x1, w.y2 - w.y1)).toBeCloseTo(60, 0) // 3 m at 1:50
    })
})

test.describe('doors, windows, symbols and text', () => {
    test('doors and windows snap onto a wall, or float when no wall is near', async ({page, app, backend}) => {
        await goto(page, app, backend, project({sit: [{id: 's1', name: 'P', walls: [wall('w', 40, 40, 140, 40)], items: []}]}))
        await tool(page, 'Deur').click()
        await app.clickSheet(90, 44)
        await app.clickSheet(100, 130)
        await tool(page, 'Raam').click()
        await app.clickSheet(60, 44)
        const items = (await sit(app, backend)).items
        expect(items.map((i) => i.kind)).toEqual(['door', 'door', 'window'])
        expect(items[0]).toMatchObject({x: 90, y: 40, r: 0})
        expect(items[1]).toMatchObject({x: 100, y: 130})
        expect(items[2]).toMatchObject({x: 60, y: 40})
    })
    test('text is placed with the Tekst tool; cancelling the prompt places nothing', async ({page, app, backend, dialogs}) => {
        await goto(page, app, backend, project())
        await tool(page, 'Tekst').click()
        dialogs.answers.push('Living')
        await app.clickSheet(60, 60)
        dialogs.answers.push(null)
        await app.clickSheet(100, 60)
        await expect(page.locator('svg.sheet').first()).toContainText('Living')
        const items = (await sit(app, backend)).items
        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({kind: 'text', txt: 'Living'})
    })
    test('the Symbool tool places a general component from the library on the sheet', async ({page, app, backend}) => {
        await goto(page, app, backend, withCircuit())
        await tool(page, 'Symbool').click()
        await app.clickSheet(80, 80) // nothing chosen yet: nothing happens
        await page.locator('#comp-stopcontact').click()
        await app.clickSheet(80, 80)
        const items = (await sit(app, backend)).items
        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({kind: 'sym', type: 'stopcontact', x: 80, y: 80})
        expect(items[0].node).toBeUndefined()
        await expect(unplaced(page)).toContainText('(3)') // a general symbol does not place the component of the schema
    })
    test('the list of general components can be filtered by name or category', async ({page, app, backend}) => {
        await goto(page, app, backend, project())
        const list = page.locator('.compbtn[id^="comp-"]')
        const all = await list.count()
        expect(all).toBeGreaterThan(10)
        await page.getByLabel('Zoek component').fill('oven')
        expect(await list.count()).toBeLessThan(all)
        expect(await list.count()).toBeGreaterThan(0)
        await page.getByLabel('Zoek component').fill('zzzz')
        await expect(list).toHaveCount(0)
    })
})

test.describe('components of the eendraadschema that are not placed yet', () => {
    test('they are listed with their marking; clicking one places it and removes it from the list', async ({page, app, backend}) => {
        await goto(page, app, backend, withCircuit())
        await expect(unplaced(page)).toContainText('(3)')
        await expect(page.getByTitle('Niet geplaatst op situatieschema').first()).toBeVisible() // the badge on the tab
        await page.locator('#unplaced-S').click()
        await expect(unplaced(page)).toContainText('(2)')
        await page.locator('#unplaced-L').click()
        await page.locator('#unplaced-B').click()
        await expect(page.getByText('✓ Alle componenten geplaatst')).toBeVisible()
        const s = await sit(app, backend)
        expect(s.items.map((i) => i.node).sort()).toEqual(['B', 'L', 'S'])
        expect(new Set(s.items.map((i) => i.x + ',' + i.y)).size).toBe(3) // successive clicks do not stack them on one spot
    })
    test('"Plaats ontbrekende op dit blad" places them all', async ({page, app, backend}) => {
        await goto(page, app, backend, withCircuit())
        await page.getByText('Plaats ontbrekende op dit blad').click()
        await expect(page.getByText('✓ Alle componenten geplaatst')).toBeVisible()
        expect((await sit(app, backend)).items.map((i) => i.node).sort()).toEqual(['B', 'L', 'S'])
    })
    test('deleting a placed symbol puts it back in the list', async ({page, app, backend}) => {
        await goto(page, app, backend, withItems(everything()))
        await expect(page.getByText('✓ Alle componenten geplaatst')).toBeVisible()
        await app.clickSheet(80, 60)
        await page.keyboard.press('Delete')
        await expect(unplaced(page)).toContainText('(1)')
        await expect(page.locator('#unplaced-S')).toBeVisible()
    })
    test('the markings of the circuit show in the list: circuit letter + point number', async ({page, app, backend}) => {
        await goto(page, app, backend, withCircuit())
        await expect(page.locator('#unplaced-S')).toContainText('K1')
        await expect(page.locator('#unplaced-L')).toContainText('K2')
    })
    test('a component can be hidden from the list and restored', async ({page, app, backend}) => {
        await goto(page, app, backend, withCircuit())
        await page.locator('#hide-S').click()
        await expect(unplaced(page)).toContainText('(2)')
        await expect(page.locator('#unplaced-S')).toHaveCount(0)
        await page.locator('#toggle-hidden').click()
        await expect(page.locator('#hidden-S')).toBeVisible()
        // the choice is part of the project: it survives saving and reloading
        await app.save(backend)
        await page.reload()
        await app.tab('Situatieschema')
        await expect(page.locator('#unplaced-S')).toHaveCount(0)
        await page.locator('#toggle-hidden').click()
        await page.locator('#unhide-S').click()
        await expect(page.locator('#unplaced-S')).toBeVisible()
        await expect(unplaced(page)).toContainText('(3)')
    })
    test('"Plaats ontbrekende" skips hidden components; hiding everything shows the all-placed message', async ({page, app, backend}) => {
        await goto(page, app, backend, withCircuit())
        await page.locator('#hide-S').click()
        await page.getByText('Plaats ontbrekende op dit blad').click()
        expect((await sit(app, backend)).items.map((i) => i.node).sort()).toEqual(['B', 'L'])
        await expect(page.getByText('✓ Alle componenten geplaatst')).toBeVisible()
    })
    test('the panel can be collapsed so the drawing grows', async ({page, app, backend}) => {
        await goto(page, app, backend, withCircuit())
        const sheet = page.locator('svg.sheet').first()
        const before = (await sheet.boundingBox()).width
        await page.getByLabel('Nergens geplaatst inklappen').click()
        await expect(page.getByLabel('Nergens geplaatst openen')).toBeVisible()
        await expect.poll(async () => (await sheet.boundingBox()).width).toBeGreaterThan(before)
        await page.getByLabel('Nergens geplaatst openen').click()
        await expect(unplaced(page)).toBeVisible()
    })
})

test.describe('selecting and editing items', () => {
    const one = () => withItems([placed('S', 100, 100)])
    test('clicking an item selects it; dragging moves it; arrow keys, R and Delete work', async ({page, app, backend}) => {
        await goto(page, app, backend, one())
        await app.clickSheet(100, 100)
        await expect(page.getByText('Geselecteerd: sym')).toBeVisible()
        await app.dragSheet([100, 100], [130, 120])
        let it = (await sit(app, backend)).items[0]
        expect(it.x).toBeGreaterThan(115)
        expect(it.y).toBeGreaterThan(105)
        const x = it.x
        await page.keyboard.press('ArrowRight')
        it = (await sit(app, backend)).items[0]
        expect(it.x).toBeGreaterThan(x)
        await page.keyboard.press('r')
        it = (await sit(app, backend)).items[0]
        expect(it.r).toBeGreaterThan(0)
        await page.keyboard.press('Delete')
        expect((await sit(app, backend)).items).toHaveLength(0)
    })
    test('the inspector rotates, resizes, duplicates and deletes the selected item', async ({page, app, backend}) => {
        await goto(page, app, backend, one())
        await app.clickSheet(100, 100)
        await page.getByText('⟳90°').click()
        await page.locator('input[type=range]').fill('12')
        await page.locator('.warn', {hasText: 'Geselecteerd'}).getByText('⧉').click()
        let s = await sit(app, backend)
        expect(s.items).toHaveLength(2)
        expect(s.items[0]).toMatchObject({r: 90, s: 12})
        await page.getByRole('button', {name: 'Verwijder selectie'}).click()
        s = await sit(app, backend)
        expect(s.items).toHaveLength(1)
        await expect(page.getByText(/Geselecteerd/)).toHaveCount(0)
    })
    test('clicking an empty spot clears the selection', async ({page, app, backend}) => {
        await goto(page, app, backend, one())
        await app.clickSheet(100, 100)
        await expect(page.getByText('Geselecteerd: sym')).toBeVisible()
        await app.clickSheet(200, 60)
        await expect(page.getByText(/Geselecteerd/)).toHaveCount(0)
    })
    test('dragging a box selects everything it touches; Shift adds; a group moves and is deleted together', async ({page, app, backend}) => {
        const doc = withItems([placed('S', 60, 60), placed('L', 100, 60)], [wall('w', 200, 150, 260, 150)])
        await goto(page, app, backend, doc)
        await app.dragSheet([40, 40], [120, 90])
        await expect(page.getByText(/2 elementen geselecteerd/)).toBeVisible()
        await app.dragSheet([60, 60], [60, 80])
        const s = await sit(app, backend)
        expect(s.items[0].y).toBeGreaterThan(70)
        expect(s.items[1].y).toBeGreaterThan(70)
        await page.keyboard.press('Delete')
        expect((await sit(app, backend)).items).toHaveLength(0)
        expect((await sit(app, backend)).walls).toHaveLength(1) // the wall was not in the box
    })
    test('Shift-click toggles an item in the selection', async ({page, app, backend}) => {
        await goto(page, app, backend, withItems([placed('S', 60, 60), placed('L', 120, 60)]))
        await app.clickSheet(60, 60)
        await page.keyboard.down('Shift')
        await app.clickSheet(120, 60)
        await page.keyboard.up('Shift')
        await expect(page.getByText(/2 elementen geselecteerd/)).toBeVisible()
        await page.keyboard.down('Shift')
        await app.clickSheet(120, 60)
        await page.keyboard.up('Shift')
        await expect(page.getByText('Geselecteerd: sym')).toBeVisible()
    })
    test('the Wis tool erases walls and items', async ({page, app, backend}) => {
        await goto(page, app, backend, withItems([placed('S', 100, 100)], [wall('w', 40, 40, 140, 40)]))
        await tool(page, 'Wis').click()
        await app.clickSheet(90, 40)
        await app.clickSheet(100, 100)
        const s = await sit(app, backend)
        expect(s.walls).toHaveLength(0)
        expect(s.items).toHaveLength(0)
    })
    test('a wall can be selected, its end point dragged and deleted', async ({page, app, backend}) => {
        await goto(page, app, backend, project({sit: [{id: 's1', name: 'P', walls: [wall('w', 40, 40, 140, 40)], items: []}]}))
        await app.clickSheet(90, 40)
        await expect(page.getByLabel(/Lengte/)).toBeVisible()
        await app.dragSheet([140, 40], [140, 90])
        const w = (await sit(app, backend)).walls[0]
        expect(w.y2).toBeGreaterThan(80)
        expect(w.y1).toBe(40)
        await page.keyboard.press('Delete')
        expect((await sit(app, backend)).walls).toHaveLength(0)
    })
    test('a door can be flipped in the inspector', async ({page, app, backend}) => {
        await goto(page, app, backend, project({sit: [{id: 's1', name: 'P', walls: [wall('w', 40, 40, 140, 40)], items: [{id: 'd', kind: 'door', x: 90, y: 40, r: 0, a: 30}]}]}))
        await app.clickSheet(90, 40)
        await expect(page.getByText('Geselecteerd: door')).toBeVisible()
        const before = (await sit(app, backend)).items[0]
        await page.getByRole('button', {name: /spiegel|Spiegel|⇄|Draai om/}).first().click()
        const after = (await sit(app, backend)).items[0]
        expect(JSON.stringify(after)).not.toBe(JSON.stringify(before))
    })
})

test.describe('placed symbols follow the eendraadschema', () => {
    test('the text next to a symbol can be edited, cleared and reset to the marking', async ({page, app, backend}) => {
        await goto(page, app, backend, withItems([placed('S', 100, 100)]))
        const sheet = page.locator('svg.sheet').first()
        await app.clickSheet(100, 100)
        await expect(sheet).toContainText('K1')
        await page.locator('#sym-text').fill('A5')
        await expect(sheet).toContainText('A5')
        await page.locator('#sym-text').fill('')
        await expect(sheet).not.toContainText('K1')
        await page.locator('#sym-text-reset').click()
        await expect(sheet).toContainText('K1')
    })
    test('waterproof: the checkbox of a placed socket changes the component of the eendraadschema', async ({page, app, backend}) => {
        await goto(page, app, backend, withItems([placed('S', 100, 100)]))
        await app.clickSheet(100, 100)
        await page.locator('#sym-waterproof').check()
        const saved = await app.save(backend)
        expect(saved.een[0].tree[0].children[0].children[0].children[0].p.h).toBe(true)
        await app.tab('Eendraadschema')
        await app.treeRow('Keuken stopcontact').click()
        await expect(page.locator('#eds-waterproof')).toBeChecked()
    })
    test('waterproof set on the eendraadschema shows on the situatieschema', async ({page, app, backend}) => {
        const doc = withItems([placed('S', 100, 100)])
        doc.een[0].tree[0].children[0].children[0].children[0].p = {h: true}
        await goto(page, app, backend, doc)
        await app.clickSheet(100, 100)
        await expect(page.locator('#sym-waterproof')).toBeChecked()
    })
    test('a double socket (aantal 2) is drawn as a double socket', async ({page, app, backend}) => {
        const single = withItems([placed('S', 100, 100)])
        const double = withItems([placed('S', 100, 100)])
        double.een[0].tree[0].children[0].children[0].children[0].p = {aantal: 2}
        await goto(page, app, backend, single)
        const a = await page.locator('svg.sheet g[style*="move"]').first().innerHTML()
        await app.open(backend, double)
        await app.tab('Situatieschema')
        const b = await page.locator('svg.sheet g[style*="move"]').first().innerHTML()
        expect(b).not.toBe(a)
    })
})

test.describe('the drawing area', () => {
    test('zoom buttons in the drawing', async ({page, app, backend}) => {
        await goto(page, app, backend, project())
        const zoom = page.locator('.zoomctl').first()
        const sheet = page.locator('svg.sheet').first()
        const w0 = (await sheet.boundingBox()).width
        await zoom.getByTitle('Inzoomen').click()
        await expect.poll(async () => (await sheet.boundingBox()).width).toBeGreaterThan(w0)
        await zoom.getByTitle(/Zoom terugzetten/).click()
        await expect(zoom.getByTitle(/Zoom terugzetten/)).toHaveText('100%')
        await zoom.getByTitle('Uitzoomen').click()
        await expect.poll(async () => (await sheet.boundingBox()).width).toBeLessThan(w0)
    })
    test('drawing still works while zoomed in', async ({page, app, backend}) => {
        await goto(page, app, backend, project())
        await page.locator('.zoomctl').first().getByTitle('Inzoomen').click()
        await tool(page, 'Kamer').click()
        await app.clickSheet(40, 40)
        await app.clickSheet(100, 80)
        expect((await sit(app, backend)).walls).toHaveLength(4)
    })
    test('grid snapping is on by default; "Vrij tekenen" turns it off', async ({page, app, backend}) => {
        await goto(page, app, backend, project())
        const free = page.getByLabel('Vrij tekenen')
        await expect(free).not.toBeChecked()
        await tool(page, 'Muur').click()
        await app.clickSheet(41.3, 40.2)
        await app.clickSheet(103.7, 40.2)
        let w = (await sit(app, backend)).walls[0]
        expect(Number.isInteger(w.x1 / 5) || Number.isInteger(w.x1)).toBe(true)
        await free.check()
        await tool(page, 'Muur').click()
        await app.clickSheet(41.3, 80.2)
        await app.clickSheet(103.7, 80.2)
        w = (await sit(app, backend)).walls[1]
        expect(Math.abs(w.x1 - 41.3)).toBeLessThan(1)
    })
})
