// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {approveUser, deleteUser, fetchAuthStatus, fetchUsers, login, logout, register, setupAdmin} from '../../api/authApi.js'
import {t} from '../../i18n/translate.js'

const json = (body, status = 200) => ({ok: status < 400, status, json: async () => body})

test('the status of the session', async () => {
    global.fetch = vi.fn(async () => json({setupRequired: true, adminEmail: 'a@b.be', user: null}))
    expect(await fetchAuthStatus()).toEqual({setupRequired: true, adminEmail: 'a@b.be', user: null})
    global.fetch = vi.fn(async () => json({}))
    expect(await fetchAuthStatus()).toEqual({setupRequired: false, adminEmail: '', user: null})
    global.fetch = vi.fn(async () => json(null, 500))
    await expect(fetchAuthStatus()).rejects.toThrow()
})

test('the requests send their fields and answer the user or the message of the backend', async () => {
    const user = {id: 1, email: 'a@b.be'}
    global.fetch = vi.fn(async () => json(user))
    expect(await setupAdmin({name: 'A', surname: 'B', password: 'p', email: 'ignored'})).toEqual({ok: true, user})
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({name: 'A', surname: 'B', password: 'p'})
    expect(await register({name: 'A', surname: 'B', email: 'a@b.be', password: 'p'})).toEqual({ok: true, user})
    expect(await login({email: 'a@b.be', password: 'p'})).toEqual({ok: true, user})
    expect(global.fetch.mock.calls.map((call) => [call[0], call[1].method])).toEqual([
        ['/api/auth/setup', 'POST'],
        ['/api/auth/register', 'POST'],
        ['/api/auth/login', 'POST'],
    ])
    global.fetch = vi.fn(async () => ({ok: true, status: 204}))
    expect(await logout()).toEqual({ok: true, user: null})
    global.fetch = vi.fn(async () => json({detail: 'Geen geldig e-mailadres'}, 400))
    expect(await register({})).toEqual({ok: false, status: 400, error: 'Geen geldig e-mailadres'})
    global.fetch = vi.fn(async () => json({}, 403))
    expect((await login({})).error).toBe(t('auth.failed'))
    global.fetch = vi.fn(async () => ({ok: false, status: 500, json: async () => Promise.reject(new Error('no json'))}))
    expect((await login({})).error).toBe(t('auth.failed'))
    global.fetch = vi.fn(async () => Promise.reject(new Error('down')))
    expect(await login({})).toEqual({ok: false, error: t('auth.unreachable')})
})

test('the accounts for the administrator', async () => {
    global.fetch = vi.fn(async () => json([{id: 1}]))
    expect(await fetchUsers()).toEqual([{id: 1}])
    global.fetch = vi.fn(async () => json({}))
    expect(await fetchUsers()).toEqual([])
    global.fetch = vi.fn(async () => json(null, 403))
    await expect(fetchUsers()).rejects.toThrow()
    global.fetch = vi.fn(async () => json({id: 3, approved: true}))
    expect((await approveUser(3)).ok).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/users/3/approve', expect.objectContaining({method: 'POST'}))
    global.fetch = vi.fn(async () => ({ok: true, status: 204}))
    expect(await deleteUser(3)).toEqual({ok: true})
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/users/3', expect.objectContaining({method: 'DELETE'}))
    global.fetch = vi.fn(async () => json({detail: 'De beheerder kan niet verwijderd worden'}, 409))
    expect(await deleteUser(1)).toEqual({ok: false, error: 'De beheerder kan niet verwijderd worden'})
    global.fetch = vi.fn(async () => Promise.reject(new Error('down')))
    expect(await deleteUser(1)).toEqual({ok: false, error: t('auth.unreachable')})
})
