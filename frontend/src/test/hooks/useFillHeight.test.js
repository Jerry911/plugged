// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, expect, test, vi} from 'vitest'
import {NARROW_SCREEN, roomBelow, useFillHeight} from '../../hooks/useFillHeight.js'

// a panel whose top is at `top` px in the window
const panel = (top) => {
    const element = document.createElement('div')
    element.getBoundingClientRect = () => ({top})
    return element
}
const size = (width, height) => {
    window.innerWidth = width
    window.innerHeight = height
}
let frames
beforeEach(() => {
    size(1400, 900)
    frames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback))
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})
afterEach(() => size(1024, 768))
const nextFrame = () => act(() => frames.splice(0).forEach((callback) => callback()))

test('the room below an element: to the bottom of the window, a margin kept free', () => {
    expect(roomBelow(panel(100), 10)).toBe(790)
    expect(roomBelow(panel(1000), 10)).toBe(0)
})

test('a panel reaches to the bottom of the window and follows a scroll (sticky panel) and a resize; on a narrow screen it is left alone', () => {
    const element = panel(104)
    const {unmount} = renderHook(() => useFillHeight({current: element}))
    expect(element.style.height).toBe('786px')
    element.getBoundingClientRect = () => ({top: 10})
    window.dispatchEvent(new Event('scroll'))
    nextFrame()
    expect(element.style.height).toBe('880px')
    size(NARROW_SCREEN, 900)
    window.dispatchEvent(new Event('resize'))
    nextFrame()
    expect(element.style.height).toBe('')
    unmount()
    size(1400, 600)
    window.dispatchEvent(new Event('resize'))
    expect(frames).toHaveLength(0)
    // no element (not rendered): nothing happens
    renderHook(() => useFillHeight({current: null}))
})

