// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The connection and the saves that wait for it (offline/offlineStore.js, offline/sync.js): {online, pending, keep(save), sync()}.
// The waiting saves are sent at once, when the browser says the connection is back, and every SYNC_INTERVAL while some are waiting.
import {useCallback, useEffect, useRef, useState} from 'react'
import {keepSave, pendingSaves} from '../offline/offlineStore.js'
import {syncPending} from '../offline/sync.js'
import {useTranslation} from '../i18n/I18nProvider.jsx'

export const SYNC_INTERVAL = 30_000

export function useOffline({userId, onReport}) {
    const {t, locale} = useTranslation()
    const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)),
        [pending, setPending] = useState(0)
    const latest = useRef({onReport, t, locale})
    latest.current = {onReport, t, locale}
    const sync = useCallback(async () => {
        const waiting = await syncPending(userId, {
            report: (result) => {
                if (result.outcome !== 'refused') setOnline(true)
                latest.current.onReport?.(result)
            },
            translate: (key, values) => latest.current.t(key, values),
            locale: latest.current.locale,
        })
        setPending(waiting)
        return waiting
    }, [userId])
    const keep = useCallback(
        async (save) => {
            const entry = await keepSave({...save, userId})
            setOnline(false)
            setPending((await pendingSaves(userId)).length)
            return entry
        },
        [userId],
    )
    useEffect(() => {
        sync()
        const wentOnline = () => {
                setOnline(true)
                sync()
            },
            wentOffline = () => setOnline(false)
        addEventListener('online', wentOnline)
        addEventListener('offline', wentOffline)
        return () => {
            removeEventListener('online', wentOnline)
            removeEventListener('offline', wentOffline)
        }
    }, [sync])
    useEffect(() => {
        if (!pending) return
        const timer = setInterval(sync, SYNC_INTERVAL)
        return () => clearInterval(timer)
    }, [pending, sync])
    return {online, pending, keep, sync}
}
