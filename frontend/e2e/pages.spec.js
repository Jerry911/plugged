// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Managing the sheets ("bladen") of the eendraadschema and the plattegronden of the situatieschema: add, rename, copy, move, delete.
import {test, expect, t} from './fixtures.js'
import {project, withCircuit} from './data.js'

// The bar above the eendraadschema (ids eds-page-...) or the situatieschema (sit-page-...): whichever is shown.
const BUTTONS = {add: 'add', rename: 'rename', copy: 'duplicate', left: 'earlier', right: 'later', del: 'delete'}
const prefix = async (page) => ((await page.locator('#eds-pagebar').count()) ? 'eds-page' : 'sit-page')
const btn = (page, k) => page.locator(`#eds-page-${BUTTONS[k]}, #sit-page-${BUTTONS[k]}`)
// the names of the pages: the page buttons are numbered eds-page-1, eds-page-2, ...
const names = async (page) => {
    const bar = await prefix(page)
    return (await page.locator(`[id^="${bar}-"]`).evaluateAll((buttons, bar) => buttons.filter((b) => new RegExp('^' + bar + '-\\d+$').test(b.id)).map((b) => b.textContent.trim()), bar))
}

// the default names of the sheets with these numbers, in the order given
const sheetNames = (...numbers) => numbers.map((number) => t('pages.sheetName', {number}))

test.describe('eendraadschema sheets', () => {
    test('a new sheet is empty apart from a default board, becomes the current sheet and is saved', async ({page, app, backend}) => {
        await app.open(backend)
        await btn(page, 'add').click()
        expect(await names(page)).toEqual([t('pages.sheetName', {number: 1}), t('pages.sheetName', {number: 2})])
        await expect(page.locator('#eds-page-2')).toHaveClass(/on/)
        const saved = await app.save(backend)
        expect(saved.een[1].tree[0].type).toBe('aansluiting')
        expect(saved.een[1].tree[0].children[0].type).toBe('bord')
    })
    test('a sheet can be renamed; cancelling the prompt keeps the name', async ({page, app, backend, dialogs}) => {
        await app.open(backend, withCircuit())
        dialogs.answers.push('Garage')
        await btn(page, 'rename').click()
        expect(await names(page)).toEqual(['Garage'])
        dialogs.answers.push(null)
        await btn(page, 'rename').click()
        expect(await names(page)).toEqual(['Garage'])
    })
    test('copying a sheet copies its whole content under new ids', async ({page, app, backend}) => {
        await app.open(backend, withCircuit())
        await btn(page, 'copy').click()
        expect(await names(page)).toEqual(['Hoofd', t('common.copyOf', {name: 'Hoofd'})])
        await expect(page.locator('#eds-page-2')).toHaveClass(/on/)
        await expect(page.locator('#eds-tree')).toContainText('Keuken stopcontact')
        const saved = await app.save(backend),
            ids = (nodes) => nodes.flatMap((node) => [node.id, ...ids(node.children)])
        expect(saved.een).toHaveLength(2)
        expect(saved.een[1].tree[0].children[0].children[0].children.map((n) => n.label)).toEqual(['Keuken stopcontact', 'Gang licht'])
        const originalIds = ids(saved.een[0].tree),
            copyIds = ids(saved.een[1].tree)
        expect(copyIds).toHaveLength(originalIds.length)
        expect(copyIds.filter((id) => originalIds.includes(id))).toEqual([])
    })
    test('sheets move left and right (the buttons are disabled at the ends)', async ({page, app, backend}) => {
        await app.open(backend)
        await btn(page, 'add').click()
        await btn(page, 'add').click()
        await expect(btn(page, 'right')).toBeDisabled()
        await btn(page, 'left').click()
        expect(await names(page)).toEqual(sheetNames(1, 3, 2))
        await btn(page, 'left').click()
        await expect(btn(page, 'left')).toBeDisabled()
        expect(await names(page)).toEqual(sheetNames(3, 1, 2))
        await btn(page, 'right').click()
        expect(await names(page)).toEqual(sheetNames(1, 3, 2))
    })
    test('a sheet can be deleted, the last one cannot', async ({page, app, backend}) => {
        await app.open(backend)
        await expect(btn(page, 'del')).toBeDisabled()
        await btn(page, 'add').click()
        await btn(page, 'del').click()
        expect(await names(page)).toEqual([t('pages.sheetName', {number: 1})])
        await expect(btn(page, 'del')).toBeDisabled()
    })
    test('every sheet has its own content', async ({page, app, backend}) => {
        await app.open(backend, withCircuit())
        await btn(page, 'add').click()
        await expect(page.locator('#eds-tree')).not.toContainText('Keuken stopcontact')
        await page.locator('#eds-page-1').click()
        await expect(page.locator('#eds-tree')).toContainText('Keuken stopcontact')
    })
})

test.describe('situatieschema sheets', () => {
    const plan = () =>
        project({
            sit: [
                {
                    id: 's1',
                    name: 'Gelijkvloers',
                    walls: [
                        {id: 'w1', x1: 20, y1: 20, x2: 120, y2: 20},
                        {id: 'w2', x1: 120, y1: 20, x2: 120, y2: 100},
                    ],
                    items: [{id: 'i1', kind: 'door', x: 60, y: 20, r: 0}, {id: 'i2', kind: 'text', x: 50, y: 60, txt: 'Living', s: 4, r: 0}],
                },
            ],
        })
    test('a new plattegrond is empty and numbered', async ({page, app, backend}) => {
        await app.open(backend)
        await app.tab('sit')
        await btn(page, 'add').click()
        expect(await names(page)).toEqual([t('pages.planName', {number: 1}), t('pages.planName', {number: 2})])
        const saved = await app.save(backend)
        expect(saved.sit[1]).toMatchObject({name: t('pages.planName', {number: 2}), walls: [], items: []})
    })
    test('copying a plattegrond copies its walls, doors and texts under new ids', async ({page, app, backend}) => {
        await app.open(backend, plan())
        await app.tab('sit')
        await btn(page, 'copy').click()
        expect(await names(page)).toEqual(['Gelijkvloers', t('common.copyOf', {name: 'Gelijkvloers'})])
        await expect(page.locator('svg.sheet')).toContainText('Living')
        const saved = await app.save(backend)
        expect(saved.sit).toHaveLength(2)
        expect(saved.sit[1].walls.map(({id, ...w}) => w)).toEqual(saved.sit[0].walls.map(({id, ...w}) => w))
        expect(saved.sit[1].items.map(({id, ...i}) => i)).toEqual(saved.sit[0].items.map(({id, ...i}) => i))
        const ids = [...saved.sit[0].walls, ...saved.sit[0].items, ...saved.sit[1].walls, ...saved.sit[1].items].map((element) => element.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
    test('changes to the copy do not touch the original', async ({page, app, backend}) => {
        await app.open(backend, plan())
        await app.tab('sit')
        await btn(page, 'copy').click()
        await page.locator('#sit-tool-erase').click()
        await app.clickSheet(100, 20) // on the wall of the copy, away from the door
        const saved = await app.save(backend)
        expect(saved.sit[0].walls).toHaveLength(2)
        expect(saved.sit[1].walls).toHaveLength(1)
        expect(saved.sit[1].items).toHaveLength(2)
    })
    test('rename, move and delete work like on the eendraadschema', async ({page, app, backend, dialogs}) => {
        await app.open(backend, plan())
        await app.tab('sit')
        await btn(page, 'add').click()
        dialogs.answers.push('Zolder')
        await btn(page, 'rename').click()
        expect(await names(page)).toEqual(['Gelijkvloers', 'Zolder'])
        await btn(page, 'left').click()
        expect(await names(page)).toEqual(['Zolder', 'Gelijkvloers'])
        await btn(page, 'del').click()
        expect(await names(page)).toEqual(['Gelijkvloers'])
    })
})
