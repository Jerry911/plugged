// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The AI link (backend com.pleysje.plugged.ai): the address an AI assistant connects to, the connections and personal keys of the user, and
// the page where he agrees that an assistant works in Plugged as him (OAuth).
import {apiFetch, JSON_HEADERS} from './http.js'

const problem = async (response) => {
    const body = await response.json().catch(() => null)
    return body?.error_description || body?.detail || body?.error || ''
}

/** {ok, url, connections: [{id, kind: 'oauth' | 'personal', name, created, lastUsed, expires}], keyDays} or {ok: false}. */
export const fetchAiOverview = async () => {
    try {
        const response = await apiFetch('/api/ai')
        return response.ok ? {ok: true, ...(await response.json())} : {ok: false}
    } catch {
        return {ok: false}
    }
}

/** A personal key: {ok, key} (shown once) or {ok: false}. */
export const createAiKey = async (name, days) => {
    try {
        const response = await apiFetch('/api/ai/keys', {method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({name, days})})
        return response.ok ? {ok: true, ...(await response.json())} : {ok: false}
    } catch {
        return {ok: false}
    }
}

/** Ends a connection or personal key: true when it is gone. */
export const endAiConnection = async (id) => {
    try {
        return (await apiFetch('/api/ai/connections/' + encodeURIComponent(id), {method: 'DELETE'})).ok
    } catch {
        return false
    }
}

/** Who asks to connect: {ok, client, redirectHost} or {ok: false, error}. */
export const fetchConsentRequest = async (clientId, redirectUri) => {
    try {
        const response = await apiFetch('/api/ai/authorize?' + new URLSearchParams({client_id: clientId || '', redirect_uri: redirectUri || '' }))
        return response.ok ? {ok: true, ...(await response.json())} : {ok: false, error: await problem(response)}
    } catch {
        return {ok: false, error: ''}
    }
}

/** The answer of the user: {ok, redirect} (where the browser goes now) or {ok: false, error}. */
export const answerConsent = async (request, approve) => {
    try {
        const response = await apiFetch('/api/ai/authorize', {method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({...request, approve: String(approve)})})
        return response.ok ? {ok: true, ...(await response.json())} : {ok: false, error: await problem(response)}
    } catch {
        return {ok: false, error: ''}
    }
}
