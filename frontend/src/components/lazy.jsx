// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Parts of the editor that are not on the first screen (the offerte, the materials list, the QR code, the symbol editor, the info page, the
// account page ...) and the libraries only they use (jsPDF, the zip and QR code libraries) are separate files: the first page opens faster.
// After the start they are fetched in the background (preloadAll, called by the editor once it is shown), so a click later rarely waits.
import {useEffect, useState} from 'react'

const all = []

/**
 * A component loaded from `load` (a dynamic import resolving to the component) when it is first shown. Until it is there it shows nothing;
 * once loaded it renders at once. `Component.preload()` fetches it beforehand.
 */
export function lazyComponent(load) {
    let Loaded = null,
        loading = null
    const preload = () =>
        (loading ??= load().then((component) => {
            Loaded = component
            return component
        }))
    function Lazy(props) {
        const [, setReady] = useState(Loaded != null)
        useEffect(() => {
            if (Loaded) return
            let current = true
            preload().then(() => current && setReady(true))
            return () => {
                current = false
            }
        }, [])
        return Loaded ? <Loaded {...props} /> : null
    }
    Lazy.preload = preload
    all.push(preload)
    return Lazy
}

/** Fetches every lazy component (in the background after the start; the tests wait for it so the components render at once). */
export const preloadAll = () => Promise.all(all.map((preload) => preload().catch(() => null)))
