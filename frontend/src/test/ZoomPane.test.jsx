// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, screen} from '@testing-library/react'
import ZoomPane from '../ZoomPane.jsx'

const mount = (props = {}, onClick = vi.fn(), onDown = vi.fn()) => {
    const r = render(
        <ZoomPane zoom={2} {...props}>
            <div data-testid="inner" onClick={onClick} onPointerDown={onDown}>
                <input data-testid="field" />
                <button>btn</button>
            </div>
        </ZoomPane>,
    )
    const pane = r.container.querySelector('.zoomscroll')
    pane.scrollLeft = 200
    pane.scrollTop = 50
    return {...r, pane, onClick, onDown}
}
const drag = (el, {button = 0, from = [100, 100], to = [60, 80]} = {}) => {
    fireEvent.pointerDown(el, {button, clientX: from[0], clientY: from[1]})
    fireEvent.pointerMove(window, {clientX: to[0], clientY: to[1]})
    fireEvent.pointerUp(window)
}

test('renders children in a scroll container; height is capped only when zoomed in', () => {
    const {pane, rerender} = mount()
    expect(screen.getByTestId('inner')).toBeInTheDocument()
    expect(pane.style.overflow).toBe('auto')
    expect(pane.style.maxHeight).toBe('82vh')
    rerender(<ZoomPane zoom={1}>x</ZoomPane>)
    expect(pane.style.maxHeight).toBe('none')
})

test('always: left-drag pans, shows a grab cursor and resets cursor afterwards', () => {
    const {pane} = mount({always: true})
    expect(pane.style.cursor).toBe('grab')
    fireEvent.pointerDown(pane, {button: 0, clientX: 100, clientY: 100})
    fireEvent.pointerMove(window, {clientX: 60, clientY: 80})
    expect(pane.style.cursor).toBe('grabbing')
    expect(pane.style.userSelect).toBe('none')
    fireEvent.pointerUp(window)
    expect(pane.style.cursor).toBe('grab')
    expect(pane.style.userSelect).toBe('')
    expect(pane.scrollLeft).toBe(240)
    expect(pane.scrollTop).toBe(70)
})

test('does nothing at zoom 1 or below', () => {
    const {pane} = mount({always: true, zoom: 1})
    expect(pane.style.cursor).toBe('')
    drag(pane)
    expect(pane.scrollLeft).toBe(200)
    expect(pane.scrollTop).toBe(50)
})

test('moves under 4px are ignored, so a plain click still works', () => {
    const {pane, onClick} = mount({always: true})
    drag(pane, {to: [102, 101]})
    expect(pane.scrollLeft).toBe(200)
    fireEvent.click(screen.getByTestId('inner'))
    expect(onClick).toHaveBeenCalledTimes(1)
})

test('a drag does not trigger a click underneath; later clicks work again', async () => {
    const {pane, onClick} = mount({always: true})
    drag(pane)
    fireEvent.click(screen.getByTestId('inner'))
    expect(onClick).not.toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 5))
    fireEvent.click(screen.getByTestId('inner'))
    expect(onClick).toHaveBeenCalledTimes(1)
})

test('always: children still receive the pointer down (so they can be selected)', () => {
    const {pane, onDown} = mount({always: true})
    drag(screen.getByTestId('inner'))
    expect(onDown).toHaveBeenCalledTimes(1)
    expect(pane.scrollLeft).toBe(240)
})

test('inputs and buttons never start a pan', () => {
    const {pane} = mount({always: true})
    drag(screen.getByTestId('field'))
    drag(screen.getByText('btn'))
    expect(pane.scrollLeft).toBe(200)
})

test('without always: plain left-drag does not pan and children get the event', () => {
    const {pane, onDown} = mount()
    drag(screen.getByTestId('inner'))
    expect(pane.scrollLeft).toBe(200)
    expect(onDown).toHaveBeenCalledTimes(1)
})

test('middle mouse button pans and keeps the event from children', () => {
    const {pane, onDown} = mount()
    drag(screen.getByTestId('inner'), {button: 1})
    expect(pane.scrollLeft).toBe(240)
    expect(pane.scrollTop).toBe(70)
    expect(onDown).not.toHaveBeenCalled()
    fireEvent(pane, new MouseEvent('auxclick', {bubbles: true, cancelable: true, button: 1}))
})

test('Space + left-drag pans; releasing Space stops it', () => {
    const {pane, onDown} = mount()
    fireEvent.keyDown(window, {code: 'Space'})
    drag(screen.getByTestId('inner'))
    expect(pane.scrollLeft).toBe(240)
    expect(onDown).not.toHaveBeenCalled()
    fireEvent.keyUp(window, {code: 'Space'})
    drag(screen.getByTestId('inner'))
    expect(pane.scrollLeft).toBe(240)
    expect(onDown).toHaveBeenCalledTimes(1)
})

test('Space typed in a form field does not arm panning', () => {
    const {pane} = mount()
    fireEvent.keyDown(screen.getByTestId('field'), {code: 'Space'})
    drag(screen.getByTestId('inner'))
    expect(pane.scrollLeft).toBe(200)
})

test('pointercancel ends the pan; moves after it are ignored', () => {
    const {pane} = mount({always: true})
    fireEvent.pointerDown(pane, {button: 0, clientX: 100, clientY: 100})
    fireEvent.pointerMove(window, {clientX: 90, clientY: 100})
    fireEvent.pointerCancel(window)
    fireEvent.pointerMove(window, {clientX: 0, clientY: 0})
    expect(pane.scrollLeft).toBe(210)
})

test('extra style is merged and listeners are removed on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener')
    const {unmount} = mount({style: {border: '1px solid red'}})
    expect(screen.getByTestId('inner').parentElement.style.border).toBe('1px solid red')
    unmount()
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(spy).toHaveBeenCalledWith('keyup', expect.any(Function))
})