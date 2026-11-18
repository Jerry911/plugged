// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The bedradingsschema: symbols with connection points, wires that attach to them (and follow when a symbol moves), line styles and colours,
// junctions, frames, copying a plan of the situatieschema, and the settings of a symbol for this tab in Componenten.
import {test, expect} from './fixtures.js'
import {node, project, withCircuit} from './data.js'

const tool = (page, name) => page.locator('#wire-tool-' + name)
const wiringPage = async (app, backend) => (await app.save(backend)).wire[0]
const goto = async (page, app, backend, doc = project()) => {
    await app.open(backend, doc)
    await app.tab('wire')
    await expect(tool(page, 'select')).toBeVisible()
}
const sym = (id, type, x, y, extra = {}) => ({id, kind: 'sym', type, x, y, r: 0, s: 10, ...extra})
const withWiring = (page, base = project()) => ({...base, wire: [{id: 'w1', name: 'Bedrading 1', walls: [], items: [], wires: [], boxes: [], ...page}]})
// a contact above a lamp: the contact's lower connection point is at (60, 65), the lamp's upper one at (60, 115)
const contactAndLamp = () => withWiring({items: [sym('c', 'contact_no', 60, 60), sym('l', 'lamp_s', 60, 120)]})
const placeSymbol = async (page, app, key, x, y) => {
    await page.locator('#comp-filter').fill('')
    await page.locator('#comp-' + key).click()
    await app.clickSheet(x, y)
}

test.describe('the tab', () => {
    test('comes after the situatieschema, with its own tools and the symbols of the wiring in its palette', async ({page, app, backend}) => {
        await app.open(backend, project())
        const tabs = await page.locator('#tab-een, #tab-sit, #tab-wire, #tab-comp').evaluateAll((elements) => elements.map((element) => element.id))
        expect(tabs).toEqual(['tab-een', 'tab-sit', 'tab-wire', 'tab-comp'])
        await app.tab('wire')
        await expect(page.locator('#tab-wire')).toHaveText('Bedradingsschema')
        await expect(tool(page, 'wire')).toBeVisible()
        await expect(tool(page, 'box')).toBeVisible()
        await expect(page.locator('#wire-page-1')).toHaveText('Bedrading 1')
        await expect(page.locator('#comp-contactor3')).toBeVisible()
        await expect(page.locator('#comp-auto')).toBeVisible()
        // no list of elements to place and no starter templates here
        await expect(page.locator('#sit-unplaced-panel')).toHaveCount(0)
        await expect(page.locator('#wire-template')).toHaveCount(0)
    })
    test('the contacts are not offered on the eendraadschema, furniture is offered on the situatieschema', async ({page, app, backend}) => {
        await app.open(backend, project())
        await expect(page.locator('#eds-palette-contact_no')).toHaveCount(0)
        await expect(page.locator('#eds-palette-stopcontact')).toHaveCount(1)
        await app.tab('sit')
        await expect(page.locator('#comp-bed')).toBeVisible()
        await expect(page.locator('#comp-contact_no')).toHaveCount(0)
    })
    test('a new page of the bedradingsschema has its own name', async ({page, app, backend}) => {
        await goto(page, app, backend)
        await page.locator('#wire-page-add').click()
        await expect(page.locator('#wire-page-2')).toHaveText('Bedrading 2')
        const saved = await app.save(backend)
        expect(saved.wire.map((wirePage) => wirePage.name)).toEqual(['Bedrading 1', 'Bedrading 2'])
        expect(saved.wire[1]).toMatchObject({walls: [], items: [], wires: [], boxes: []})
    })
})

test.describe('wires', () => {
    test('a wire from a connection point to a connection point is attached to both symbols', async ({page, app, backend}) => {
        await goto(page, app, backend, contactAndLamp())
        await tool(page, 'wire').click()
        // the connection points show while the wire tool is on
        await expect(page.locator('#wire-pins circle')).toHaveCount(4)
        await app.clickSheet(60.5, 65.5) // close to the lower point of the contact: snaps onto it
        await app.clickSheet(60, 115)
        const saved = await wiringPage(app, backend)
        expect(saved.wires).toHaveLength(1)
        expect(saved.wires[0]).toMatchObject({a: {item: 'c', pin: 1}, b: {item: 'l', pin: 0}, points: [], style: 'solid', color: 'black', w: 0.35, ortho: true})
    })
    test('a wire follows its symbol when the symbol is dragged', async ({page, app, backend}) => {
        await goto(
            page,
            app,
            backend,
            withWiring({
                items: [sym('c', 'contact_no', 60, 60), sym('l', 'lamp_s', 60, 120)],
                wires: [{id: 'w', a: {item: 'c', pin: 1}, b: {item: 'l', pin: 0}, points: [], style: 'solid', color: 'brown', w: 0.35, ortho: true}],
            }),
        )
        const path = page.locator('#wire-wire-w')
        const before = await path.getAttribute('d')
        expect(before).toBe('M60 65 L60 115')
        await app.dragSheet([60, 120], [100, 120])
        // a right angle: down from the contact, then across to the lamp that moved
        await expect(path).toHaveAttribute('d', 'M60 65 L60 115 L100 115')
        const saved = await wiringPage(app, backend)
        expect(saved.items.find((item) => item.id === 'l')).toMatchObject({x: 100, y: 120})
        expect(saved.wires[0]).toMatchObject({a: {item: 'c', pin: 1}, b: {item: 'l', pin: 0}})
    })
    test('bends, a line style and a colour; a right click ends the wire at its last point', async ({page, app, backend}) => {
        await goto(page, app, backend, withWiring({}))
        await tool(page, 'wire').click()
        await page.locator('#wire-pen-style-dashed').click()
        await page.locator('#wire-pen-color-blue').click()
        await page.locator('#wire-pen-width').selectOption('0.5')
        await app.clickSheet(100, 40)
        await app.clickSheet(150, 40)
        await app.clickSheet(150, 80)
        await app.clickSheet(150, 80, {button: 'right'})
        // the wire tool stays on for the next wire
        await expect(tool(page, 'wire')).toHaveClass(/on/)
        const saved = await wiringPage(app, backend)
        expect(saved.wires).toHaveLength(1)
        expect(saved.wires[0]).toMatchObject({a: {x: 100, y: 40}, points: [{x: 150, y: 40}], b: {x: 150, y: 80}, style: 'dashed', color: 'blue', w: 0.5})
        await expect(page.locator('#wire-wire-' + saved.wires[0].id)).toHaveAttribute('d', 'M100 40 L150 40 L150 80')
    })
    test('Escape drops the wire being drawn, Enter ends it', async ({page, app, backend}) => {
        await goto(page, app, backend, withWiring({}))
        await tool(page, 'wire').click()
        await app.clickSheet(40, 40)
        await app.clickSheet(80, 40)
        await page.keyboard.press('Escape')
        await expect(tool(page, 'wire')).toHaveClass(/on/)
        await app.clickSheet(40, 100)
        await app.clickSheet(80, 100)
        await page.keyboard.press('Enter')
        const saved = await wiringPage(app, backend)
        expect(saved.wires).toHaveLength(1)
        expect(saved.wires[0]).toMatchObject({a: {x: 40, y: 100}, b: {x: 80, y: 100}, points: []})
    })
    test('a wire that ends on another wire makes a branch with a junction dot', async ({page, app, backend}) => {
        await goto(
            page,
            app,
            backend,
            withWiring({wires: [{id: 'main', a: {x: 40, y: 60}, b: {x: 160, y: 60}, points: [], style: 'solid', color: 'black', w: 0.35, ortho: true}]}),
        )
        await expect(page.locator('#wire-sheet .junction')).toHaveCount(0)
        await tool(page, 'wire').click()
        await app.clickSheet(100, 120)
        await app.clickSheet(100.4, 60.5) // on the wire: ends there
        await expect(page.locator('#wire-sheet .junction')).toHaveCount(1)
        const saved = await wiringPage(app, backend)
        expect(saved.wires[1]).toMatchObject({a: {x: 100, y: 120}, b: {x: 100, y: 60}})
    })
    test('the selected wire gets another colour; deleting a symbol leaves its wires where they were', async ({page, app, backend}) => {
        await goto(
            page,
            app,
            backend,
            withWiring({
                items: [sym('c', 'contact_no', 60, 60), sym('l', 'lamp_s', 60, 120)],
                wires: [{id: 'w', a: {item: 'c', pin: 1}, b: {item: 'l', pin: 0}, points: [], style: 'solid', color: 'black', w: 0.35, ortho: true}],
            }),
        )
        await page.locator('#wire-wire-w').click({force: true})
        await expect(page.locator('#wire-wire-props')).toBeVisible()
        await expect(page.locator('#wire-wire-title')).toHaveText('Draad · 2,50 m')
        await page.locator('#wire-sel-color-yellowgreen').click()
        await app.clickSheet(200, 150) // deselect
        await app.clickSheet(60, 120) // the lamp
        await page.keyboard.press('Delete')
        const saved = await wiringPage(app, backend)
        expect(saved.items.map((item) => item.id)).toEqual(['c'])
        expect(saved.wires[0]).toMatchObject({color: 'yellowgreen', a: {item: 'c', pin: 1}, b: {x: 60, y: 115}})
    })
    test('the length of the wires shows next to them when Maten is switched on', async ({page, app, backend}) => {
        await goto(page, app, backend, withWiring({wires: [{id: 'w', a: {x: 40, y: 60}, b: {x: 140, y: 60}, points: [], style: 'solid', color: 'black', w: 0.35}]}))
        await expect(page.locator('#wire-sheet .wire .length-label')).toHaveCount(0)
        await page.locator('#wire-toggle-lengths').click()
        await expect(page.locator('#wire-sheet .wire .length-label')).toHaveText('5,00 m')
        expect((await wiringPage(app, backend)).dims).toBe(true)
    })
})

test.describe('frames, symbols and plans', () => {
    test('a frame is drawn with two clicks in the line style of the pen and can be restyled', async ({page, app, backend}) => {
        await goto(page, app, backend, withWiring({}))
        await tool(page, 'box').click()
        await page.locator('#wire-pen-style-dashdot').click()
        await app.clickSheet(30, 30)
        await app.clickSheet(130, 90)
        let saved = await wiringPage(app, backend)
        expect(saved.boxes).toHaveLength(1)
        expect(saved.boxes[0]).toMatchObject({x1: 30, y1: 30, x2: 130, y2: 90, style: 'dashdot', color: 'black'})
        await tool(page, 'select').click()
        await app.clickSheet(80, 30) // on its top side
        await page.locator('#wire-box-color-red').click()
        saved = await wiringPage(app, backend)
        expect(saved.boxes[0].color).toBe('red')
    })
    test('large symbols such as a car can be made much bigger than on the situatieschema', async ({page, app, backend}) => {
        await goto(page, app, backend, withWiring({}))
        await tool(page, 'sym').click()
        await placeSymbol(page, app, 'auto', 150, 90)
        await tool(page, 'select').click()
        await app.clickSheet(150, 90)
        await expect(page.locator('#wire-size')).toHaveAttribute('max', '150')
        await page.locator('#wire-size').fill('80')
        const saved = await wiringPage(app, backend)
        expect(saved.items[0]).toMatchObject({kind: 'sym', type: 'auto', s: 80})
    })
    test('a plan of the situatieschema is copied with its walls and its symbols with their marking', async ({page, app, backend}) => {
        const base = withCircuit({
            sit: [
                {
                    id: 's1',
                    name: 'Gelijkvloers',
                    walls: [{id: 'm', x1: 20, y1: 20, x2: 200, y2: 20}],
                    items: [
                        {id: 'p', kind: 'sym', node: 'S', x: 60, y: 50, r: 0, s: 7},
                        {id: 'd', kind: 'door', x: 100, y: 20, r: 0, w: 10},
                    ],
                },
            ],
        })
        base.een[0].tree[0].children[0].children[0].label = 'A'
        await goto(page, app, backend, withWiring({}, base))
        await expect(page.locator('#wire-empty')).toBeVisible()
        await page.locator('#wire-copy-plan').click()
        await expect(page.locator('#copy-plan-dialog')).toBeVisible()
        await page.locator('#copy-plan-ok').click()
        await expect(page.locator('#copy-plan-dialog')).toHaveCount(0)
        const saved = await app.save(backend)
        expect(saved.wire[0].walls).toEqual([expect.objectContaining({x1: 20, y1: 20, x2: 200, y2: 20})])
        expect(saved.wire[0].walls[0].id).not.toBe('m')
        expect(saved.wire[0].items).toEqual([
            expect.objectContaining({kind: 'sym', type: 'stopcontact', mark: 'A1', x: 60, y: 50}),
            expect.objectContaining({kind: 'door', x: 100, y: 20}),
        ])
        expect(saved.wire[0].items[0].node).toBeUndefined()
        // the situatieschema is untouched
        expect(saved.sit[0].items.map((item) => item.id)).toEqual(['p', 'd'])
    })
    test('the bedradingsschema is printed after the situatieschema; an empty one is left out', async ({page, app, backend}) => {
        await goto(page, app, backend, contactAndLamp())
        await expect(page.locator('#wire-sheet-number')).toHaveText('Blad 1/1')
        await page.locator('#wire-page-add').click()
        await expect(page.locator('#wire-sheet-number')).toHaveText('Blad 2/2')
    })
})

test.describe('symbols in Componenten', () => {
    test('a standard symbol of the wiring is not in the eendraadschema and has its connection points', async ({page, app, backend}) => {
        await app.open(backend, project())
        await app.tab('comp')
        await page.locator('#comp-search').fill('Klem')
        await page.locator('#comp-item-klem').click()
        await expect(page.locator('#comp-in-een')).not.toBeChecked()
        await expect(page.locator('#comp-in-wire')).toBeChecked()
        await expect(page.locator('#comp-pins-state')).toHaveText('eigen (2)')
        await expect(page.locator('#comp-pins .comp-pin')).toHaveCount(2)
    })
    test('an own symbol gets its palettes and its connection points, and keeps them when saved', async ({page, app, backend}) => {
        await app.open(backend, project())
        await app.tab('comp')
        await page.locator('#comp-new').click()
        await page.locator('#comp-tool-line').click()
        await app.clickSvg('#comp-drawing', 12, 0)
        await app.clickSvg('#comp-drawing', 12, 24)
        await page.locator('#comp-name').fill('Mijn relaiscontact')
        // found from the drawing: the two ends of the line on the border
        await expect(page.locator('#comp-pins-state')).toHaveText('automatisch (2)')
        await page.locator('#comp-tool-pins').click()
        await app.clickSvg('#comp-drawing', 12, 12) // adds one
        await app.clickSvg('#comp-drawing', 12, 0) // removes one
        await expect(page.locator('#comp-pins-state')).toHaveText('eigen (2)')
        await page.locator('#comp-pins-none').click()
        await expect(page.locator('#comp-pins-state')).toHaveText('geen')
        await page.locator('#comp-pins-auto').click()
        await expect(page.locator('#comp-pins-state')).toHaveText('automatisch (2)')
        await app.clickSvg('#comp-drawing', 12, 12)
        await page.locator('#comp-in-een').uncheck()
        // in the palette of the bedradingsschema because it is placeable, until the box is switched off
        await expect(page.locator('#comp-in-wire')).toBeChecked()
        await page.locator('#comp-save').click()
        await expect.poll(() => backend.symbolByName('Mijn relaiscontact')).toBeTruthy()
        const stored = await backend.symbolByName('Mijn relaiscontact')
        expect(stored).toMatchObject({een: false, place: true, pins: [[12, 0], [12, 24], [12, 12]]})
        expect(stored.wire ?? null).toBeNull()
        // only in the palette of the bedradingsschema
        await app.tab('een')
        await expect(app.paletteButton(stored.k)).toHaveCount(0)
        await app.tab('wire')
        await page.locator('#comp-filter').fill('Mijn relaiscontact')
        await expect(page.locator('.compbtn[id^="comp-"]')).toHaveCount(1)
    })
})
