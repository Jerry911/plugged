// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Signing in and out, registration, the first start (/api/auth) and the accounts for the administrator (/api/admin/users).
import {apiFetch, JSON_HEADERS} from './http.js'
import {t} from '../i18n/translate.js'

/**
 * {setupRequired, adminEmail, user}: user is the signed-in user ({id, name, surname, email, admin, approved}) or null.
 * Throws when the backend cannot be reached.
 */
export const fetchAuthStatus = async () => {
    const response = await apiFetch('/api/auth/status')
    if (!response.ok) throw new Error('status ' + response.status)
    const status = await response.json()
    return {setupRequired: !!status.setupRequired, adminEmail: status.adminEmail || '', user: status.user || null}
}

/** The message of a refused request: the text of the backend (in the language of the user), else a general one. */
const problem = async (response) => {
    try {
        const body = await response.json()
        return body?.detail || t('auth.failed')
    } catch {
        return t('auth.failed')
    }
}

/** POSTs `body` and answers {ok: true, user} or {ok: false, error}; never throws. */
const send = async (url, body) => {
    try {
        const response = await apiFetch(url, {method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body)})
        if (!response.ok) return {ok: false, status: response.status, error: await problem(response)}
        return {ok: true, user: response.status === 204 ? null : await response.json()}
    } catch {
        return {ok: false, error: t('auth.unreachable')}
    }
}

/** First start: the administrator (its email address is set by the server). Signs it in. */
export const setupAdmin = ({name, surname, password}) => send('/api/auth/setup', {name, surname, password})
/** A new account, waiting for the approval of the administrator. */
export const register = ({name, surname, email, password}) => send('/api/auth/register', {name, surname, email, password})
export const login = ({email, password}) => send('/api/auth/login', {email, password})
export const logout = () => send('/api/auth/logout')

/** The accounts (those waiting for approval first). Throws when the list cannot be loaded. */
export const fetchUsers = async () => {
    const response = await apiFetch('/api/admin/users')
    if (!response.ok) throw new Error('users not available')
    const users = await response.json()
    return Array.isArray(users) ? users : []
}

const userUrl = (id) => '/api/admin/users/' + encodeURIComponent(id)

/** {ok, error}: the account may sign in from now on. */
export const approveUser = (id) => send(userUrl(id) + '/approve')

/** {ok, error}: removes the account (or turns down the registration). */
export const deleteUser = async (id) => {
    try {
        const response = await apiFetch(userUrl(id), {method: 'DELETE'})
        return response.ok ? {ok: true} : {ok: false, error: await problem(response)}
    } catch {
        return {ok: false, error: t('auth.unreachable')}
    }
}
