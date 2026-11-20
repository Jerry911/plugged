// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import {QrDialog} from '../../../features/project/QrDialog.jsx'
import SchemaPdfPage from '../../../features/project/SchemaPdfPage.jsx'
import {qrModules, qrSvgFile, schemaRequestFromSearch, schemaUrl} from '../../../features/project/schemaLink.js'
import {t} from '../../../i18n/translate.js'
import {baseProject, byId, getById, node} from '../../utils.jsx'
import {setLibrary} from '../../../symbols/symbolLibrary.js'
import standard from '../../fixtures/standardSymbols.js'

const fetchPublicSchema = vi.fn(),
    fetchPublicSymbols = vi.fn(async () => []),
    save = vi.fn(),
    svg2pdf = vi.fn(async () => {})
const fetchQrKey = vi.fn(),
    renewQrKey = vi.fn()
vi.mock('../../../api/projectApi.js', () => ({fetchQrKey: (...args) => fetchQrKey(...args), renewQrKey: (...args) => renewQrKey(...args)}))
vi.mock('../../../api/publicApi.js', () => ({fetchPublicSchema: (...args) => fetchPublicSchema(...args), fetchPublicSymbols: () => fetchPublicSymbols()}))
vi.mock('jspdf', () => ({
    jsPDF: class {
        addPage() {}
        save(...args) {
            save(...args)
        }
    },
}))
vi.mock('svg2pdf.js', () => ({svg2pdf: (...args) => svg2pdf(...args)}))

const KEY = 'Ab3_-xyz0123456789ABCDEFGHIJ'

describe('the link of a QR code', () => {
    test('has the project number and the key, without any other query or hash', () => {
        expect(schemaUrl(42, KEY, new URL('https://plugged.example/app/?x=1#register'))).toBe('https://plugged.example/app/?schema=42&key=' + KEY)
    })
    test('is read back as {id, key}', () => {
        expect(schemaRequestFromSearch('?schema=42&key=' + KEY)).toEqual({id: 42, key: KEY})
    })
    test('a missing or malformed key gives an empty key; no project number gives nothing', () => {
        expect(schemaRequestFromSearch('?schema=42')).toEqual({id: 42, key: ''})
        expect(schemaRequestFromSearch('?schema=42&key=short')).toEqual({id: 42, key: ''})
        expect(schemaRequestFromSearch('?schema=42&key=' + 'a'.repeat(129))).toEqual({id: 42, key: ''})
        expect(schemaRequestFromSearch('?schema=42&key=' + KEY + '!')).toEqual({id: 42, key: ''})
        for (const search of ['', '?key=' + KEY, '?schema=', '?schema=0', '?schema=-3', '?schema=4x', '?schema=1.5', '?schema=007', '?other=5'])
            expect(schemaRequestFromSearch(search)).toBeNull()
    })
    test('the QR code has a square of modules and a standalone SVG file', () => {
        const {size, path} = qrModules('https://plugged.example/?schema=42&key=' + KEY)
        expect(size).toBeGreaterThanOrEqual(21)
        expect(path.startsWith('M')).toBe(true)
        const svg = qrSvgFile('https://plugged.example/?schema=42&key=' + KEY)
        expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
        expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`)
    })
})

describe('the link of a QR code on another address', () => {
    test('keeps the path the application is served on (a sub folder), and only that', () => {
        const at = (href) => schemaUrl(12, KEY, {href})
        expect(at('https://plugged.example.be/plugged/?schema=3&key=old#sit')).toBe('https://plugged.example.be/plugged/?schema=12&key=' + KEY)
        expect(at('http://192.168.1.20:8080/')).toBe('http://192.168.1.20:8080/?schema=12&key=' + KEY)
        expect(schemaRequestFromSearch(new URL(at('https://x.be/a/b/')).search)).toEqual({id: 12, key: KEY})
    })
    test('a project number that is not a positive whole number opens nothing', () => {
        for (const search of ['?schema=0&key=' + KEY, '?schema=-3&key=' + KEY, '?schema=1.5&key=' + KEY, '?schema=abc', '?schema=', '?schema=1234567890123456789'])
            expect(schemaRequestFromSearch(search), search).toBeNull()
    })
    test('the same link always gives the same code; another key gives another code', () => {
        expect(qrModules(schemaUrl(7, KEY)).path).toBe(qrModules(schemaUrl(7, KEY)).path)
        expect(qrModules(schemaUrl(7, KEY)).path).not.toBe(qrModules(schemaUrl(7, 'Zz9_-new0123456789ABCDEFGHIJ')).path)
    })
    test('the downloaded file is a valid SVG of 4 mm per module, quiet zone included', () => {
        const file = qrSvgFile(schemaUrl(7, KEY)),
            {size} = qrModules(schemaUrl(7, KEY)),
            parsed = new DOMParser().parseFromString(file, 'image/svg+xml')
        expect(parsed.querySelector('parsererror')).toBeNull()
        expect(parsed.documentElement.getAttribute('width')).toBe((size + 8) * 4 + 'mm')
        expect(parsed.documentElement.getAttribute('viewBox')).toBe(`0 0 ${size + 8} ${size + 8}`)
    })
})

describe('the QR dialog', () => {
    beforeEach(() => {
        fetchQrKey.mockReset().mockResolvedValue({ok: true, key: KEY})
        renewQrKey.mockReset()
    })
    test('asks for the key, then shows the code (not the link as text), prints and downloads', async () => {
        const print = vi.spyOn(window, 'print').mockImplementation(() => {}),
            click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        URL.createObjectURL = vi.fn(() => 'blob:x')
        URL.revokeObjectURL = vi.fn()
        const onClose = vi.fn()
        render(<QrDialog projectId={7} title="Woning" onClose={onClose} />)
        expect(byId('qr-loading')).not.toBeNull()
        expect(getById('qr-print').disabled).toBe(true)
        await waitFor(() => expect(getById('qr-print').disabled).toBe(false))
        expect(fetchQrKey).toHaveBeenCalledWith(7)
        expect(byId('qr-loading')).toBeNull()
        // the code holds the link of the project, but the link itself is not written on the page
        expect(document.querySelectorAll('#qr-dialog .qr-preview svg')).toHaveLength(1)
        expect(document.querySelector('#qr-dialog .qr-preview svg path').getAttribute('d')).toBe(qrModules(schemaUrl(7, KEY)).path)
        expect(document.body.textContent).not.toContain(schemaUrl(7, KEY))
        // the label that is printed: the code, the name and the number
        expect(document.querySelector('.qr-print').textContent).toContain('Woning')
        expect(document.querySelector('.qr-print').textContent).toContain(t('qr.printNumber', {number: 7}))
        fireEvent.click(getById('qr-print'))
        expect(print).toHaveBeenCalled()
        fireEvent.click(getById('qr-download'))
        expect(click).toHaveBeenCalled()
        fireEvent.keyDown(getById('qr-dialog'), {key: 'Escape'})
        fireEvent.click(getById('qr-close'))
        expect(onClose).toHaveBeenCalledTimes(2)
    })
    test('Escape closes the dialog also when the focus is not in it (opened with Alt+Q, before the key arrived)', async () => {
        const onClose = vi.fn()
        render(<QrDialog projectId={7} title="x" onClose={onClose} />)
        fireEvent.keyDown(document.body, {key: 'Escape'})
        expect(onClose).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(getById('qr-print').disabled).toBe(false))
    })
    test('a project without a title is named after its number', async () => {
        render(<QrDialog projectId={7} title="" onClose={() => {}} />)
        await waitFor(() => expect(document.querySelector('.qr-print b')).not.toBeNull())
        expect(document.querySelector('.qr-print b').textContent).toBe(t('projects.defaultName', {number: 7}))
    })
    test('no key, no code: the failure is shown and nothing can be printed', async () => {
        fetchQrKey.mockResolvedValue({ok: false, error: ''})
        render(<QrDialog projectId={7} title="x" onClose={() => {}} />)
        await waitFor(() => expect(getById('qr-error').textContent).toBe(t('qr.keyFailed')))
        expect(document.querySelector('#qr-dialog .qr-preview svg')).toBeNull()
        expect(document.querySelector('.qr-print')).toBeNull()
        expect(getById('qr-print').disabled).toBe(true)
        expect(getById('qr-renew').disabled).toBe(true)
    })
    test('the code is asked for the project of the dialog: another project, another request', async () => {
        const {rerender} = render(<QrDialog projectId={7} title="x" onClose={() => {}} />)
        await waitFor(() => expect(getById('qr-print').disabled).toBe(false))
        rerender(<QrDialog projectId={8} title="y" onClose={() => {}} />)
        await waitFor(() => expect(fetchQrKey).toHaveBeenCalledWith(8))
        await waitFor(() => expect(document.querySelector('#qr-dialog .qr-preview svg path').getAttribute('d')).toBe(qrModules(schemaUrl(8, KEY)).path))
    })
    test('the download is an SVG file named after the project number', async () => {
        let downloaded
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
            downloaded = this.download
        })
        URL.createObjectURL = vi.fn(() => 'blob:x')
        URL.revokeObjectURL = vi.fn()
        render(<QrDialog projectId={42} title="x" onClose={() => {}} />)
        await waitFor(() => expect(getById('qr-download').disabled).toBe(false))
        fireEvent.click(getById('qr-download'))
        expect(downloaded).toBe('qr-42.svg')
        expect(URL.createObjectURL.mock.calls[0][0].type).toBe('image/svg+xml')
    })
    test('a refused new key (not the owner) keeps the old code and says why', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        renewQrKey.mockResolvedValue({ok: false, error: 'Alleen de eigenaar'})
        render(<QrDialog projectId={7} title="x" onClose={() => {}} />)
        await waitFor(() => expect(getById('qr-renew').disabled).toBe(false))
        const before = document.querySelector('#qr-dialog .qr-preview svg path').getAttribute('d')
        await act(async () => fireEvent.click(getById('qr-renew')))
        expect(getById('qr-error').textContent).toBe('Alleen de eigenaar')
        expect(document.querySelector('#qr-dialog .qr-preview svg path').getAttribute('d')).toBe(before)
        expect(getById('qr-renew').disabled).toBe(false)
    })
    test('a new key replaces the code, after asking', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
        renewQrKey.mockResolvedValue({ok: true, key: 'Zz9_-new0123456789ABCDEFGHIJ'})
        render(<QrDialog projectId={7} title="x" onClose={() => {}} />)
        await waitFor(() => expect(getById('qr-renew').disabled).toBe(false))
        const before = document.querySelector('#qr-dialog .qr-preview svg path').getAttribute('d')
        fireEvent.click(getById('qr-renew'))
        expect(renewQrKey).not.toHaveBeenCalled()
        await act(async () => fireEvent.click(getById('qr-renew')))
        expect(confirm).toHaveBeenCalledTimes(2)
        expect(renewQrKey).toHaveBeenCalledWith(7)
        const after = document.querySelector('#qr-dialog .qr-preview svg path').getAttribute('d')
        expect(after).toBe(qrModules(schemaUrl(7, 'Zz9_-new0123456789ABCDEFGHIJ')).path)
        expect(after).not.toBe(before)
    })
})

describe('the page a QR code opens', () => {
    beforeEach(() => {
        fetchPublicSchema.mockReset()
        save.mockClear()
        svg2pdf.mockClear()
    })
    test('shows the newest saved sheets and builds the PDF on demand', async () => {
        fetchPublicSchema.mockResolvedValue(baseProject())
        render(<SchemaPdfPage id={7} secret={KEY} />)
        expect(byId('schema-loading')).not.toBeNull()
        await waitFor(() => expect(byId('schema-title')).not.toBeNull())
        expect(fetchPublicSchema).toHaveBeenCalledWith(7, KEY)
        expect(getById('schema-title').textContent).toBe('T')
        expect(document.title).toBe('T')
        expect(document.querySelectorAll('svg.sheet').length).toBeGreaterThan(0)
        await act(async () => fireEvent.click(getById('schema-pdf')))
        expect(svg2pdf).toHaveBeenCalledTimes(document.querySelectorAll('svg.sheet').length)
        expect(save).toHaveBeenCalledWith('T.pdf')
    })
    test('an own symbol of the owner is drawn from the copy the project carries, not as a question mark', async () => {
        // whoever scans gets the standard symbols from the server, none of the owner's own
        fetchPublicSymbols.mockResolvedValueOnce(standard)
        const doc = {
            ...baseProject(),
            een: [{id: 'e1', name: 'Blad 1', tree: [node('M', 'aansluiting', [node('B', 'bord', [node('K', 'kring', [node('K1', 'custom:qrtest')])])])]}],
            symbols: [{k: 'custom:qrtest', name: 'Eigen lamp', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'circle', cx: 12, cy: 12, r: 7.25}]}],
        }
        fetchPublicSchema.mockResolvedValue(doc)
        render(<SchemaPdfPage id={7} secret={KEY} />)
        await waitFor(() => getById('schema-title'))
        expect([...document.querySelectorAll('svg.sheet circle')].some((circle) => circle.getAttribute('r') === '7.25')).toBe(true)
        setLibrary(standard)
    })
    test('the project is only read: the page never saves or changes it', async () => {
        const doc = baseProject(),
            before = JSON.stringify(doc)
        fetchPublicSchema.mockResolvedValue(doc)
        render(<SchemaPdfPage id={7} secret={KEY} />)
        await waitFor(() => getById('schema-title'))
        await act(async () => fireEvent.click(getById('schema-pdf')))
        expect(JSON.stringify(doc)).toBe(before)
        expect(fetchQrKey).not.toHaveBeenCalled()
    })
    test('without a title the page is named after the project number', async () => {
        fetchPublicSchema.mockResolvedValue({...baseProject(), footer: {}})
        render(<SchemaPdfPage id={7} secret={KEY} />)
        await waitFor(() => getById('schema-title'))
        expect(getById('schema-title').textContent).toBe(t('projects.defaultName', {number: 7}))
        expect(byId('schema-editor')).not.toBeNull()
    })
    test('a failing PDF is reported', async () => {
        fetchPublicSchema.mockResolvedValue(baseProject())
        svg2pdf.mockRejectedValueOnce(new Error('boom'))
        render(<SchemaPdfPage id={7} secret={KEY} />)
        await waitFor(() => getById('schema-pdf'))
        await act(async () => fireEvent.click(getById('schema-pdf')))
        expect(getById('schema-failed').textContent).toBe(t('app.exportFailed', {reason: 'boom'}))
    })
    test('prints the sheets', async () => {
        const print = vi.spyOn(window, 'print').mockImplementation(() => {})
        fetchPublicSchema.mockResolvedValue(baseProject())
        render(<SchemaPdfPage id={7} secret={KEY} />)
        await waitFor(() => getById('schema-print'))
        fireEvent.click(getById('schema-print'))
        expect(print).toHaveBeenCalled()
    })
    test('a project that does not exist says so', async () => {
        fetchPublicSchema.mockResolvedValue(null)
        render(<SchemaPdfPage id={9} secret={KEY} />)
        await waitFor(() => expect(byId('schema-notfound').textContent).toBe(t('schema.notfound', {number: 9})))
    })
    test('an unreachable server can be tried again', async () => {
        fetchPublicSchema.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(baseProject())
        render(<SchemaPdfPage id={7} secret={KEY} />)
        await waitFor(() => getById('schema-error'))
        fireEvent.click(getById('schema-retry'))
        await waitFor(() => getById('schema-title'))
    })
})

describe('the public API', () => {
    afterEach(() => vi.unstubAllGlobals())
    test('the schema: the document, null for 404, an error for anything else', async () => {
        const {fetchPublicSchema: realSchema} = await vi.importActual('../../../api/publicApi.js')
        const answer = (status, body) => vi.fn(async () => ({status, ok: status < 400, json: async () => body}))
        vi.stubGlobal('fetch', answer(200, {een: []}))
        expect(await realSchema(7, KEY)).toEqual({een: []})
        expect(fetch.mock.calls[0][0]).toBe('/api/public/schemas/7')
        expect(fetch.mock.calls[0][1].headers['X-Schema-Key']).toBe(KEY)
        await realSchema(7, '')
        expect(fetch.mock.calls[1][1].headers['X-Schema-Key']).toBeUndefined() // no key: the server says there is no such schema
        vi.stubGlobal('fetch', answer(404, {}))
        expect(await realSchema(7, KEY)).toBeNull()
        vi.stubGlobal('fetch', answer(500, {}))
        await expect(realSchema(7, KEY)).rejects.toThrow()
    })
    test('the symbols: a list, an error when it cannot be loaded', async () => {
        const {fetchPublicSymbols: realSymbols} = await vi.importActual('../../../api/publicApi.js')
        vi.stubGlobal('fetch', vi.fn(async () => ({status: 200, ok: true, json: async () => [{k: 'a'}]})))
        expect(await realSymbols()).toEqual([{k: 'a'}])
        vi.stubGlobal('fetch', vi.fn(async () => ({status: 200, ok: true, json: async () => ({})})))
        expect(await realSymbols()).toEqual([])
        vi.stubGlobal('fetch', vi.fn(async () => ({status: 503, ok: false})))
        await expect(realSymbols()).rejects.toThrow()
    })
})

describe('the application opened from a QR code', () => {
    afterEach(() => {
        window.history.replaceState(null, '', '/')
        vi.unstubAllGlobals()
    })
    test('shows the schema without asking who is signed in', async () => {
        const {default: App} = await import('../../../app/App.jsx')
        const calls = vi.fn(async () => ({status: 401, ok: false}))
        vi.stubGlobal('fetch', calls)
        fetchPublicSchema.mockResolvedValue(baseProject())
        window.history.replaceState(null, '', '/?schema=7&key=' + KEY)
        render(<App />)
        await waitFor(() => getById('schema-title'))
        expect(fetchPublicSchema).toHaveBeenCalledWith(7, KEY)
        expect(calls).not.toHaveBeenCalled() // no /api/auth/status, no sign-in screen
        expect(byId('top-bar')).toBeNull()
    })
})
