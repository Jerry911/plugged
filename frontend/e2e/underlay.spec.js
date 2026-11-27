// The plan behind a page of the situatieschema in the browser: a real PDF (read with pdf.js, in its worker) and a real picture become the
// small JPEG that is kept, the scale is set with two points, and the plan is printed in the PDF of the schema.
import {readFileSync} from 'node:fs'
import {deflateSync} from 'node:zlib'
import {jsPDF} from 'jspdf'
import {test, expect, t} from './fixtures.js'
import {project} from './data.js'

// a PDF of two A4 pages (landscape) with a few lines on each
const pdfFile = () => {
    const pdf = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'})
    pdf.rect(20, 20, 200, 120)
    pdf.line(20, 80, 220, 80)
    pdf.text('Gelijkvloers', 30, 30)
    pdf.addPage()
    pdf.rect(40, 40, 100, 100)
    return {name: 'architect.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf.output('arraybuffer'))}
}

// a PNG of 400 x 200 pixels: grey with a black frame
const pngFile = () => {
    const width = 400,
        height = 200,
        rows = []
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(1 + width * 3, 0xcc)
        row[0] = 0
        for (let x = 0; x < width; x++) if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4) row.fill(0, 1 + x * 3, 4 + x * 3)
        rows.push(row)
    }
    const chunk = (type, data) => {
        const length = Buffer.alloc(4),
            body = Buffer.concat([Buffer.from(type), data]),
            crc = Buffer.alloc(4)
        length.writeUInt32BE(data.length)
        crc.writeUInt32BE(crc32(body))
        return Buffer.concat([length, body, crc])
    }
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header[8] = 8
    header[9] = 2
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
    return {name: 'schets.png', mimeType: 'image/png', buffer: png}
}
const crc32 = (buffer) => {
    let crc = ~0
    for (const byte of buffer) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
    return ~crc >>> 0
}

test('a PDF page and a picture as the plan behind the page, set to scale and printed', async ({page, app, backend, dialogs}) => {
    await app.open(backend, project())
    await app.tab('sit')
    // a PDF of two pages: the second page is asked for
    dialogs.answers.push('2', '4')
    await page.locator('#sit-underlay-file').setInputFiles(pdfFile())
    const image = page.locator('#sit-underlay')
    await expect(image).toBeVisible({timeout: 20000})
    expect(await image.getAttribute('href')).toMatch(/^data:image\/jpeg;base64,/)
    // an A4 page in landscape fills the height of the drawing area
    expect(Number(await image.getAttribute('height'))).toBeCloseTo(170, 0)
    await expect(app.status()).toHaveText(t('underlay.added'))
    // the scale: two points 40 mm apart, really 4 m (the project is drawn at 1:50: 80 mm), so the plan doubles
    const width = Number(await image.getAttribute('width'))
    await page.locator('#sit-rail-measure').click()
    await page.locator('#sit-underlay-scale').click()
    await app.clickSheet(60, 60)
    await app.clickSheet(100, 60)
    await expect(app.status()).toHaveText(t('underlay.scaled'))
    expect(Number(await image.getAttribute('width'))).toBeCloseTo(width * 2, 0)

    // another plan: a picture; it keeps the opacity that was set
    await page.locator('#sit-rail-underlay').click()
    await page.locator('#sit-underlay-opacity').fill('0.8')
    await page.keyboard.press('Escape')
    await page.locator('#sit-underlay-file').setInputFiles(pngFile())
    await expect(image).toHaveAttribute('width', '277')
    await expect(image).toHaveAttribute('height', '138.5')
    await expect(image).toHaveAttribute('opacity', '0.8')
    // saved with the project, small enough
    await page.keyboard.press('Alt+s')
    await expect.poll(async () => (await backend.stored(backend.id(1)))?.sit?.[0]?.underlay?.src?.length || 0).toBeGreaterThan(100)
    expect((await backend.stored(backend.id(1))).sit[0].underlay.src.length).toBeLessThan(800 * 1024 * 1.4)

    // in the PDF of the schema the plan is an image (a JPEG: /DCTDecode); switched off for printing, it is not
    const pdfOf = async () => {
        await page.locator('#tab-project').click()
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-pdf').click()])
        return readFileSync(await download.path()).toString('latin1')
    }
    expect(await pdfOf()).toMatch(/\/DCTDecode/)
    await app.tab('sit')
    await page.locator('#sit-rail-underlay').click()
    await page.locator('#sit-underlay-print').uncheck()
    expect(await pdfOf()).not.toMatch(/\/DCTDecode/)
})
