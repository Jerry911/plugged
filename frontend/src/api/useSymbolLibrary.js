// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The symbol library: the standard symbols, the ones the user edited and the ones the user made. The backend owns it (GET /api/symbols):
// it defines and restores the standard drawings and stores the changes in the database. This hook only loads it and sends changes.
import {useCallback, useEffect, useState} from 'react'
import {fetchOk, JSON_HEADERS} from './http.js'
import {CONNECTION_TYPE} from '../symbols/symbolLibrary.js'

const symbolUrl = (key) => '/api/symbols/' + encodeURIComponent(key)

// Components made before the symbols table existed live in /api/components (one JSON document per component). The own ones (custom:...)
// are copied into the symbols table once and the old rows are removed; the standard ones in there are obsolete.
const migrateLegacyComponents = async (symbols) => {
    try {
        const response = await fetchOk('/api/components')
        if (!response) return symbols
        const rows = await response.json(),
            knownKeys = new Set(symbols.map((symbol) => symbol.k)),
            result = [...symbols]
        for (const row of rows) {
            let component = null
            try {
                component = row.k.startsWith('custom:') && !knownKeys.has(row.k) ? JSON.parse(row.json) : null
            } catch {
                component = null
            }
            if (component) {
                const {name, cat, parents, place, shapes} = component,
                    saved = await fetchOk(symbolUrl(row.k), {
                        method: 'PUT',
                        headers: JSON_HEADERS,
                        body: JSON.stringify({k: row.k, name, cat, parents, place, shapes}),
                    })
                if (!saved) continue
                result.push(await saved.json())
            }
            await fetchOk('/api/components/' + encodeURIComponent(row.k), {method: 'DELETE'})
        }
        return result
    } catch {
        return symbols
    }
}

/** The library with `symbol` replacing the one with the same key (or added at the end). */
const withSymbol = (library, symbol) =>
    library.some((existing) => existing.k === symbol.k) ? library.map((existing) => (existing.k === symbol.k ? symbol : existing)) : [...library, symbol]

export function useSymbolLibrary() {
    const [library, setLibraryState] = useState([]),
        [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
    const load = useCallback(async () => {
        setStatus('loading')
        const response = await fetchOk('/api/symbols')
        let symbols = null
        try {
            symbols = response ? await response.json() : null
        } catch {
            symbols = null
        }
        if (!Array.isArray(symbols)) return setStatus('error')
        setLibraryState(await migrateLegacyComponents(symbols))
        setStatus('ready')
    }, [])
    useEffect(() => {
        load()
    }, [load])
    // the answer of a call that returns one symbol: it replaces the one in the library; null when the backend did not accept the call
    const storeAnswer = async (response) => {
        if (!response) return null
        const symbol = await response.json()
        setLibraryState((current) => withSymbol(current, symbol))
        return symbol
    }
    // save, restore, makeStandard and template resolve to the symbol the backend answered with (null when it did not accept it);
    // remove and restoreAll to true/false
    const save = useCallback(async (symbol) => {
        // the connection is added as a parent by setLibrary: the backend has no such symbol
        const body = symbol.parents ? {...symbol, parents: symbol.parents.filter((key) => key !== CONNECTION_TYPE.k)} : symbol
        return storeAnswer(await fetchOk(symbolUrl(symbol.k), {method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body)}))
    }, [])
    const remove = useCallback(async (key) => {
        const response = await fetchOk(symbolUrl(key), {method: 'DELETE'})
        if (response) setLibraryState((current) => current.filter((symbol) => symbol.k !== key))
        return !!response
    }, [])
    const restore = useCallback(async (key) => storeAnswer(await fetchOk(symbolUrl(key) + '/restore', {method: 'POST'})), [])
    const makeStandard = useCallback(async (key) => storeAnswer(await fetchOk(symbolUrl(key) + '/standard', {method: 'POST'})), [])
    const restoreAll = useCallback(async () => {
        const response = await fetchOk('/api/symbols/restore', {method: 'POST'})
        if (!response) return false
        setLibraryState(await response.json())
        return true
    }, [])
    const template = useCallback(async () => {
        const response = await fetchOk('/api/symbols/template')
        return response ? response.json() : null
    }, [])
    return {library, status, reload: load, save, remove, restore, makeStandard, restoreAll, template}
}
