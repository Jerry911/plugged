// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import {QrDialog} from '../../../features/project/QrDialog.jsx'
import SchemaPdfPage from '../../../features/project/SchemaPdfPage.jsx'
import {qrModules, qrSvgFile, schemaRequestFromSearch, schemaUrl} from '../../../features/project/schemaLink.js'
import {t} from '../../../i18n/translate.js'
import {baseProject, byId, getById} from '../../utils.jsx'

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

describe('the QR dialog', () => {
    beforeEach(() => {
        fetchQrKey.mockReset().mockResolvedValue({ok: true, key: KEY})
        renewQrKey.mockReset()
    })
    test('asks for the key, then shows the code and the link, prints and downloads', async () => {
        const print = vi.spyOn(window, 'print').mockImplementation(() => {}),
            click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        URL.createObjectURL = vi.fn(() => 'blob:x')
        URL.revokeObjectURL = vi.fn()
        const onClose = vi.fn()
        render(<QrDialog projectId={7} title="Woning" onClose={onClose} />)
        expect(byId('qr-loading')).not.toBeNull()
        expect(getById('qr-print').disabled).toBe(true)
        await waitFor(() => getById('qr-url'))
        expect(fetchQrKey).toHaveBeenCalledWith(7)
        expect(getById('qr-url').textContent).toBe(schemaUrl(7, KEY))
        expect(document.querySelectorAll('#qr-dialog svg')).toHaveLength(1)
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
    test('a project without a title is named after its number', async () => {
        render(<QrDialog projectId={7} title="" onClose={() => {}} />)
        await waitFor(() => getById('qr-url'))
        expect(document.querySelector('.qr-print b').textContent).toBe(t('projects.defaultName', {number: 7}))
    })
    test('no key, no code: the failure is shown and nothing can be printed', async () => {
        fetchQrKey.mockResolvedValue({ok: false, error: ''})
        render(<QrDialog projectId={7} title="x" onClose={() => {}} />)
        await waitFor(() => expect(getById('qr-error').textContent).toBe(t('qr.keyFailed')))
        expect(byId('qr-url')).toBeNull()
        expect(document.querySelector('.qr-print')).toBeNull()
        expect(getById('qr-print').disabled).toBe(true)
        expect(getById('qr-renew').disabled).toBe(true)
    })
    test('a new key replaces the code, after asking', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
        renewQrKey.mockResolvedValue({ok: true, key: 'Zz9_-new0123456789ABCDEFGHIJ'})
        render(<QrDialog projectId={7} title="x" onClose={() => {}} />)
        await waitFor(() => getById('qr-url'))
        fireEvent.click(getById('qr-renew'))
        expect(renewQrKey).not.toHaveBeenCalled()
        await act(async () => fireEvent.click(getById('qr-renew')))
        expect(confirm).toHaveBeenCalledTimes(2)
        expect(renewQrKey).toHaveBeenCalledWith(7)
        expect(getById('qr-url').textContent).toBe(schemaUrl(7, 'Zz9_-new0123456789ABCDEFGHIJ'))
    })
    test('a refused new key (not the owner) is reported and the old code stays', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        renewQrKey.mockResolvedValue({ok: false, status: 403, error: 'Alleen de eigenaar'})
        render(<QrDialog projectId={7} title="x" onClose={() => {}} />)
        await waitFor(() => getById('qr-url'))
        await act(async () => fireEvent.click(getById('qr-renew')))
        expect(getById('qr-error').textContent).toBe('Alleen de eigenaar')
        expect(getById('qr-url').textContent).toBe(schemaUrl(7, KEY))
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
