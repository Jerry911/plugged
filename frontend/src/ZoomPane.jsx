// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useRef} from 'react'

const FORM = /INPUT|TEXTAREA|SELECT|BUTTON/
/**
 * Scroll container that can also be panned by dragging.
 * always: plain left-drag pans (use where the content has no drag interactions).
 * otherwise: pan with the middle mouse button or Space + left-drag, so drawing tools keep working.
 * rightPan: also pan while holding the right mouse button (a plain right click still reaches the content).
 */
export default function ZoomPane({zoom, always = false, rightPan = false, style, children}) {
    const ref = useRef(null),
        drag = useRef(null),
        space = useRef(false),
        swallow = useRef(false),
        noMenu = useRef(false),
        can = zoom > 1
    useEffect(() => {
        const kd = (e) => {
            if (e.code === 'Space' && !FORM.test(e.target.tagName ?? '')) space.current = true
        }
        const ku = (e) => {
            if (e.code === 'Space') space.current = false
        }
        addEventListener('keydown', kd)
        addEventListener('keyup', ku)
        return () => {
            removeEventListener('keydown', kd)
            removeEventListener('keyup', ku)
        }
    }, [])
    const down = (e) => {
        const el = ref.current
        if (!can || !el || FORM.test(e.target.tagName ?? '')) return
        const mid = e.button === 1,
            right = e.button === 2 && rightPan,
            left = e.button === 0 && (always || space.current)
        if (!mid && !right && !left) return
        if (!always || mid || right) {
            e.preventDefault()
            e.stopPropagation() // keep drawing tools from starting
        }
        drag.current = {x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop, moved: false}
        const move = (m) => {
            const d = drag.current
            if (!d) return
            const dx = m.clientX - d.x,
                dy = m.clientY - d.y
            if (!d.moved && Math.hypot(dx, dy) < 4) return
            d.moved = true
            el.style.cursor = 'grabbing'
            el.style.userSelect = 'none'
            el.scrollLeft = d.l - dx
            el.scrollTop = d.t - dy
        }
        const up = () => {
            removeEventListener('pointermove', move)
            removeEventListener('pointerup', up)
            removeEventListener('pointercancel', up)
            if (drag.current?.moved) {
                swallow.current = true // a drag must not count as a click underneath
                setTimeout(() => (swallow.current = false), 0)
                noMenu.current = true // ...nor open/handle a context menu when the right button is released
                setTimeout(() => (noMenu.current = false), 100)
            }
            drag.current = null
            el.style.cursor = always ? 'grab' : ''
            el.style.userSelect = ''
        }
        addEventListener('pointermove', move)
        addEventListener('pointerup', up)
        addEventListener('pointercancel', up)
    }
    return (
        <div
            ref={ref}
            className="zoomscroll"
            style={{overflow: 'auto', maxHeight: can ? '82vh' : 'none', ...(always && can ? {cursor: 'grab'} : null), ...style}}
            onPointerDownCapture={down}
            onClickCapture={(e) => {
                if (swallow.current) e.stopPropagation()
            }}
            onContextMenuCapture={(e) => {
                if (rightPan && (noMenu.current || drag.current?.moved)) {
                    e.preventDefault()
                    e.stopPropagation()
                }
            }}
            onAuxClick={(e) => e.preventDefault()}
        >
            {children}
        </div>
    )
}