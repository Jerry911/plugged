// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Getting drawings in and out: PDF export, printing and the import of an Eendraadschema.be (.eds) file.
import {readFileSync} from 'node:fs'
import {test, expect, t} from './fixtures.js'
import {edsFile, node, project, withCircuit} from './data.js'

const pages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length

// PDF and Afdrukken are in the Project menu
const pdfButton = (page) => ({click: async () => (await page.locator('#tab-project').click(), await page.locator('#btn-pdf').click())})

test.describe('PDF and printing', () => {
    test('Project → PDF downloaden downloads a PDF named after the project with one page per sheet', async ({page, app, backend}) => {
        const doc = withCircuit({
            footer: {titel: 'Villa', schaal: '1:50'},
            een: [...withCircuit().een, {id: 'e2', name: 'Tweede', tree: [node('A2', 'aansluiting', [node('B2', 'bord')])]}],
        })
        await app.open(backend, doc)
        const [download] = await Promise.all([page.waitForEvent('download'), pdfButton(page).click()])
        expect(download.suggestedFilename()).toBe('Villa.pdf')
        const pdf = readFileSync(await download.path())
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
        expect(pages(pdf)).toBe(3) // 2 eendraadschema sheets + 1 plattegrond
        // the temporary export sheets are removed again
        await expect(page.locator('.export svg.sheet')).toHaveCount(0)
    })
    test('without a title the file is called schema.pdf', async ({page, app, backend}) => {
        await app.open(backend, project({footer: {}}))
        const [download] = await Promise.all([page.waitForEvent('download'), pdfButton(page).click()])
        expect(download.suggestedFilename()).toBe('schema.pdf')
    })
    test('a wide board is exported on several pages', async ({page, app, backend}) => {
        const ks = Array.from({length: 16}, (_, i) => node('K' + i, 'kring', [node('S' + i, 'stopcontact')], {label: String.fromCharCode(65 + i), info: 'B16 2,5mm²'}))
        await app.open(backend, project({footer: {titel: 'Groot'}, een: [{id: 'e1', name: 'Groot', tree: [node('A', 'aansluiting', [node('B', 'bord', ks)])]}]}))
        const [download] = await Promise.all([page.waitForEvent('download'), pdfButton(page).click()])
        expect(pages(readFileSync(await download.path()))).toBe(3) // 2 sheets for the board + 1 plattegrond
    })
    test('Afdrukken opens the print dialog of the browser', async ({page, app, backend}) => {
        await page.addInitScript(() => {
            window.__prints = 0
            window.print = () => void window.__prints++
        })
        await app.open(backend, withCircuit())
        await page.locator('#tab-project').click()
        await page.locator('#btn-print').click()
        await expect.poll(() => page.evaluate(() => window.__prints)).toBe(1)
        await expect(page.locator('.export svg.sheet')).toHaveCount(0)
    })
    test('the screen-only controls are hidden when printing', async ({page, app, backend}) => {
        await app.open(backend, withCircuit())
        await page.emulateMedia({media: 'print'})
        await expect(page.locator('.bar.ui')).toBeHidden()
        await expect(page.locator('#tab-project')).toBeHidden()
        await expect(page.locator('#eds-tree')).toBeHidden()
        await page.emulateMedia({media: 'screen'})
        await expect(page.locator('#tab-project')).toBeVisible()
    })
})

test.describe('importing an .eds file', () => {
    const eds = (page, content, name = 'huis.eds') => page.locator('#import-input').setInputFiles({name, mimeType: 'application/octet-stream', buffer: Buffer.from(content)})
    test('replaces the schema and the footer, reports what was imported, and can be undone', async ({page, app, backend}) => {
        await app.open(backend)
        await eds(page, edsFile())
        await expect(app.status()).toHaveText(t('app.edsImported', {circuits: 1, nodes: 5}) + ' ' + t('app.edsUnknown', {types: 'Rare'}))
        await expect(page.locator('#eds-tree')).toContainText('Keuken')
        await expect(page.locator('svg.sheet').first()).toContainText('Dorpstraat 1, 9000 Gent')
        const saved = await app.save(backend)
        expect(saved.een[0].tree[0].children[0].children[0].info).toContain('16')
        await page.locator('#btn-undo').click()
        await expect(page.locator('#eds-tree')).not.toContainText('Keuken')
    })
    test('without unknown elements nothing is listed as unknown', async ({page, app, backend}) => {
        await app.open(backend)
        await eds(page, edsFile({unknown: false}))
        await expect(app.status()).toHaveText(new RegExp('^' + t('app.edsImported', {circuits: 1, nodes: 'NODES'}).replace('NODES', '\\d+') + '$'))
    })
    test('an invalid file is refused with a message', async ({page, app, backend, dialogs}) => {
        await app.open(backend)
        await eds(page, 'dit is geen eds bestand')
        await expect.poll(() => dialogs.messages.at(-1)).toBe(t('eds.notAnEdsFile'))
        await expect(page.locator('#eds-tree')).toContainText(t('board.connectionLabel')) // the schema is untouched
    })
    test('the plattegrond keeps its walls but loses symbols that pointed to replaced elements', async ({page, app, backend}) => {
        const doc = withCircuit({sit: [{id: 's1', name: 'P', walls: [{id: 'w', x1: 20, y1: 20, x2: 100, y2: 20}], items: [{id: 'i', kind: 'sym', node: 'S', x: 50, y: 50, r: 0, s: 7}, {id: 'd', kind: 'door', x: 60, y: 20, r: 0}]}]})
        await app.open(backend, doc)
        await eds(page, edsFile())
        await expect(page.locator('#status-message', {hasText: t('app.edsImported', {circuits: 1, nodes: 5}).split(':')[0]})).toBeVisible()
        const saved = await app.save(backend)
        expect(saved.sit[0].walls).toHaveLength(1)
        expect(saved.sit[0].items.filter((i) => i.kind === 'sym')).toHaveLength(0)
    })
})
