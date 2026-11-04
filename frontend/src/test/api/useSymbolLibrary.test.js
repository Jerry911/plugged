// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, renderHook, waitFor} from '@testing-library/react'
import {useSymbolLibrary} from '../../api/useSymbolLibrary.js'
import standard from '../fixtures/standard-symbols.json'

const mine = {k: 'custom:b', name: 'Beta', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 5, y2: 12}], v: 0, builtin: false, modified: false}
const json = (body, ok = true) => ({ok, json: async () => body})
// a fake backend: serves the library, echoes saved symbols and answers restore / delete / template; `legacy` are rows of the old /api/components
const backend = ({list = standard, legacy = null} = {}) => {
    global.fetch = vi.fn(async (url, o = {}) => {
        const m = o.method || 'GET'
        if (url === '/api/symbols' && m === 'GET') return json(list)
        if (url === '/api/symbols/restore') return json(standard)
        if (url === '/api/symbols/template') return json({k: 'custom:nieuw', name: '', parents: ['kring'], shapes: []})
        if (url.endsWith('/restore')) return json(standard.find((c) => c.k === decodeURIComponent(url.split('/')[3])))
        if (url === '/api/components') return legacy ? json(legacy) : {ok: false}
        if (url.startsWith('/api/components/')) return {ok: true}
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
test('own components of the old /api/components table are copied to the symbols table once and then removed', async () => {
    const old = {k: 'custom:old', name: 'Oud', cat: 'Eigen', parents: ['kring'], place: true, shapes: mine.shapes, v: 3}
    backend({
        legacy: [
            {k: 'custom:old', json: JSON.stringify(old)},
            {k: 'oven', json: JSON.stringify({k: 'oven', name: 'Mijn oven'})},
            {k: 'custom:bad', json: 'nope'},
            {k: 'custom:b', json: JSON.stringify(mine)},
        ],
        list: [...standard, mine],
    })
    const {result} = await load()
    expect(result.current.library.map((c) => c.k)).toEqual([...standard.map((c) => c.k), 'custom:b', 'custom:old'])
    const put = global.fetch.mock.calls.find((c) => c[0] === '/api/symbols/custom%3Aold')
    expect(JSON.parse(put[1].body)).toEqual({k: 'custom:old', name: 'Oud', cat: 'Eigen', parents: ['kring'], place: true, shapes: mine.shapes})
    // every old row is removed: the migrated one, the obsolete standard one, the unreadable one and the one that was already copied
    const gone = global.fetch.mock.calls.filter((c) => c[1]?.method === 'DELETE' && c[0].startsWith('/api/components/')).map((c) => c[0])
    expect(gone).toEqual(['/api/components/custom%3Aold', '/api/components/oven', '/api/components/custom%3Abad', '/api/components/custom%3Ab'])
})
test('an old component that the backend refuses stays in the old table', async () => {
    backend({legacy: [{k: 'custom:old', json: JSON.stringify({name: 'Oud', shapes: []})}]})
    const base = global.fetch
    global.fetch = vi.fn(async (url, o) => (url === '/api/symbols/custom%3Aold' ? {ok: false} : base(url, o)))
    const {result} = await load()
    expect(result.current.library).toEqual(standard)
    expect(global.fetch.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false)
})
test('a broken old table does not stop the library from loading', async () => {
    backend({legacy: [{k: 'custom:old', json: '{}'}]})
    const base = global.fetch
    global.fetch = vi.fn(async (url, o) => (url === '/api/components' ? {ok: true, json: async () => Promise.reject(new Error('bad'))} : base(url, o)))
    const {result} = await load()
    expect(result.current.status).toBe('ready')
    expect(result.current.library).toEqual(standard)
})
