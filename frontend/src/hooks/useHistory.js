// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useCallback, useRef, useState} from 'react'

/** Changes less than MERGE_WINDOW_MS apart (typing, dragging) share one undo step; at most MAX_UNDO_STEPS steps are kept. */
export const MERGE_WINDOW_MS = 500,
    MAX_UNDO_STEPS = 100

/** The project state with undo / redo. setProject accepts a value or an updater function, like a React state setter. */
export function useHistory(initialProject) {
    const current = useRef(initialProject),
        undoStack = useRef([]),
        redoStack = useRef([]),
        lastChangeAt = useRef(0),
        [snapshot, setSnapshot] = useState({project: initialProject, canUndo: false, canRedo: false})
    const publish = () => setSnapshot({project: current.current, canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0})
    const setProject = useCallback((next) => {
        const value = typeof next === 'function' ? next(current.current) : next
        if (value === current.current) return
        const now = Date.now()
        if (now - lastChangeAt.current > MERGE_WINDOW_MS) {
            undoStack.current.push(current.current)
            if (undoStack.current.length > MAX_UNDO_STEPS) undoStack.current.shift()
        }
        lastChangeAt.current = now
        redoStack.current = []
        current.current = value
        publish()
    }, [])
    const undo = useCallback(() => {
        if (!undoStack.current.length) return
        redoStack.current.push(current.current)
        current.current = undoStack.current.pop()
        lastChangeAt.current = 0
        publish()
    }, [])
    const redo = useCallback(() => {
        if (!redoStack.current.length) return
        undoStack.current.push(current.current)
        current.current = redoStack.current.pop()
        lastChangeAt.current = 0
        publish()
    }, [])
    // a loaded or new project: the undo history starts over
    const reset = useCallback((project) => {
        current.current = project
        undoStack.current = []
        redoStack.current = []
        lastChangeAt.current = 0
        publish()
    }, [])
    return {project: snapshot.project, setProject, undo, redo, reset, canUndo: snapshot.canUndo, canRedo: snapshot.canRedo}
}
