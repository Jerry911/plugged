// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The side panels (the palette and Opbouw of the eendraadschema, the tools and the lists of the situatieschema, the symbol list of
// Componenten) reach exactly to the bottom of the window, whatever its size: their lists scroll inside instead of leaving white space or
// running off the screen.
import {useEffect} from 'react'

/** Below this width (px) the panels stand above each other (see layout.css) and keep their own height. */
export const NARROW_SCREEN = 900
const narrow = () => innerWidth <= NARROW_SCREEN

/** The room (px) from the top of `element` to the bottom of the window, `margin` kept free below it. */
export const roomBelow = (element, margin) => Math.max(0, Math.round(innerHeight - element.getBoundingClientRect().top - margin))

// recompute when the window changes size, the page scrolls (a sticky panel moves up) or anything on the page changes size (a message
// above it, a panel that opens)
const watch = (update) => {
    let frame = 0
    const later = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(update)
    }
    update()
    addEventListener('resize', later)
    addEventListener('scroll', later, {passive: true})
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(later) : null
    observer?.observe(document.body)
    return () => {
        cancelAnimationFrame(frame)
        removeEventListener('resize', later)
        removeEventListener('scroll', later)
        observer?.disconnect()
    }
}

/**
 * Gives the element behind `ref` the height from its top to the bottom of the window (minus `margin`), kept up to date. Set directly on the
 * element (no rendering of the component on every scroll). On a narrow screen the height is left to the style sheet.
 */
export function useFillHeight(ref, margin = 10) {
    useEffect(
        () =>
            watch(() => {
                const element = ref.current
                if (element) element.style.height = narrow() ? '' : roomBelow(element, margin) + 'px'
            }),
        [ref, margin],
    )
}
