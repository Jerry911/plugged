// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The REST API of the stored projects (/api/projects) and of the installation settings (/api/info).
import {apiFetch, JSON_HEADERS} from './http.js'

const projectUrl = (id) => '/api/projects/' + id

/** The stored project document, or null when it does not exist. Throws when the backend cannot be reached. */
export const fetchProject = async (id) => {
    const response = await apiFetch(projectUrl(id))
    return response.ok ? response.json() : null
}

/** Stores the project document under `id` (its name also goes along as ?name=, for the project list). Resolves to true when it was stored. */
export const saveProject = async (id, project) => {
    const name = (project.name || '').trim()
    const response = await apiFetch(projectUrl(id) + (name ? '?name=' + encodeURIComponent(name) : ''), {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(project),
    })
    return response.ok
}

export const deleteProject = async (id) => (await apiFetch(projectUrl(id), {method: 'DELETE'})).ok

/** The ids of the stored projects. */
export const fetchProjectIds = async () => {
    const ids = await (await apiFetch('/api/projects')).json()
    return Array.isArray(ids) ? ids : []
}

/** [{id, name, updated}] of the stored projects. Throws when the list cannot be loaded. */
export const fetchProjectSummaries = async () => {
    const response = await apiFetch('/api/projects/summaries')
    if (!response.ok) throw new Error('project list not available')
    const summaries = await response.json()
    return Array.isArray(summaries) ? summaries : []
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
