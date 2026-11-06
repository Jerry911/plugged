// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Saves the open project by itself, but sparingly, so the database and the connection are not worn out by every click:
// - only when something changed since the last save (the caller says so with isDirty()),
// - once the user has stopped changing things for AUTO_SAVE_IDLE, and while he keeps editing at the latest AUTO_SAVE_MAX_WAIT after the
//   first unsaved change, so at most one save per AUTO_SAVE_IDLE,
// - when the tab is hidden or the page closed (switching to another window, closing the laptop) with the changes still unsaved,
// - after a failed save it waits longer each time (AUTO_SAVE_RETRY) instead of trying again with every change.
import {useEffect, useRef} from 'react'

export const AUTO_SAVE_IDLE = 20_000
export const AUTO_SAVE_MAX_WAIT = 120_000
export const AUTO_SAVE_RETRY = [30_000, 60_000, 120_000, 300_000]

/**
 * enabled: whether the open project may be saved by itself; changed: a value that changes with every edit (the project); isDirty(): whether
 * there is something to save; save({keepalive}): stores it, resolves to true when it was stored.
 */
export function useAutoSave({enabled, changed, isDirty, save}) {
    const latest = useRef({})
    latest.current = {enabled, isDirty, save}
    const state = useRef({timer: null, firstChange: null, failures: 0, saving: false})

    const run = useRef(null)
    const schedule = (delay) => {
        clearTimeout(state.current.timer)
        state.current.timer = setTimeout(() => run.current(), delay)
    }
    run.current = async (options = {}) => {
        const current = state.current,
            {enabled: allowed, isDirty: dirty, save: store} = latest.current
        clearTimeout(current.timer)
        current.timer = null
        if (!allowed || current.saving) return
        if (!dirty()) {
            current.firstChange = null
            return
        }
        current.saving = true
        let stored = false
        try {
            stored = await store(options)
        } catch {
            stored = false
        }
        current.saving = false
        if (stored) {
            current.failures = 0
            current.firstChange = null
            // changed again while the save was on its way: that change gets its own turn
            if (latest.current.enabled && latest.current.isDirty()) {
                current.firstChange = Date.now()
                schedule(AUTO_SAVE_IDLE)
            }
        } else {
            current.failures++
            schedule(AUTO_SAVE_RETRY[Math.min(current.failures, AUTO_SAVE_RETRY.length) - 1])
        }
    }

    // every change: wait for a quiet moment, but not longer than AUTO_SAVE_MAX_WAIT since the first unsaved change
    useEffect(() => {
        const current = state.current
        if (!enabled) {
            clearTimeout(current.timer)
            Object.assign(current, {timer: null, firstChange: null, failures: 0})
            return
        }
        if (current.failures > 0 && current.timer) return // after a failure the retry keeps its own pace
        const now = Date.now()
        if (current.firstChange == null) current.firstChange = now
        schedule(Math.max(0, Math.min(AUTO_SAVE_IDLE, current.firstChange + AUTO_SAVE_MAX_WAIT - now)))
    }, [changed, enabled])

    // leaving the page or the tab: save what is left right away (keepalive: the request survives the page being closed)
    useEffect(() => {
        const onVisibility = () => document.visibilityState === 'hidden' && run.current({keepalive: true})
        const onPageHide = () => run.current({keepalive: true})
        document.addEventListener('visibilitychange', onVisibility)
        addEventListener('pagehide', onPageHide)
        return () => {
            document.removeEventListener('visibilitychange', onVisibility)
            removeEventListener('pagehide', onPageHide)
            clearTimeout(state.current.timer)
        }
    }, [])
}
