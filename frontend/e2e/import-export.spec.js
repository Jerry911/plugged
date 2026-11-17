// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Getting drawings in and out: PDF export, printing and the import of an Eendraadschema.be (.eds) file.
import {readFileSync} from 'node:fs'
import {strFromU8, unzipSync} from 'fflate'
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
        await app.save(backend)
        // the stored project (an automatic save of the state before the import can answer first: wait for the import itself)
        await expect.poll(async () => (await backend.saved()).sit[0].items.filter((i) => i.kind === 'sym').length).toBe(0)
        expect((await backend.saved()).sit[0].walls).toHaveLength(1)
    })
})

test.describe('all sheets as SVG or PNG (a zip file)', () => {
    const doc = () =>
        withCircuit({
            footer: {titel: 'Villa', schaal: '1:50'},
            een: [...withCircuit().een, {id: 'e2', name: 'Garage', tree: [node('A2', 'aansluiting', [node('B2', 'bord')])]}],
            sit: [
                {
                    id: 's1',
                    name: 'Gelijkvloers',
                    walls: [{id: 'w1', x1: 40, y1: 40, x2: 140, y2: 40}],
                    items: [{id: 'i1', kind: 'sym', node: 'S', x: 60, y: 60, r: 0, s: 7}],
                },
            ],
        })
    const exportAs = async (page, type) => {
        await page.locator('#tab-project').click()
        await page.locator('#btn-export').click()
        await page.locator('#export-type-' + type).check()
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-confirm').click()])
        return download
    }
    const unzipped = async (download) => unzipSync(new Uint8Array(readFileSync(await download.path())))

    test('SVG: one vector drawing per sheet, A4 landscape in mm, that a browser draws on its own', async ({page, app, backend}) => {
        await app.open(backend, doc())
        const download = await exportAs(page, 'svg')
        expect(download.suggestedFilename()).toBe('Villa-svg.zip')
        await expect(app.status()).toHaveText(t('pagesExport.done', {file: 'Villa-svg.zip'}))
        const files = await unzipped(download),
            names = Object.keys(files)
        expect(names).toEqual([
            `01 ${t('pagesExport.oneWireFile')} - Hoofd.svg`,
            `02 ${t('pagesExport.oneWireFile')} - Garage.svg`,
            `03 ${t('pagesExport.situationFile')} - Gelijkvloers.svg`,
        ])
        for (const name of names) {
            const text = strFromU8(files[name])
            expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), name).toBe(true)
            // opened on its own (without the stylesheets of Plugged): valid, its size in mm, and mostly white paper with the drawing on it
            const result = await page.evaluate(async (source) => {
                const file = new DOMParser().parseFromString(source, 'image/svg+xml')
                if (file.querySelector('parsererror')) return {error: true}
                const root = file.documentElement,
                    image = new Image()
                image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source)
                await image.decode()
                const canvas = document.createElement('canvas')
                canvas.width = 1123
                canvas.height = 794
                const context = canvas.getContext('2d')
                context.fillStyle = '#fff'
                context.fillRect(0, 0, canvas.width, canvas.height)
                context.drawImage(image, 0, 0, canvas.width, canvas.height)
                const {data} = context.getImageData(0, 0, canvas.width, canvas.height)
                let dark = 0
                for (let index = 0; index < data.length; index += 4) if (data[index] + data[index + 1] + data[index + 2] < 300) dark++
                return {width: root.getAttribute('width'), height: root.getAttribute('height'), viewBox: root.getAttribute('viewBox'), texts: root.textContent, dark: dark / (data.length / 4)}
            }, text)
            expect(result.error, name).toBeUndefined()
            expect([result.width, result.height, result.viewBox], name).toEqual(['297mm', '210mm', '0 0 297 210'])
            expect(result.dark, name).toBeGreaterThan(0.002)
            expect(result.dark, name).toBeLessThan(0.1)
        }
        // the texts of the drawing are text in the file (a vector drawing, not a picture)
        expect(strFromU8(files[names[0]])).toContain('Keuken stopcontact')
        await expect(page.locator('.export svg.sheet')).toHaveCount(0)
    })

    test('PNG: one picture per sheet, A4 landscape at 150 dpi, with the drawing on it', async ({page, app, backend}) => {
        await app.open(backend, doc())
        const download = await exportAs(page, 'png')
        expect(download.suggestedFilename()).toBe('Villa-png.zip')
        await expect(app.status()).toHaveText(t('pagesExport.done', {file: 'Villa-png.zip'}))
        const files = await unzipped(download),
            names = Object.keys(files)
        expect(names).toEqual([
            `01 ${t('pagesExport.oneWireFile')} - Hoofd.png`,
            `02 ${t('pagesExport.oneWireFile')} - Garage.png`,
            `03 ${t('pagesExport.situationFile')} - Gelijkvloers.png`,
        ])
        for (const name of names) {
            const png = files[name],
                view = new DataView(png.buffer, png.byteOffset)
            expect([...png.subarray(0, 8)], name).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            expect([view.getUint32(16), view.getUint32(20)], name).toEqual([1754, 1240])
            // drawn in the browser: there are lines and texts on it, but it is mostly white paper (no black areas where the screen has
            // transparent click areas)
            const dark = await page.evaluate(async (base64) => {
                const image = new Image()
                image.src = 'data:image/png;base64,' + base64
                await image.decode()
                const canvas = document.createElement('canvas')
                canvas.width = image.width
                canvas.height = image.height
                const context = canvas.getContext('2d')
                context.drawImage(image, 0, 0)
                const {data} = context.getImageData(0, 0, image.width, image.height)
                let count = 0
                for (let index = 0; index < data.length; index += 4) if (data[index] + data[index + 1] + data[index + 2] < 300) count++
                return count / (data.length / 4)
            }, Buffer.from(png).toString('base64'))
            expect(dark, name).toBeGreaterThan(0.002)
            expect(dark, name).toBeLessThan(0.1)
        }
        // the sheets drawn off screen for the pictures are removed again
        await expect(page.locator('.export svg.sheet')).toHaveCount(0)
    })
})
