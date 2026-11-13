// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Working together on a shared project: while a stored project is open, the editor tells the server so every PRESENCE_INTERVAL (a
// heartbeat, with whether it has unsaved changes) and hears back who else has the project open and which version the database has.
// A newer version saved by somebody else goes to `onNewerVersion(answer)`: App.jsx loads it right away when there is nothing unsaved
// (so you follow the work of the others), or offers it when there is.
import {useEffect, useRef, useState} from 'react'
import {knownVersion, leavePresence, reportPresence, versionNumber} from '../api/projectApi.js'

export const PRESENCE_INTERVAL = 10_000

/**
 * `projectId` the stored project that is open (null: none, nothing is reported); `isDirty()` true when it has unsaved changes. Answers the
 * others who have it open ([{name, editing, since, me}]).
 */
export function usePresence({projectId, isDirty, onNewerVersion, interval = PRESENCE_INTERVAL}) {
    const [others, setOthers] = useState([])
    const latest = useRef({isDirty, onNewerVersion})
    latest.current = {isDirty, onNewerVersion}
    useEffect(() => {
        setOthers([])
        if (projectId == null) return
        let live = true,
            timer = null
        const beat = async () => {
            const answer = await reportPresence(projectId, latest.current.isDirty())
            if (!live) return
            if (answer) {
                setOthers(Array.isArray(answer.others) ? answer.others : [])
                const known = versionNumber(knownVersion(projectId))
                // our own save that is still under way is no news; a save of somebody else (or of another window of ours) is
                if (known != null && answer.version > known && !(answer.savedByMe && latest.current.isDirty())) latest.current.onNewerVersion(answer)
            }
            timer = setTimeout(beat, interval)
        }
        beat()
        const onLeave = () => leavePresence(projectId)
        addEventListener('pagehide', onLeave)
        return () => {
            live = false
            clearTimeout(timer)
            removeEventListener('pagehide', onLeave)
            leavePresence(projectId)
        }
    }, [projectId, interval])
    return others
}
