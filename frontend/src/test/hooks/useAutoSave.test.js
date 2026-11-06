// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, expect, test, vi} from 'vitest'
import {AUTO_SAVE_IDLE, AUTO_SAVE_MAX_WAIT, AUTO_SAVE_RETRY, useAutoSave} from '../../hooks/useAutoSave.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// a project that is edited: `edit()` makes a change, a save stores what was there at that moment
const mount = ({enabled = true, answers = []} = {}) => {
    const document = {version: 0, saved: 0},
        save = vi.fn(async () => {
            const answer = answers.length ? answers.shift() : true
            if (answer === 'throw') throw new Error('offline')
            if (answer) document.saved = save.version
            return answer
        })
    const hook = renderHook((props) => useAutoSave(props), {
        initialProps: {enabled, changed: 0, isDirty: () => document.version !== document.saved, save},
    })
    const rerender = (props = {}) => {
        save.version = document.version
        hook.rerender({enabled, changed: document.version, isDirty: () => document.version !== document.saved, save, ...props})
    }
    const edit = () => {
        document.version++
        rerender()
    }
    return {save, edit, rerender, document, hook}
}
const wait = (ms) => act(() => vi.advanceTimersByTimeAsync(ms))

test('nothing changed: nothing is saved, however long the project stays open', async () => {
    const {save} = mount()
    await wait(AUTO_SAVE_MAX_WAIT * 3)
    expect(save).not.toHaveBeenCalled()
})

test('a change is saved once the user has stopped for a while, a burst of changes gives one save', async () => {
    const {save, edit} = mount()
    edit()
    await wait(AUTO_SAVE_IDLE / 2)
    edit()
    edit()
    await wait(AUTO_SAVE_IDLE - 1)
    expect(save).not.toHaveBeenCalled()
    await wait(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({})
    // saved: no second save without a new change
    await wait(AUTO_SAVE_MAX_WAIT)
    expect(save).toHaveBeenCalledTimes(1)
})

test('editing without a pause is still saved at the latest after AUTO_SAVE_MAX_WAIT, and not more often than that', async () => {
    const {save, edit} = mount()
    const step = AUTO_SAVE_IDLE / 4
    for (let time = 0; time < AUTO_SAVE_MAX_WAIT; time += step) {
        edit()
        await wait(step)
    }
    expect(save).toHaveBeenCalledTimes(1)
    for (let time = 0; time < AUTO_SAVE_MAX_WAIT - step; time += step) {
        edit()
        await wait(step)
    }
    expect(save).toHaveBeenCalledTimes(1)
    await wait(step)
    expect(save).toHaveBeenCalledTimes(2)
})

test('a project that may not be saved by itself (never stored, or of somebody else) is left alone', async () => {
    const {save, edit, rerender} = mount({enabled: false})
    edit()
    await wait(AUTO_SAVE_MAX_WAIT)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(save).not.toHaveBeenCalled()
    // it becomes allowed (saved by hand): from then on changes are saved
    rerender({enabled: true})
    await wait(AUTO_SAVE_IDLE)
    expect(save).toHaveBeenCalledTimes(1)
})

test('a failed save is tried again later and later, not with every change', async () => {
    const {save, edit} = mount({answers: [false, 'throw', false]})
    edit()
    await wait(AUTO_SAVE_IDLE)
    expect(save).toHaveBeenCalledTimes(1)
    // changes during the wait do not bring the retry forward
    edit()
    await wait(AUTO_SAVE_RETRY[0] - 1)
    expect(save).toHaveBeenCalledTimes(1)
    await wait(1)
    expect(save).toHaveBeenCalledTimes(2) // throws
    await wait(AUTO_SAVE_RETRY[1])
    expect(save).toHaveBeenCalledTimes(3)
    await wait(AUTO_SAVE_RETRY[2] - 1)
    expect(save).toHaveBeenCalledTimes(3)
    await wait(1)
    expect(save).toHaveBeenCalledTimes(4) // stored again: back to the normal pace
    edit()
    await wait(AUTO_SAVE_IDLE)
    expect(save).toHaveBeenCalledTimes(5)
})

test('the longest wait after failures stays at the last step', async () => {
    const {save, edit} = mount({answers: Array(AUTO_SAVE_RETRY.length + 2).fill(false)})
    edit()
    await wait(AUTO_SAVE_IDLE)
    for (const delay of AUTO_SAVE_RETRY) await wait(delay)
    const count = save.mock.calls.length
    await wait(AUTO_SAVE_RETRY.at(-1))
    expect(save.mock.calls.length).toBe(count + 1)
})

test('a change while the save is on its way gets a save of its own', async () => {
    let finish
    const {save, edit, document: project} = mount()
    save.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = () => {
                    project.saved = 1
                    resolve(true)
                }
            }),
    )
    edit()
    await wait(AUTO_SAVE_IDLE)
    expect(save).toHaveBeenCalledTimes(1)
    edit() // version 2, while 1 is being stored
    // a second turn while the first save is still busy does not start another one
    await wait(AUTO_SAVE_IDLE)
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    await wait(AUTO_SAVE_IDLE)
    expect(save).toHaveBeenCalledTimes(2)
})

test('hiding the tab or leaving the page saves what is left right away, with keepalive', async () => {
    const {save, edit, hook} = mount()
    edit()
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(save).not.toHaveBeenCalled()
    visibility.mockReturnValue('hidden')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(save).toHaveBeenCalledWith({keepalive: true})
    // already saved: the timer that was running does nothing more
    await wait(AUTO_SAVE_MAX_WAIT)
    expect(save).toHaveBeenCalledTimes(1)
    edit()
    await act(async () => window.dispatchEvent(new Event('pagehide')))
    expect(save).toHaveBeenCalledTimes(2)
    visibility.mockRestore()
    // unmounted: nothing listens or waits any more
    edit()
    hook.unmount()
    await wait(AUTO_SAVE_MAX_WAIT)
    window.dispatchEvent(new Event('pagehide'))
    expect(save).toHaveBeenCalledTimes(2)
})
