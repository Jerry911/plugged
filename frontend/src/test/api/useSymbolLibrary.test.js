// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, renderHook, waitFor} from '@testing-library/react'
import {useSymbolLibrary} from '../../api/useSymbolLibrary.js'
import standard from '../fixtures/standardSymbols.js'

const mine = {k: 'custom:b', name: 'Beta', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 5, y2: 12}], v: 0, builtin: false, modified: false}
const json = (body, ok = true) => ({ok, json: async () => body})
// a fake backend: serves the library, echoes saved symbols and answers restore / delete / template
const backend = ({list = standard} = {}) => {
    global.fetch = vi.fn(async (url, o = {}) => {
        const m = o.method || 'GET'
        if (url === '/api/symbols' && m === 'GET') return json(list)
        if (url === '/api/symbols/restore') return json(standard)
        if (url === '/api/symbols/template') return json({k: 'custom:nieuw', name: '', parents: ['kring'], shapes: []})
        if (url.endsWith('/restore')) return json(standard.find((c) => c.k === decodeURIComponent(url.split('/')[3])))
        if (url.startsWith('/api/symbols/') && m === 'PUT') return json({...JSON.parse(o.body), builtin: false, modified: false, v: 0})
        if (url.startsWith('/api/symbols/') && m === 'DELETE') return {ok: true}
        return {ok: false}
    })
}
const load = async () => {
    const h = renderHook(() => useSymbolLibrary())
    await waitFor(() => expect(h.result.current.status).not.toBe('loading'))
    return h
}

test('useSymbolLibrary loads the symbols of the backend', async () => {
    backend()
    const {result} = renderHook(() => useSymbolLibrary())
    expect(result.current).toMatchObject({status: 'loading', library: []})
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.library).toEqual(standard)
    expect(global.fetch).toHaveBeenCalledWith('/api/symbols', {headers: {'Accept-Language': 'nl'}})
})
test('useSymbolLibrary reports an error without a backend or with an unexpected answer, and can try again', async () => {
    for (const get of [async () => ({ok: false}), async () => Promise.reject(new Error('down')), async () => json({not: 'a list'}), async () => ({ok: true, json: async () => Promise.reject(new Error('bad json'))})]) {
        global.fetch = vi.fn(get)
        const {result, unmount} = await load()
        expect(result.current.status).toBe('error')
        expect(result.current.library).toEqual([])
        backend()
        await act(async () => result.current.reload())
        expect(result.current.status).toBe('ready')
        unmount()
    }
})
test('save sends the symbol, takes over what the backend answers and reports a refusal', async () => {
    backend()
    const {result} = await load()
    let s
    await act(async () => void (s = await result.current.save(mine)))
    expect(s).toMatchObject({k: 'custom:b', builtin: false})
    expect(result.current.library.at(-1)).toEqual(s)
    expect(global.fetch).toHaveBeenCalledWith('/api/symbols/custom%3Ab', expect.objectContaining({method: 'PUT', body: JSON.stringify(mine)}))
    await act(async () => void (await result.current.save({...mine, name: 'Beta 2'})))
    expect(result.current.library.filter((c) => c.k === mine.k)).toHaveLength(1)
    expect(result.current.library.at(-1).name).toBe('Beta 2')
    const before = result.current.library
    global.fetch = vi.fn(async () => ({ok: false}))
    await act(async () => void (s = await result.current.save(mine)))
    expect(s).toBeNull()
    global.fetch = vi.fn(async () => Promise.reject(new Error('down')))
    await act(async () => void (s = await result.current.save(mine)))
    expect(s).toBeNull()
    expect(result.current.library).toBe(before)
})
test('remove only drops the symbol when the backend deleted it', async () => {
    backend()
    const {result} = await load()
    await act(async () => void (await result.current.save(mine)))
    global.fetch = vi.fn(async () => ({ok: false}))
    let ok
    await act(async () => void (ok = await result.current.remove(mine.k)))
    expect(ok).toBe(false)
    expect(result.current.library.some((c) => c.k === mine.k)).toBe(true)
    global.fetch = vi.fn(async () => ({ok: true}))
    await act(async () => void (ok = await result.current.remove(mine.k)))
    expect(ok).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith('/api/symbols/custom%3Ab', expect.objectContaining({method: 'DELETE'}))
    expect(result.current.library.some((c) => c.k === mine.k)).toBe(false)
})
test('restore restores one standard symbol through the backend, restoreAll all of them', async () => {
    backend()
    const {result} = await load()
    const oven = standard.find((d) => d.k === 'oven')
    await act(async () => void (await result.current.save({...oven, name: 'Anders'})))
    expect(result.current.library.find((c) => c.k === 'oven').name).toBe('Anders')
    let s
    await act(async () => void (s = await result.current.restore('oven')))
    expect(s).toEqual(oven)
    expect(result.current.library.find((c) => c.k === 'oven')).toEqual(oven)
    expect(global.fetch).toHaveBeenLastCalledWith('/api/symbols/oven/restore', expect.objectContaining({method: 'POST'}))
    await act(async () => void (await result.current.save({...oven, name: 'Weer anders'})))
    let ok
    await act(async () => void (ok = await result.current.restoreAll()))
    expect(ok).toBe(true)
    expect(result.current.library).toEqual(standard)
    global.fetch = vi.fn(async () => ({ok: false}))
    await act(async () => void (s = await result.current.restore('oven')))
    await act(async () => void (ok = await result.current.restoreAll()))
    expect([s, ok]).toEqual([null, false])
})
test('template gives a new symbol of the backend, or null', async () => {
    backend()
    const {result} = await load()
    let t
    await act(async () => void (t = await result.current.template()))
    expect(t).toMatchObject({k: 'custom:nieuw', parents: ['kring']})
    global.fetch = vi.fn(async () => ({ok: false}))
    await act(async () => void (t = await result.current.template()))
    expect(t).toBeNull()
})
