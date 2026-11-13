// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The REST API of the stored projects (/api/projects), the groups a project can be shared with (/api/groups) and the installation settings
// (/api/info). The server decides which projects the user sees: his own, those shared with one of his groups, and every one for an admin.
import {apiFetch, JSON_HEADERS} from './http.js'

const projectUrl = (id) => '/api/projects/' + id
// browsers refuse a keepalive request with more than 64 KiB of body
export const KEEPALIVE_LIMIT = 60_000

// The version of every project this browser loaded or saved (the ETag of the server). A save sends it back (If-Match): when somebody else
// saved the project in between, the server refuses the save (409) instead of overwriting that work.
const versions = new Map()
const rememberVersion = (id, response) => {
    const etag = response.headers?.get?.('ETag')
    if (etag && id != null) versions.set(String(id), etag)
}
/** The version (ETag) this browser knows of project `id`, or undefined. */
export const knownVersion = (id) => versions.get(String(id))

/** The stored project document, or null when it does not exist. Throws when the backend cannot be reached. */
export const fetchProject = async (id) => {
    const response = await apiFetch(projectUrl(id))
    if (!response.ok) return null
    rememberVersion(id, response)
    return response.json()
}

const withName = (url, project) => {
    const name = (project.name || '').trim()
    return url + (name ? '?name=' + encodeURIComponent(name) : '')
}

/** Stores a new project; the server gives it its number. Resolves to that number, or null when it was not stored. */
export const createProject = async (project) => {
    try {
        const response = await apiFetch(withName('/api/projects', project), {method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(project)})
        if (!response.ok) return null
        const {id, version} = await response.json()
        versions.set(String(id), response.headers?.get?.('ETag') || '"' + (version ?? 0) + '"')
        return id
    } catch {
        return null
    }
}

/**
 * Stores the project document under `id` (its name also goes along as ?name=, for the project list), based on the version this browser
 * loaded or saved last. Resolves to true when it was stored. When somebody else saved the project in between, the server refuses it:
 * `onConflict()` is called and it resolves to false.
 * keepalive: the request goes on when the page is closed (an automatic save on leaving); browsers allow that only for small bodies.
 */
export const saveProject = async (id, project, {keepalive = false, onConflict} = {}) => {
    const body = JSON.stringify(project)
    const response = await apiFetch(withName(projectUrl(id), project), {
        method: 'PUT',
        headers: {...JSON_HEADERS, 'If-Match': knownVersion(id) ?? '"0"'},
        body,
        ...(keepalive && new TextEncoder().encode(body).length < KEEPALIVE_LIMIT ? {keepalive: true} : {}),
    })
    if (response.ok) rememberVersion(id, response)
    else if (response.status === 409) onConflict?.()
    return response.ok
}

export const deleteProject = async (id) => (await apiFetch(projectUrl(id), {method: 'DELETE'})).ok

/**
 * [{id, name, updated, owner: {id, name}, groups: [{id, name}], mine, canManage}] of the projects the user may see. Throws when the list
 * cannot be loaded.
 */
export const fetchProjectSummaries = async () => {
    const response = await apiFetch('/api/projects/summaries')
    if (!response.ok) throw new Error('project list not available')
    const summaries = await response.json()
    return Array.isArray(summaries) ? summaries : []
}

/** The groups the user can share a project with ([{id, name}]: his own groups, every group for an admin). Throws when not available. */
export const fetchShareableGroups = async () => {
    const response = await apiFetch('/api/groups')
    if (!response.ok) throw new Error('groups not available')
    const groups = await response.json()
    return Array.isArray(groups) ? groups : []
}

/** Shares project `id` with exactly these groups. Resolves to {ok: true, summary} or {ok: false, error}. */
export const shareProject = async (id, groupIds) => {
    try {
        const response = await apiFetch(projectUrl(id) + '/groups', {method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({groupIds})})
        if (response.ok) return {ok: true, summary: await response.json()}
        const problem = await response.json().catch(() => null)
        return {ok: false, error: problem?.detail || ''}
    } catch {
        return {ok: false, error: ''}
    }
}

/** {ok, ...answer} or {ok: false, status, error} of a call that changes something; never throws. */
const call = async (url, method, {versionOf} = {}) => {
    try {
        const response = await apiFetch(url, {method})
        if (response.ok) {
            if (versionOf != null) rememberVersion(versionOf, response)
            const answer = response.status === 204 ? {} : await response.json().catch(() => ({}))
            return {ok: true, ...answer}
        }
        const problem = await response.json().catch(() => null)
        return {ok: false, status: response.status, error: problem?.detail || ''}
    } catch {
        return {ok: false, error: ''}
    }
}

/** The projects in the trash the user may restore (summaries; `updated` is when it was deleted). Throws when not available. */
export const fetchTrash = async () => {
    const response = await apiFetch('/api/projects/trash')
    if (!response.ok) throw new Error('trash not available')
    const summaries = await response.json()
    return Array.isArray(summaries) ? summaries : []
}
/** Takes a project out of the trash: {ok, ...summary}. */
export const untrashProject = (id) => call(projectUrl(id) + '/untrash', 'POST')
/** Removes a project in the trash for good: {ok}. */
export const purgeProject = (id) => call('/api/projects/trash/' + id, 'DELETE')
/** A copy of a project as a new own project: {ok, id, version}. */
export const copyProject = async (id, name) => {
    const result = await call(projectUrl(id) + '/copy' + (name ? '?name=' + encodeURIComponent(name) : ''), 'POST')
    if (result.ok) versions.set(String(result.id), '"' + (result.version ?? 0) + '"')
    return result
}
/** The history of a project, newest first: [{version, name, savedAt, savedBy, size, current}]. Throws when not available. */
export const fetchHistory = async (id) => {
    const response = await apiFetch(projectUrl(id) + '/versions')
    if (!response.ok) throw new Error('history not available')
    const list = await response.json()
    return Array.isArray(list) ? list : []
}
/** Saves an older version again as the newest one: {ok, version}. */
export const restoreVersion = (id, version) => call(projectUrl(id) + '/versions/' + version + '/restore', 'POST', {versionOf: id})

// a random id of this browser window, so the server tells the windows apart (also two windows of one user)
const WINDOW_ID = (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
// every presence message of this window gets the next number: a heartbeat still on its way when the window leaves arrives after the
// leave, and the server ignores it by its lower number (otherwise it would show the window again until the timeout, 90 s)
let presenceSeq = 0
/**
 * This window has project `id` open (`editing`: with unsaved changes). Answers {others: [{name, editing, since, me}], version, savedBy}:
 * who else has it open, and the version in the database and who saved it; null when that is not known.
 */
export const reportPresence = async (id, editing) => {
    try {
        const response = await apiFetch(projectUrl(id) + '/presence', {method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({window: WINDOW_ID, editing: !!editing, seq: ++presenceSeq})})
        return response.ok ? await response.json() : null
    } catch {
        return null
    }
}
/** This window closed project `id` (keepalive: also when the page closes). */
export const leavePresence = (id) =>
    Promise.resolve(apiFetch(projectUrl(id) + '/presence?window=' + WINDOW_ID + '&seq=' + ++presenceSeq, {method: 'DELETE', keepalive: true})).catch(() => {})
/** The version number in an ETag ("3" -> 3), or null. */
export const versionNumber = (etag) => {
    const number = Number(String(etag ?? '').replace(/^W\//, '').replace(/"/g, ''))
    return etag == null || Number.isNaN(number) ? null : number
}

/** {donateUrl, contactEmail} of this installation (empty strings when not configured or not reachable). */
export const fetchInfo = async () => {
    try {
        const response = await apiFetch('/api/info')
        const info = response.ok ? await response.json() : null
        return {donateUrl: info?.donateUrl || '', contactEmail: info?.contactEmail || ''}
    } catch {
        return {donateUrl: '', contactEmail: ''}
    }
}
