// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {createProject, fetchShareableGroups, shareProject} from '../../api/projectApi.js'

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})

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
