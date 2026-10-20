// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The component library: the standard components (defaultComponents.js) plus everything the user edited or created,
// persisted per component in the H2 database through /api/components. Without a backend the defaults still work (in memory only).
import {useCallback, useEffect, useState} from 'react'
import {BUILTIN as DEFAULTS} from './symbols'

const JSON_H = {'Content-Type': 'application/json'}
export const mergeLibrary = (stored = []) => {
    const by = new Map(stored.map((c) => [c.k, c])),
        keys = new Set(DEFAULTS.map((d) => d.k)),
        extra = stored.filter((c) => !keys.has(c.k)).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return [...DEFAULTS.map((d) => (by.has(d.k) && by.get(d.k).v === d.v ? {...d, ...by.get(d.k)} : d)), ...extra]
}
const parse = (rows) =>
    rows.flatMap((r) => {
        try {
            return [JSON.parse(r.json)]
        } catch {
            return []
        }
    })
export function useLibrary() {
    const [lib, setLib] = useState(DEFAULTS)
    useEffect(() => {
        let gone = false
        ;(async () => {
            try {
                const r = await fetch('/api/components')
                if (!r.ok) return
                const stored = parse(await r.json()),
                    have = new Set(stored.map((c) => c.k)),
                    missing = DEFAULTS.filter((d) => !have.has(d.k))
                if (missing.length)
                    await fetch('/api/components', {method: 'PUT', headers: JSON_H, body: JSON.stringify(missing.map((c) => ({k: c.k, json: JSON.stringify(c)})))})
                if (!gone) setLib(mergeLibrary(stored))
            } catch {
                // no backend (or an unexpected answer): keep working with the standard components in memory
            }
        })()
        return () => {
            gone = true
        }
    }, [])
    // every action resolves to true when the database accepted it
    const save = useCallback(async (c) => {
        setLib((l) => (l.some((x) => x.k === c.k) ? l.map((x) => (x.k === c.k ? c : x)) : [...l, c]))
        try {
            return (await fetch('/api/components/' + encodeURIComponent(c.k), {method: 'PUT', headers: JSON_H, body: JSON.stringify(c)})).ok
        } catch {
            return false
        }
    }, [])
    const remove = useCallback(async (k) => {
        setLib((l) => l.filter((x) => x.k !== k))
        try {
            return (await fetch('/api/components/' + encodeURIComponent(k), {method: 'DELETE'})).ok
        } catch {
            return false
        }
    }, [])
    const reset = useCallback((k) => save(DEFAULTS.find((d) => d.k === k)), [save])
    return {lib, save, remove, reset}
}
