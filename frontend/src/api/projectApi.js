// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The REST API of the stored projects (/api/projects), the groups a project can be shared with (/api/groups) and the installation settings
// (/api/info). The server decides which projects the user sees: his own, those shared with one of his groups, and every one for an admin.
import {apiFetch, JSON_HEADERS} from './http.js'

const projectUrl = (id) => '/api/projects/' + id
// browsers refuse a keepalive request with more than 64 KiB of body
export const KEEPALIVE_LIMIT = 60_000

/** The stored project document, or null when it does not exist. Throws when the backend cannot be reached. */
export const fetchProject = async (id) => {
    const response = await apiFetch(projectUrl(id))
    return response.ok ? response.json() : null
}

const withName = (url, project) => {
    const name = (project.name || '').trim()
    return url + (name ? '?name=' + encodeURIComponent(name) : '')
}

/** Stores a new project; the server gives it the next free number. Resolves to that number, or null when it was not stored. */
export const createProject = async (project) => {
    try {
        const response = await apiFetch(withName('/api/projects', project), {method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(project)})
        return response.ok ? (await response.json()).id : null
    } catch {
        return null
    }
}

/**
 * Stores the project document under `id` (its name also goes along as ?name=, for the project list). Resolves to true when it was stored.
 * keepalive: the request goes on when the page is closed (an automatic save on leaving); browsers allow that only for small bodies.
 */
export const saveProject = async (id, project, {keepalive = false} = {}) => {
    const body = JSON.stringify(project)
    const response = await apiFetch(withName(projectUrl(id), project), {
        method: 'PUT',
        headers: JSON_HEADERS,
        body,
        ...(keepalive && new TextEncoder().encode(body).length < KEEPALIVE_LIMIT ? {keepalive: true} : {}),
    })
    return response.ok
}

export const deleteProject = async (id) => (await apiFetch(projectUrl(id), {method: 'DELETE'})).ok

/** The ids of the stored projects. */
export const fetchProjectIds = async () => {
    const ids = await (await apiFetch('/api/projects')).json()
    return Array.isArray(ids) ? ids : []
}

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
