// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Eendraadschema maken from the situatieschema: the symbols with a circuit number become circuits, linked to the plan; undo takes it back.
import {test, expect} from './fixtures.js'
import {project} from './data.js'

let n = 0
const loose = (type, mark, x, y) => ({id: 'l' + ++n, kind: 'sym', type, x, y, r: 0, s: 7, ...(mark ? {mark} : {})})
const plan = () =>
    project({
        sit: [
            {
                id: 's1',
                name: 'Gelijkvloers',
                walls: [],
                items: [
                    loose('schakelaar', 'B3', 40, 60),
                    loose('lichtpunt', 'B3', 70, 60),
                    loose('wissel', 'B4', 40, 110),
                    loose('wissel', 'B4', 140, 110),
                    loose('lichtpunt', 'B4', 90, 100),
                    loose('stopcontact', 'A1', 180, 60),
                    loose('stopcontact', 'A2', 220, 60),
                    loose('lichtpunt', 'A3', 200, 100),
                    loose('stopcontact', '', 250, 140),
                ],
            },
        ],
    })

test('the symbols with a circuit number become kringen of the eendraadschema, linked to the plan; undo takes it all back', async ({page, app, backend}) => {
    await app.open(backend, plan())
    await app.tab('sit')
    await expect(page.locator('#sit-generate-box')).toContainText('9')
    await page.locator('#sit-generate').click()
    const dialog = page.locator('#generate-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.locator('#generate-circuit-A')).toContainText('20 A')
    await expect(page.locator('#generate-circuit-B')).toContainText('16 A')
    await expect(page.locator('#generate-skipped li')).toHaveCount(1)
    await expect(page.locator('#generate-summary')).toHaveText('2 kringen · 1 × 16 A · 1 × 20 A · 8 symbolen · 1 niet opgenomen')
    // centred over the page, the button in view
    const box = await dialog.boundingBox(),
        viewport = page.viewportSize()
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2)
    await expect(page.locator('#generate-ok')).toBeInViewport()
    // quick changes: a 25 A breaker for kring A brings its cable, kring B gets a cable typed by hand
    await page.locator('#generate-amp-A').selectOption('25')
    await expect(page.locator('#generate-cable-A')).toHaveValue('XVB Cca 3G4')
    await page.locator('#generate-cable-B').fill('VOB 3G1,5 in buis')
    await expect(page.locator('#generate-summary')).toContainText('1 × 16 A · 1 × 25 A')
    await page.locator('#generate-ok').click()
    await expect(dialog).toBeHidden()
    // linked: the symbols now carry the marks of the eendraadschema and the box only counts the one without a number
    await expect(page.locator('#sit-generate-box')).toContainText('1')
    const doc = await app.save(backend)
    // the aansluiting net of this (older) project had no properties: it gets those of a new project, so its head is drawn
    expect(doc.een[0].tree[0]).toMatchObject({id: 'A', type: 'aansluiting', p: {teller: true, bescherming: 'differentieel', delta: 300}})
    const board = doc.een[0].tree[0].children.find((element) => element.type === 'bord')
    const circuits = board.children.filter((element) => element.type === 'kring')
    expect(circuits.map((circuit) => [circuit.label, circuit.p.amp, circuit.p.kabel])).toEqual([
        ['A', 25, 'XVB Cca 3G4'],
        ['B', 16, 'VOB 3G1,5 in buis'],
    ])
    const b4 = circuits[1].children[1]
    expect([b4.type, b4.children[0].type, b4.children[0].children[0].type]).toEqual(['wissel', 'wissel', 'lichtpunt'])
    expect(doc.sit[0].items.filter((item) => item.node)).toHaveLength(8)
    // the outlet without a number: Toon op het plan selects it
    await page.locator('#sit-generate').click()
    await page.locator('#generate-show-0').click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('#sit-props')).toBeVisible()
    await expect(page.locator('#status-message')).toContainText('1 symbool geselecteerd')
    // the eendraadschema draws them
    await app.tab('een')
    await expect(page.locator('.main svg.sheet').first()).toBeVisible()
    await page.screenshot({path: test.info().outputPath('eendraadschema.png')})
    // one undo: the eendraadschema and the plan as they were
    await page.locator('#btn-undo').click()
    const undone = await app.save(backend)
    expect(undone.een[0].tree[0].children.find((element) => element.type === 'bord').children).toHaveLength(0)
    expect(undone.sit[0].items.filter((item) => item.node)).toHaveLength(0)
    expect(undone.sit[0].items[0]).toMatchObject({type: 'schakelaar', mark: 'B3'})
    expect(undone.een[0].tree[0].p).toBeUndefined()
})
