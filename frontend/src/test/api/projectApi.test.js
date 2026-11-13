// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {createProject, fetchProject, fetchShareableGroups, knownVersion, saveProject, shareProject} from '../../api/projectApi.js'

const json = (body, status = 200, etag = null) => ({ok: status < 400, status, headers: {get: (name) => (name === 'ETag' ? etag : null)}, json: async () => body})

test('a new project is created by the server, which answers its number', async () => {
    global.fetch = vi.fn(async () => json({id: 12}, 201))
    expect(await createProject({name: ' Woning Jan ', een: []})).toBe(12)
    expect(global.fetch.mock.calls[0][0]).toBe('/api/projects?name=Woning%20Jan')
    expect(global.fetch.mock.calls[0][1].method).toBe('POST')
    await createProject({een: []})
    expect(global.fetch.mock.calls[1][0]).toBe('/api/projects')
    global.fetch = vi.fn(async () => json(null, 500))
    expect(await createProject({})).toBeNull()
    global.fetch = vi.fn(async () => Promise.reject(new Error('down')))
    expect(await createProject({})).toBeNull()
})

test('the groups to share with, and sharing', async () => {
    global.fetch = vi.fn(async () => json([{id: 7, name: 'Team'}]))
    expect(await fetchShareableGroups()).toEqual([{id: 7, name: 'Team'}])
    global.fetch = vi.fn(async () => json({}))
    expect(await fetchShareableGroups()).toEqual([])
    global.fetch = vi.fn(async () => json(null, 500))
    await expect(fetchShareableGroups()).rejects.toThrow()
    global.fetch = vi.fn(async () => json({id: 3, groups: [{id: 7, name: 'Team'}]}))
    expect(await shareProject(3, [7])).toEqual({ok: true, summary: {id: 3, groups: [{id: 7, name: 'Team'}]}})
    expect(global.fetch).toHaveBeenCalledWith('/api/projects/3/groups', expect.objectContaining({method: 'PUT', body: '{"groupIds":[7]}'}))
})

test('a save sends the version that was loaded, and remembers the new one', async () => {
    global.fetch = vi.fn(async () => json({een: []}, 200, '"4"'))
    await fetchProject(21)
    expect(knownVersion(21)).toBe('"4"')
    global.fetch = vi.fn(async () => ({ok: true, status: 204, headers: {get: () => '"5"'}}))
    expect(await saveProject(21, {name: 'x'})).toBe(true)
    expect(global.fetch.mock.calls[0][1].headers['If-Match']).toBe('"4"')
    expect(knownVersion(21)).toBe('"5"')
    await saveProject(21, {name: 'x'})
    expect(global.fetch.mock.calls[1][1].headers['If-Match']).toBe('"5"')
})

test('a new project starts at the version the server gives it', async () => {
    global.fetch = vi.fn(async () => json({id: 30, version: 0}, 201, '"0"'))
    expect(await createProject({})).toBe(30)
    expect(knownVersion(30)).toBe('"0"')
    // an older server without ETag: the version of the body
    global.fetch = vi.fn(async () => json({id: 31, version: 2}, 201))
    await createProject({})
    expect(knownVersion(31)).toBe('"2"')
})

test('somebody else saved in between: the save is refused and the caller is told', async () => {
    global.fetch = vi.fn(async () => json({een: []}, 200, '"1"'))
    await fetchProject(22)
    const onConflict = vi.fn()
    global.fetch = vi.fn(async () => json({messageKey: 'project.changedElsewhere'}, 409))
    expect(await saveProject(22, {}, {onConflict})).toBe(false)
    expect(onConflict).toHaveBeenCalledTimes(1)
    // the version stays the one that was loaded: saving again is refused again until the project is loaded again
    expect(knownVersion(22)).toBe('"1"')
    global.fetch = vi.fn(async () => json(null, 500))
    expect(await saveProject(22, {}, {onConflict})).toBe(false)
    expect(onConflict).toHaveBeenCalledTimes(1)
})

test('presence messages are numbered upward, so the server can ignore a heartbeat that arrives after the leave', async () => {
    const {leavePresence, reportPresence} = await import('../../api/projectApi.js')
    global.fetch = vi.fn(async () => ({ok: true, status: 200, json: async () => ({others: [], version: 1})}))
    await reportPresence(4, false)
    await leavePresence(4)
    await reportPresence(4, true)
    const [first, leave, again] = global.fetch.mock.calls
    const seqOf = (call) => (call[1].method === 'DELETE' ? Number(new URL(call[0], 'http://x').searchParams.get('seq')) : JSON.parse(call[1].body).seq)
    expect(leave[1]).toMatchObject({method: 'DELETE', keepalive: true})
    expect(seqOf(leave)).toBeGreaterThan(seqOf(first))
    expect(seqOf(again)).toBeGreaterThan(seqOf(leave))
    expect(JSON.parse(again[1].body)).toMatchObject({editing: true})
})
