// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useLayoutEffect, useRef} from 'react'
import {ZOOM_LEVELS} from './ZoomControls.jsx'

const FORM_ELEMENTS = /INPUT|TEXTAREA|SELECT|BUTTON/
// a pointer that moves less than this (px) is a click, not a drag
const DRAG_THRESHOLD = 4

/**
 * Scroll container that can also be panned by dragging.
 * alwaysPan: plain left-drag pans (use where the content has no drag interactions).
 * otherwise: pan with the middle mouse button or Space + left-drag, so drawing tools keep working.
 * rightPan: also pan while holding the right mouse button (a plain right click still reaches the content).
 * On a touch screen (a tablet) one finger is for the drawing tools; two fingers pan, and pinch steps through ZOOM_LEVELS when `onZoom`
 * (the setter of the zoom) is given, keeping the point between the fingers in its place.
 */
export default function ZoomPane({zoom, always: alwaysPan = false, rightPan = false, onZoom, style, children}) {
    const container = useRef(null),
        // the fingers on the pane (pointerId -> position) and the two-finger gesture they make
        touches = useRef(new Map()),
        gesture = useRef(null),
        // where the zoom of a pinch has to keep its point: {x, y} as a fraction of the content, {left, top} in the pane
        anchor = useRef(null),
        latest = useRef({zoom, onZoom}),
        drag = useRef(null),
        spaceHeld = useRef(false),
        swallowClick = useRef(false),
        suppressContextMenu = useRef(false),
        canPan = zoom > 1
    latest.current = {zoom, onZoom}
    // two fingers: pan, and pinch to zoom. Listened to on the window before anything else (capture), so while two fingers are down the
    // drawing does not get their moves (no wall, no dragged symbol, no selection box), nor the click when they are lifted
    useEffect(() => {
        const middle = () => {
            const [a, b] = [...touches.current.values()]
            return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y)}
        }
        const onDown = (event) => {
            const element = container.current
            if (event.pointerType !== 'touch' || !element?.contains(event.target)) return
            touches.current.set(event.pointerId, {x: event.clientX, y: event.clientY})
            if (touches.current.size !== 2) return
            event.stopPropagation()
            const at = middle()
            gesture.current = {start: at, scrollLeft: element.scrollLeft, scrollTop: element.scrollTop, zoom: latest.current.zoom}
            swallowClick.current = true
        }
        const onMove = (event) => {
            if (!touches.current.has(event.pointerId)) return
            touches.current.set(event.pointerId, {x: event.clientX, y: event.clientY})
            const current = gesture.current,
                element = container.current
            if (!current || touches.current.size < 2 || !element) return
            event.stopPropagation()
            const at = middle()
            element.scrollLeft = current.scrollLeft - (at.x - current.start.x)
            element.scrollTop = current.scrollTop - (at.y - current.start.y)
            const {zoom: shown, onZoom: setZoom} = latest.current
            if (!setZoom || !current.start.distance) return
            // the level nearest to how far the fingers spread since they came down
            const wanted = current.zoom * (at.distance / current.start.distance),
                level = ZOOM_LEVELS.reduce((best, candidate) => (Math.abs(Math.log(candidate / wanted)) < Math.abs(Math.log(best / wanted)) ? candidate : best))
            if (level === shown) return
            const box = element.getBoundingClientRect(),
                left = at.x - box.left,
                top = at.y - box.top
            anchor.current = {x: (element.scrollLeft + left) / element.scrollWidth, y: (element.scrollTop + top) / element.scrollHeight, left, top}
            setZoom(level)
        }
        const onUp = (event) => {
            if (!touches.current.delete(event.pointerId)) return
            if (gesture.current && touches.current.size < 2) {
                gesture.current = null
                // the click of the finger that is lifted last must not reach the drawing either
                setTimeout(() => (swallowClick.current = false), 350)
            }
        }
        addEventListener('pointerdown', onDown, true)
        addEventListener('pointermove', onMove, true)
        addEventListener('pointerup', onUp, true)
        addEventListener('pointercancel', onUp, true)
        return () => {
            removeEventListener('pointerdown', onDown, true)
            removeEventListener('pointermove', onMove, true)
            removeEventListener('pointerup', onUp, true)
            removeEventListener('pointercancel', onUp, true)
        }
    }, [])
    // after a pinch changed the zoom: the point between the fingers stays where it was, and the pan goes on from there
    useLayoutEffect(() => {
        const element = container.current,
            point = anchor.current
        if (!element || !point) return
        anchor.current = null
        element.scrollLeft = point.x * element.scrollWidth - point.left
        element.scrollTop = point.y * element.scrollHeight - point.top
        const current = gesture.current
        if (current && touches.current.size === 2) {
            const [a, b] = [...touches.current.values()]
            current.start = {...current.start, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}
            current.scrollLeft = element.scrollLeft
            current.scrollTop = element.scrollTop
        }
    }, [zoom])
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
