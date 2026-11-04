// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useRef} from 'react'

const FORM_ELEMENTS = /INPUT|TEXTAREA|SELECT|BUTTON/
// a pointer that moves less than this (px) is a click, not a drag
const DRAG_THRESHOLD = 4

/**
 * Scroll container that can also be panned by dragging.
 * alwaysPan: plain left-drag pans (use where the content has no drag interactions).
 * otherwise: pan with the middle mouse button or Space + left-drag, so drawing tools keep working.
 * rightPan: also pan while holding the right mouse button (a plain right click still reaches the content).
 */
export default function ZoomPane({zoom, always: alwaysPan = false, rightPan = false, style, children}) {
    const container = useRef(null),
        drag = useRef(null),
        spaceHeld = useRef(false),
        swallowClick = useRef(false),
        suppressContextMenu = useRef(false),
        canPan = zoom > 1
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.code === 'Space' && !FORM_ELEMENTS.test(event.target.tagName ?? '')) spaceHeld.current = true
        }
        const onKeyUp = (event) => {
            if (event.code === 'Space') spaceHeld.current = false
        }
        addEventListener('keydown', onKeyDown)
        addEventListener('keyup', onKeyUp)
        return () => {
            removeEventListener('keydown', onKeyDown)
            removeEventListener('keyup', onKeyUp)
        }
    }, [])
    const onPointerDown = (event) => {
        const element = container.current
        if (!canPan || !element || FORM_ELEMENTS.test(event.target.tagName ?? '')) return
        const middleButton = event.button === 1,
            rightButton = event.button === 2 && rightPan,
            leftButton = event.button === 0 && (alwaysPan || spaceHeld.current)
        if (!middleButton && !rightButton && !leftButton) return
        if (!alwaysPan || middleButton || rightButton) {
            event.preventDefault()
            event.stopPropagation() // keep drawing tools from starting
        }
        drag.current = {x: event.clientX, y: event.clientY, scrollLeft: element.scrollLeft, scrollTop: element.scrollTop, moved: false}
        const onMove = (moveEvent) => {
            const current = drag.current
            if (!current) return
            const dx = moveEvent.clientX - current.x,
                dy = moveEvent.clientY - current.y
            if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
            current.moved = true
            element.style.cursor = 'grabbing'
            element.style.userSelect = 'none'
            element.scrollLeft = current.scrollLeft - dx
            element.scrollTop = current.scrollTop - dy
        }
        const onUp = () => {
            removeEventListener('pointermove', onMove)
            removeEventListener('pointerup', onUp)
            removeEventListener('pointercancel', onUp)
            if (drag.current?.moved) {
                swallowClick.current = true // a drag must not count as a click underneath
                setTimeout(() => (swallowClick.current = false), 0)
                suppressContextMenu.current = true // ...nor open/handle a context menu when the right button is released
                setTimeout(() => (suppressContextMenu.current = false), 100)
            }
            drag.current = null
            element.style.cursor = alwaysPan ? 'grab' : ''
            element.style.userSelect = ''
        }
        addEventListener('pointermove', onMove)
        addEventListener('pointerup', onUp)
        addEventListener('pointercancel', onUp)
    }
    return (
        <div
            ref={container}
            className="zoomscroll"
            style={{overflow: 'auto', maxHeight: canPan ? '82vh' : 'none', ...(alwaysPan && canPan ? {cursor: 'grab'} : null), ...style}}
            onPointerDownCapture={onPointerDown}
            onClickCapture={(event) => {
                if (swallowClick.current) event.stopPropagation()
            }}
            onContextMenuCapture={(event) => {
                if (rightPan && (suppressContextMenu.current || drag.current?.moved)) {
                    event.preventDefault()
                    event.stopPropagation()
                }
            }}
            onAuxClick={(event) => event.preventDefault()}
        >
            {children}
        </div>
    )
}
