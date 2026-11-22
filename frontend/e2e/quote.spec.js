// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The offerte: a price list under Account › Prijzen, symbols combined in one cover frame on the situatieschema, and Project › Offerte.
import {test, expect, t} from './fixtures.js'

const node = (id, type, children = [], extra = {}) => ({id, type, label: '', info: '', children, ...extra})
const project = () => ({
    name: 'Offerte e2e',
    footer: {schaal: '1:50', eigenaar: 'Testa Voorbeeldenaar', straat: 'Kerkstraat', nr: '1', postcode: '9000', gemeente: 'Gent'},
    een: [
        {
            id: 'e1',
            name: 'Blad 1',
            tree: [
                node('bord', 'bord', [
                    node('A', 'kring', [node('s1', 'stopcontact_pekid', [], {label: 'Keuken 1'}), node('s2', 'stopcontact_pekid', [], {label: 'Keuken 2'})], {
                        label: 'A',
                        p: {polen: '2', amp: '20', curve: 'B', kabel: 'XVB 3G2,5', bescherming: 'automatisch', lengte: '12'},
                    }),
                ]),
            ],
        },
    ],
    sit: [
        {
            id: 'p1',
            name: 'Plan 1',
            walls: [],
            items: [
                {id: 'i1', kind: 'sym', type: 'stopcontact_pekid', node: 's1', x: 100, y: 80, r: 0, s: 7},
                {id: 'i2', kind: 'sym', type: 'stopcontact_pekid', node: 's2', x: 140, y: 80, r: 0, s: 7},
            ],
        },
    ],
})

test('a price list, two sockets in one vertical frame, and the offerte of the project', async ({page, app, backend}) => {
    await app.open(backend, project())
    // the price list: the standard one, with a price for the socket and an hourly rate
    await app.tab('account')
    await page.locator('#account-tab-prices').click()
    await page.locator('#pricing-new').click()
    await expect(page.locator('#article-socket')).toBeVisible()
    await page.locator('#article-socket input.price').fill('4,50')
    await page.locator('#article-frame2v input.price').fill('7')
    await page.locator('#pricing-tab-labour').click()
    await page.locator('#pricing-hourly').fill('50')
    await page.locator('#pricing-save').click()
    await expect(page.locator('#pricing-status')).toHaveText(t('pricing.saved'))

    // the two sockets share one frame, mounted vertically
    await page.locator('#tab-sit').click()
    await page.locator('#sit-tool-select').click()
    const sheet = page.locator('svg.sheet').first()
    const box = await sheet.boundingBox()
    // a selection box over both symbols
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.48, {steps: 5})
    await page.mouse.up()
    await expect(page.locator('#multi-combine')).toBeVisible()
    await page.locator('#multi-combine').click()
    await page.locator('#multi-mount').selectOption('v')

    // the offerte
    await app.tab('project')
    await page.locator('#btn-quote').click()
    await expect(page.locator('#quote-client')).toHaveValue('Testa Voorbeeldenaar')
    await expect(page.locator('#quote-lines')).toContainText(t('pricing.standard.frame2v'))
    await expect(page.locator('#quote-lines')).not.toContainText(t('pricing.standard.frame1'))
    await expect(page.locator('#quote-problems')).toBeVisible()
    await page.locator('#quote-vat').selectOption('6')
    await expect(page.locator('#quote-vat-amount').locator('xpath=preceding-sibling::td')).toHaveText(t('quote.vatOf', {rate: 6}))
    const pdf = page.waitForEvent('download')
    await page.locator('#quote-pdf').click()
    expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/)
    const xlsx = page.waitForEvent('download')
    await page.locator('#quote-xlsx').click()
    expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/)
    // the details of the offerte are kept in the project
    await page.locator('#quote-close').click()
    const stored = await app.save(backend)
    expect(stored.quote).toMatchObject({vat: 6, client: 'Testa Voorbeeldenaar'})
    expect(stored.sit[0].items.map((item) => item.dir)).toEqual(['v', 'v'])
})
