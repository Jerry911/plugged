// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The symbol library: the standard symbols, the ones the user edited and the ones the user made. The backend owns it (GET /api/symbols):
// it defines and restores the standard drawings and stores the changes in the database. This hook only loads it and sends changes.
import {useCallback, useEffect, useState} from 'react'

const JSON_H = {'Content-Type': 'application/json'},
    url = (k) => '/api/symbols/' + encodeURIComponent(k)
const call = async (u, o) => {
    try {
        const r = await fetch(u, o)
        return r.ok ? r : null
    } catch {
        return null
    }
}
// Components made before the symbols table existed live in /api/components (one JSON document per component). The own ones (custom:...)
// are copied into the symbols table once and the old rows are removed; the standard ones in there are obsolete.
const migrateLegacy = async (list) => {
    try {
        const r = await call('/api/components')
        if (!r) return list
        const rows = await r.json(),
            have = new Set(list.map((c) => c.k)),
            out = [...list]
        for (const row of rows) {
            let c = null
            try {
                c = row.k.startsWith('custom:') && !have.has(row.k) ? JSON.parse(row.json) : null
            } catch {
                c = null
            }
            if (c) {
                const {name, cat, parents, place, shapes} = c,
                    s = await call(url(row.k), {method: 'PUT', headers: JSON_H, body: JSON.stringify({k: row.k, name, cat, parents, place, shapes})})
                if (!s) continue
                out.push(await s.json())
            }
            await call('/api/components/' + encodeURIComponent(row.k), {method: 'DELETE'})
        }
        return out
    } catch {
        return list
    }
}
const put = (l, s) => (l.some((x) => x.k === s.k) ? l.map((x) => (x.k === s.k ? s : x)) : [...l, s])

export function useLibrary() {
    const [lib, setLib] = useState([]),
        [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
    const load = useCallback(async () => {
        setStatus('loading')
        const r = await call('/api/symbols')
        let list = null
        try {
            list = r ? await r.json() : null
        } catch {
            list = null
        }
        if (!Array.isArray(list)) return setStatus('error')
        setLib(await migrateLegacy(list))
        setStatus('ready')
    }, [])
    useEffect(() => {
        load()
    }, [load])
    // save, reset, makeStandard and template resolve to the symbol the backend answered with (null when it did not accept it); remove and restoreAll to true/false
    const save = useCallback(async (c) => {
        const r = await call(url(c.k), {method: 'PUT', headers: JSON_H, body: JSON.stringify(c.parents ? {...c, parents: c.parents.filter((k) => k !== 'aansluiting')} : c)}) // 'aansluiting' is added by setLibrary, the backend has no such symbol
        if (!r) return null
        const s = await r.json()
        setLib((l) => put(l, s))
        return s
    }, [])
    const remove = useCallback(async (k) => {
        const r = await call(url(k), {method: 'DELETE'})
        if (r) setLib((l) => l.filter((x) => x.k !== k))
        return !!r
    }, [])
    const reset = useCallback(async (k) => {
        const r = await call(url(k) + '/restore', {method: 'POST'})
        if (!r) return null
        const s = await r.json()
        setLib((l) => put(l, s))
        return s
    }, [])
    const makeStandard = useCallback(async (k) => {
        const r = await call(url(k) + '/standard', {method: 'POST'})
        if (!r) return null
        const s = await r.json()
        setLib((l) => put(l, s))
        return s
    }, [])
    const restoreAll = useCallback(async () => {
        const r = await call('/api/symbols/restore', {method: 'POST'})
        if (!r) return false
        setLib(await r.json())
        return true
    }, [])
    const template = useCallback(async () => {
        const r = await call('/api/symbols/template')
        return r ? r.json() : null
    }, [])
    return {lib, status, reload: load, save, remove, reset, makeStandard, restoreAll, template}
}