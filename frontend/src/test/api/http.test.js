// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {apiFetch, CSRF_HEADER, csrfToken, onUnauthorized} from '../../api/http.js'

const answer = (status) => vi.fn(async () => ({ok: status < 400, status}))
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const clearCookie = () => (document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/')

afterEach(clearCookie)

test('the CSRF token of the cookie goes along with requests that change something, not with reads', async () => {
    expect(csrfToken()).toBeNull()
    document.cookie = 'XSRF-TOKEN=abc%3D123; path=/'
    expect(csrfToken()).toBe('abc=123')
    global.fetch = answer(200)
    await apiFetch('/api/projects/1', {method: 'PUT', headers: {'Content-Type': 'application/json'}})
    expect(global.fetch.mock.calls[0][1].headers).toEqual({'Accept-Language': 'nl', [CSRF_HEADER]: 'abc=123', 'Content-Type': 'application/json'})
    await apiFetch('/api/projects/1')
    expect(global.fetch.mock.calls[1][1].headers).toEqual({'Accept-Language': 'nl'})
})

test('no token when the cookies cannot be read', () => {
    const getter = vi.spyOn(Document.prototype, 'cookie', 'get').mockImplementation(() => {
        throw new Error('sandboxed')
    })
    expect(csrfToken()).toBeNull()
    getter.mockRestore()
})

test('a 401 of the API tells the listeners that the session has ended; a 401 of /api/auth does not', async () => {
    const listener = vi.fn()
    const stop = onUnauthorized(listener)
    global.fetch = answer(401)
    await apiFetch('/api/auth/login', {method: 'POST'})
    await flush()
    expect(listener).not.toHaveBeenCalled()
    await apiFetch('/api/projects')
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    global.fetch = answer(200)
    await apiFetch('/api/projects')
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    global.fetch = answer(401)
    await apiFetch('/api/projects')
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
})

test('a request that fails reaches the caller unchanged', async () => {
    global.fetch = vi.fn(async () => Promise.reject(new Error('down')))
    await expect(apiFetch('/api/projects')).rejects.toThrow('down')
})
