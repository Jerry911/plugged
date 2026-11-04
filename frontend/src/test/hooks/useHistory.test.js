// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, renderHook} from '@testing-library/react'
import {MAX_UNDO_STEPS, MERGE_WINDOW_MS, useHistory} from '../../hooks/useHistory.js'

let t
beforeEach(() => {
    t = 1e6
    vi.spyOn(Date, 'now').mockImplementation(() => t)
})
const step = () => {
    t += MERGE_WINDOW_MS + 1
}
const hook = () => renderHook(() => useHistory({v: 0}))
test('starts empty; undo/redo are no-ops', () => {
    const {result} = hook()
    expect(result.current).toMatchObject({project: {v: 0}, canUndo: false, canRedo: false})
    act(() => {
        result.current.undo()
        result.current.redo()
    })
    expect(result.current.project).toEqual({v: 0})
})
test('undo and redo walk through states', () => {
    const {result} = hook()
    act(() => result.current.setProject({v: 1}))
    step()
    act(() => result.current.setProject({v: 2}))
    expect(result.current.canUndo).toBe(true)
    act(() => result.current.undo())
    expect(result.current.project.v).toBe(1)
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.undo())
    expect(result.current.project.v).toBe(0)
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.redo())
    act(() => result.current.redo())
    expect(result.current.project.v).toBe(2)
    expect(result.current.canRedo).toBe(false)
})
test('rapid changes (typing, dragging) form one undo step', () => {
    const {result} = hook()
    ;[1, 2, 3].forEach((v) => {
        t += 50
        act(() => result.current.setProject({v}))
    })
    act(() => result.current.undo())
    expect(result.current.project.v).toBe(0)
    step()
    act(() => result.current.setProject({v: 5}))
    step()
    act(() => result.current.setProject({v: 6}))
    act(() => result.current.undo())
    expect(result.current.project.v).toBe(5)
})
test('a change right after an undo is its own step', () => {
    const {result} = hook()
    act(() => result.current.setProject({v: 1}))
    step()
    act(() => result.current.setProject({v: 2}))
    act(() => result.current.undo())
    act(() => result.current.setProject({v: 9}))
    act(() => result.current.undo())
    expect(result.current.project.v).toBe(1)
})
test('a new change clears the redo stack', () => {
    const {result} = hook()
    act(() => result.current.setProject({v: 1}))
    act(() => result.current.undo())
    expect(result.current.canRedo).toBe(true)
    step()
    act(() => result.current.setProject({v: 7}))
    expect(result.current.canRedo).toBe(false)
})
test('functional updates and identical values', () => {
    const {result} = hook()
    act(() => result.current.setProject((p) => ({v: p.v + 1})))
    expect(result.current.project.v).toBe(1)
    const same = result.current.project
    step()
    act(() => result.current.setProject(same))
    act(() => result.current.undo())
    expect(result.current.project.v).toBe(0)
})
test('reset replaces state and clears history', () => {
    const {result} = hook()
    act(() => result.current.setProject({v: 1}))
    act(() => result.current.reset({v: 42}))
    expect(result.current).toMatchObject({project: {v: 42}, canUndo: false, canRedo: false})
})
test('history is capped', () => {
    const {result} = hook()
    for (let i = 1; i <= MAX_UNDO_STEPS + 10; i++) {
        step()
        act(() => result.current.setProject({v: i}))
    }
    let n = 0
    while (result.current.canUndo) {
        act(() => result.current.undo())
        n++
    }
    expect(n).toBe(MAX_UNDO_STEPS)
})
