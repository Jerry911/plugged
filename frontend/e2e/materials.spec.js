// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Project → Materiaallijst (the bill of materials, downloaded as Excel and CSV) and the measurements for the inspection in Kaderinfo.
import {readFileSync} from 'node:fs'
import {test, expect, t} from './fixtures.js'
import {withCircuit} from './data.js'

test('the bill of materials counts the eendraadschema and downloads as Excel and CSV', async ({page, app, backend}) => {
    await app.open(backend, withCircuit({name: 'Woning Jan'}))
    await page.locator('#tab-project').click()
    await page.locator('#btn-materials').click()
    const dialog = page.locator('#materials-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.locator('#materials-protection')).toContainText(t('materials.kinds.automatisch') + ' B16')
    await expect(page.locator('#materials-outlets')).toContainText('1')
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.locator('#materials-xlsx').click()])
    expect(xlsx.suggestedFilename()).toBe(t('materials.fileName') + '-Woning-Jan.xlsx')
    // an xlsx is a zip
    expect(readFileSync(await xlsx.path()).subarray(0, 2).toString()).toBe('PK')
    const [csv] = await Promise.all([page.waitForEvent('download'), page.locator('#materials-csv').click()])
    expect(csv.suggestedFilename()).toBe(t('materials.fileName') + '-Woning-Jan.csv')
    expect(readFileSync(await csv.path(), 'utf8')).toContain(t('materials.kinds.automatisch') + ' B16;1;K')
    await page.locator('#materials-close').click()
    await expect(dialog).toHaveCount(0)
})

test('the measurements are always in the title block, to fill in by hand or in Kaderinfo', async ({page, app, backend}) => {
    await app.open(backend, withCircuit())
    const sheet = page.locator('svg.sheet').first()
    // nothing measured yet: three dotted lines to write on
    await expect(sheet.locator('.sheet-measurement-blank')).toHaveCount(3)
    await page.locator('#btn-footer').click()
    await page.locator('#footer-aardingsweerstand').fill('45')
    await page.locator('#footer-isolatieweerstand').fill('250')
    await page.locator('#footer-meetdatum').fill('13/11/2026')
    await page.locator('#footer-aardingsweerstand').press('Escape')
    await expect(sheet.locator('.sheet-measurement-value')).toHaveText(['45', '250', '13/11/2026'])
    await expect(sheet.locator('.sheet-measurement-blank')).toHaveCount(0)
    const saved = await app.save(backend)
    expect(saved.footer).toMatchObject({aardingsweerstand: '45', isolatieweerstand: '250', meetdatum: '13/11/2026'})
})
