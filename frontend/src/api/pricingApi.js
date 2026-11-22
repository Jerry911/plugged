// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The price lists of the offertes (backend pricing/PriceListController): own ones and those shared with a group of the user.
import {apiFetch, JSON_HEADERS} from './http.js'

const problem = async (response) => (await response.json().catch(() => null))?.detail || ''

/** [{id, name, mine, owner, groups: [{id, name}], updated}] or null when the server cannot be reached. */
export const fetchPriceLists = async () => {
    try {
        const response = await apiFetch('/api/price-lists')
        return response.ok ? await response.json() : null
    } catch {
        return null
    }
}

/** The groups the user can share a price list with: [{id, name}]. */
export const fetchPriceListGroups = async () => {
    try {
        const response = await apiFetch('/api/price-lists/groups')
        return response.ok ? await response.json() : []
    } catch {
        return []
    }
}

/** {id, name, mine, owner, groups, updated, version, document} or null. */
export const fetchPriceList = async (id) => {
    try {
        const response = await apiFetch('/api/price-lists/' + id)
        return response.ok ? await response.json() : null
    } catch {
        return null
    }
}

/**
 * Stores a price list: a new one without id, else on top of `version`. {ok, list} or {ok: false, conflict, error}.
 * save: {name, document, groupIds}.
 */
export const storePriceList = async (id, version, save) => {
    try {
        const response = await apiFetch(id == null ? '/api/price-lists' : '/api/price-lists/' + id, {
            method: id == null ? 'POST' : 'PUT',
            headers: id == null ? JSON_HEADERS : {...JSON_HEADERS, 'If-Match': '"' + version + '"'},
            body: JSON.stringify(save),
        })
        return response.ok ? {ok: true, list: await response.json()} : {ok: false, conflict: response.status === 409, error: await problem(response)}
    } catch {
        return {ok: false, error: ''}
    }
}

/** Removes a price list of the user: true when it is gone. */
export const deletePriceList = async (id) => {
    try {
        return (await apiFetch('/api/price-lists/' + id, {method: 'DELETE'})).ok
    } catch {
        return false
    }
}
