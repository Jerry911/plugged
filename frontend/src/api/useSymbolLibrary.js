// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The symbol library of the user: the standard symbols, his own symbols and those of his groups. The backend owns it (GET /api/symbols):
// it defines and restores the standard drawings and stores the changes in the database. This hook only loads it and sends changes.
import {useCallback, useEffect, useState} from 'react'
import {fetchOk, JSON_HEADERS} from './http.js'
import {CONNECTION_TYPE} from '../symbols/symbolLibrary.js'

const symbolUrl = (key) => '/api/symbols/' + encodeURIComponent(key)

/** The library with `symbol` replacing the one with the same key (or added at the end). */
const withSymbol = (library, symbol) =>
    library.some((existing) => existing.k === symbol.k) ? library.map((existing) => (existing.k === symbol.k ? symbol : existing)) : [...library, symbol]

export function useSymbolLibrary() {
    const [library, setLibraryState] = useState([]),
        [groups, setGroups] = useState([]), // the groups the user can put a symbol in ([{id, name}])
        [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
    // the groups the user can put a symbol in; loaded again when Componenten opens (groups and members change under Beheer)
    const loadGroups = useCallback(async () => {
        try {
            const answer = await fetchOk('/api/symbols/groups'),
                list = answer ? await answer.json() : []
            setGroups(Array.isArray(list) ? list : [])
        } catch {
            setGroups([])
        }
    }, [])
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
        setLibraryState(symbols)
        setStatus('ready')
        await loadGroups()
    }, [loadGroups])
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
    return {library, groups, reloadGroups: loadGroups, status, reload: load, save, remove, restore, makeStandard, restoreAll, template}
}
