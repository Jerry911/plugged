// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, renderHook, waitFor} from '@testing-library/react'
import {BUILTIN as DEFAULTS} from '../symbols.jsx'
import {mergeLibrary, useLibrary} from '../library.js'

const mine = {k: 'custom:b', name: 'Beta', cat: 'Eigen', parents: ['kring'], place: true, shapes: [{t: 'line', x1: 0, y1: 12, x2: 5, y2: 12}]}
const rows = (...cs) => cs.map((c) => ({k: c.k, json: JSON.stringify(c)}))
const bulk = () => global.fetch.mock.calls.find((c) => c[0] === '/api/components' && c[1]?.method === 'PUT')
const mock = (get) => (global.fetch = vi.fn(async (url, o) => (o ? {ok: true} : get(url))))

test('mergeLibrary keeps the defaults in order, lets stored versions win and sorts extras by name', () => {
    expect(mergeLibrary()).toEqual(DEFAULTS)
    const oven = {...DEFAULTS.find((d) => d.k === 'oven'), name: 'Mijn oven'},
        alfa = {...mine, k: 'custom:a', name: 'Alfa'}
    const m = mergeLibrary([mine, oven, alfa, {k: 'custom:z'}])
    expect(m.slice(0, DEFAULTS.length).map((c) => c.k)).toEqual(DEFAULTS.map((d) => d.k))
    expect(m.find((c) => c.k === 'oven').name).toBe('Mijn oven')
    expect(m.slice(DEFAULTS.length).map((c) => c.k)).toEqual(['custom:z', 'custom:a', 'custom:b'])
})
test('a stored standard component made with an older symbol version is replaced by the current standard', () => {
    const old = {...DEFAULTS.find((d) => d.k === 'oven'), v: 0, name: 'Oud'}
    expect(mergeLibrary([old]).find((c) => c.k === 'oven')).toEqual(DEFAULTS.find((d) => d.k === 'oven'))
    const {v, ...unversioned} = old
    expect(mergeLibrary([unversioned]).find((c) => c.k === 'oven').name).toBe('Oven')
})
test('useLibrary loads the stored components and seeds the missing defaults', async () => {
    const edited = {...DEFAULTS[1], name: 'Aangepast'}
    mock(async () => ({ok: true, json: async () => rows(mine, edited)}))
    const {result} = renderHook(() => useLibrary())
    expect(result.current.lib).toBe(DEFAULTS)
    await waitFor(() => expect(result.current.lib).toHaveLength(DEFAULTS.length + 1))
    expect(result.current.lib.find((c) => c.k === DEFAULTS[1].k).name).toBe('Aangepast')
    const sent = JSON.parse(bulk()[1].body)
    expect(sent).toHaveLength(DEFAULTS.length - 1)
    expect(sent.map((r) => r.k)).not.toContain(DEFAULTS[1].k)
    expect(JSON.parse(sent[0].json).k).toBe(sent[0].k)
})
test('useLibrary skips unreadable rows and does not seed when everything is stored', async () => {
    mock(async () => ({ok: true, json: async () => [{k: 'bad', json: 'nope'}, ...rows(...DEFAULTS)]}))
    const {result} = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.lib).not.toBe(DEFAULTS))
    expect(bulk()).toBeUndefined()
    expect(result.current.lib).toHaveLength(DEFAULTS.length)
})
test('useLibrary keeps the defaults without a backend', async () => {
    for (const get of [async () => ({ok: false}), async () => Promise.reject(new Error('down')), async () => ({ok: true, json: async () => ({not: 'a list'})})]) {
        mock(get)
        const {result, unmount} = renderHook(() => useLibrary())
        await act(async () => {})
        expect(result.current.lib).toBe(DEFAULTS)
        unmount()
    }
})
test('useLibrary ignores an answer that arrives after unmount', async () => {
    let done
    mock(() => new Promise((r) => (done = () => r({ok: true, json: async () => rows(mine)}))))
    const {unmount} = renderHook(() => useLibrary())
    unmount()
    await act(async () => done())
})
test('save adds or replaces a component and reports whether the database accepted it', async () => {
    mock(async () => ({ok: false}))
    const {result} = renderHook(() => useLibrary())
    await act(async () => {})
    let ok
    await act(async () => void (ok = await result.current.save(mine)))
    expect(ok).toBe(true)
    expect(result.current.lib.at(-1)).toEqual(mine)
    expect(global.fetch).toHaveBeenCalledWith('/api/components/custom%3Ab', expect.objectContaining({method: 'PUT', body: JSON.stringify(mine)}))
    await act(async () => void (await result.current.save({...mine, name: 'Beta 2'})))
    expect(result.current.lib.filter((c) => c.k === mine.k)).toHaveLength(1)
    expect(result.current.lib.at(-1).name).toBe('Beta 2')
    global.fetch = vi.fn(async () => ({ok: false}))
    await act(async () => void (ok = await result.current.save(mine)))
    expect(ok).toBe(false)
    global.fetch = vi.fn(async () => Promise.reject(new Error('down')))
    await act(async () => void (ok = await result.current.save(mine)))
    expect(ok).toBe(false)
})
test('remove and reset', async () => {
    mock(async () => ({ok: false}))
    const {result} = renderHook(() => useLibrary())
    await act(async () => {})
    await act(async () => void (await result.current.save(mine)))
    global.fetch = vi.fn(async () => ({ok: true}))
    let ok
    await act(async () => void (ok = await result.current.remove(mine.k)))
    expect(ok).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith('/api/components/custom%3Ab', {method: 'DELETE'})
    expect(result.current.lib.some((c) => c.k === mine.k)).toBe(false)
    global.fetch = vi.fn(async () => Promise.reject(new Error('down')))
    await act(async () => void (ok = await result.current.remove(mine.k)))
    expect(ok).toBe(false)
    global.fetch = vi.fn(async () => ({ok: true}))
    const oven = DEFAULTS.find((d) => d.k === 'oven')
    await act(async () => void (await result.current.save({...oven, name: 'Anders'})))
    await act(async () => void (await result.current.reset('oven')))
    expect(result.current.lib.find((c) => c.k === 'oven')).toEqual(oven)
    expect(global.fetch).toHaveBeenLastCalledWith('/api/components/oven', expect.objectContaining({body: JSON.stringify(oven)}))
})
