// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The saves kept on this device without a connection, and sending them later.
import {createdSave, isOffline, keepSave, pendingKey, pendingSaves, resetOfflineStore, sentSave} from '../../offline/offlineStore.js'
import {offlineCopyName, syncPending} from '../../offline/sync.js'

beforeEach(() => resetOfflineStore())

const answer = (status, etag) => ({ok: status < 300, status, headers: {get: (name) => (name === 'ETag' ? etag : null)}, json: async () => ({id: 9, version: 0})})

test('a newer save of the same project replaces the older one but keeps the version it was based on', async () => {
    await keepSave({userId: 2, id: 5, version: '"3"', name: 'Woning', document: {name: 'Woning', v: 1}})
    await keepSave({userId: 2, id: 5, version: '"7"', name: 'Woning', document: {name: 'Woning', v: 2}})
    await keepSave({userId: 3, id: 5, version: '"3"', document: {}})
    const mine = await pendingSaves(2)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({key: pendingKey(2, 5), version: '"3"', document: {v: 2}})
})

test('a sent save goes, unless a newer one came in meanwhile: that one is then based on the new version', async () => {
    const first = await keepSave({userId: 2, id: 5, version: '"3"', document: {v: 1}})
    await sentSave(first, '"4"')
    expect(await pendingSaves(2)).toEqual([])
    const second = await keepSave({userId: 2, id: 5, version: '"4"', document: {v: 2}})
    await new Promise((resolve) => setTimeout(resolve, 2))
    await keepSave({userId: 2, id: 5, version: '"4"', document: {v: 3}})
    await sentSave(second, '"5"')
    expect(await pendingSaves(2)).toMatchObject([{version: '"5"', document: {v: 3}}])
})

test('a never stored project moves to its number when a newer save came in while it was created', async () => {
    const entry = await keepSave({userId: 2, id: null, localId: 'abc', document: {v: 1}})
    expect(entry.key).toBe('2:new-abc')
    await new Promise((resolve) => setTimeout(resolve, 2))
    await keepSave({userId: 2, id: null, localId: 'abc', document: {v: 2}})
    await createdSave(entry, 12, '"0"')
    expect(await pendingSaves(2)).toMatchObject([{key: '2:12', id: 12, version: '"0"', document: {v: 2}}])
})

test('only a failed fetch counts as offline, not an answer of the server', () => {
    expect(isOffline(new TypeError('Failed to fetch'))).toBe(true)
    expect(isOffline(new Error('500'))).toBe(false)
})

test('syncing: saved on top of its version, created, or kept as a copy when somebody else saved in between', async () => {
    await keepSave({userId: 2, id: 5, version: '"3"', name: 'A', document: {name: 'A'}})
    await keepSave({userId: 2, id: 6, version: '"1"', name: 'B', document: {name: 'B'}})
    await keepSave({userId: 2, id: null, localId: 'n', name: 'C', document: {name: 'C'}})
    const requests = []
    global.fetch = vi.fn(async (url, options) => {
        requests.push([options?.method, url, options?.headers?.['If-Match']])
        if (options?.method === 'PUT') return url.includes('/6') ? answer(409) : answer(204, '"4"')
        return answer(201, '"0"')
    })
    const reports = []
    const waiting = await syncPending(2, {report: (result) => reports.push([result.outcome, result.id]), translate: (key, values) => (key === 'offline.copyName' ? values.name + ' (offline)' : key)})
    expect(waiting).toBe(0)
    expect(reports).toEqual([['saved', 5], ['copied', 9], ['created', 9]])
    expect(requests[0]).toEqual(['PUT', '/api/projects/5?name=A', '"3"'])
    expect(requests[2]).toEqual(['POST', '/api/projects?name=B%20(offline)', undefined])
})

test('syncing stops at the first save that still cannot reach the server; a refusal is reported', async () => {
    await keepSave({userId: 2, id: 5, version: '"3"', document: {}})
    global.fetch = vi.fn(async () => {
        throw new TypeError('Failed to fetch')
    })
    const reports = []
    expect(await syncPending(2, {report: (result) => reports.push(result.outcome)})).toBe(1)
    expect(reports).toEqual([])
    global.fetch = vi.fn(async () => answer(401))
    expect(await syncPending(2, {report: (result) => reports.push(result.outcome)})).toBe(1)
    expect(reports).toEqual(['refused'])
    expect(offlineCopyName('', (key, values) => (key === 'offline.unnamed' ? 'Project' : values.name + ' ' + values.date), 'nl-BE')).toMatch(/^Project /)
})
