// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Signing in and out, registration, the first start (/api/auth) and, for administrators, the accounts (/api/admin/users) and the groups
// (/api/admin/groups).
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

/** Sends `body` (POST unless `method` says otherwise) and answers {ok: true, user} (the answer of the server) or {ok: false, error}; never throws. */
const send = async (url, body, method = 'POST') => {
    try {
        const response = await apiFetch(url, {method, headers: JSON_HEADERS, body: JSON.stringify(body)})
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

/** {ok, user, error}: makes the account an administrator (`admin` true, which also approves it) or an ordinary user again. */
export const setUserAdmin = (id, admin) => send(userUrl(id) + '/admin', {admin}, 'PUT')

/** Every group with its members ([{id, name, created, members: [{id, name, surname, email}]}]). Throws when not available. */
export const fetchGroups = async () => {
    const response = await apiFetch('/api/admin/groups')
    if (!response.ok) throw new Error('groups not available')
    const groups = await response.json()
    return Array.isArray(groups) ? groups : []
}

const groupUrl = (id) => '/api/admin/groups/' + encodeURIComponent(id)

/** The group calls answer {ok, user (= the group), error}. */
export const createGroup = (name) => send('/api/admin/groups', {name})
export const renameGroup = (id, name) => send(groupUrl(id), {name}, 'PUT')
export const addGroupMember = (id, userId) => send(groupUrl(id) + '/members/' + encodeURIComponent(userId), undefined, 'PUT')
export const removeGroupMember = (id, userId) => send(groupUrl(id) + '/members/' + encodeURIComponent(userId), undefined, 'DELETE')
export const deleteGroup = async (id) => {
    try {
        const response = await apiFetch(groupUrl(id), {method: 'DELETE'})
        return response.ok ? {ok: true} : {ok: false, error: await problem(response)}
    } catch {
        return {ok: false, error: t('auth.unreachable')}
    }
}

/** The standard symbols whose standard in this installation differs from the catalog of this version ([{k, name, ...}]). Throws when not available. */
export const fetchCatalogChanges = async () => {
    const response = await apiFetch('/api/admin/symbols/catalog/changes')
    if (!response.ok) throw new Error('catalog changes not available')
    const changes = await response.json()
    return Array.isArray(changes) ? changes : []
}

/** The catalog file standard-symbols.json as this installation has it (text), or null when it cannot be fetched. */
export const fetchCatalogFile = async () => {
    try {
        const response = await apiFetch('/api/admin/symbols/catalog')
        return response.ok ? await response.text() : null
    } catch {
        return null
    }
}

/** {ok, user (= the group), error}: makes a member owner of the group (a teacher) or takes the ownership away (administrators). */
export const setGroupOwner = (id, userId, owner) => send(groupUrl(id) + '/owners/' + encodeURIComponent(userId), undefined, owner ? 'PUT' : 'DELETE')

/** The groups whose educational mode the user may switch, with their members (the groups he owns). Throws when not available. */
export const fetchOwnedGroups = async () => {
    const response = await apiFetch('/api/groups/owned')
    if (!response.ok) throw new Error('groups not available')
    const groups = await response.json()
    return Array.isArray(groups) ? groups : []
}

/** {ok, user (= the group), error}: switches the educational mode of a group (its owners and administrators). */
export const setGroupEducational = (id, educational) => send('/api/groups/' + encodeURIComponent(id) + '/educational', {educational}, 'PUT')
