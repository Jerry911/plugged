// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {useTranslation} from '../../i18n/I18nProvider.jsx'

// ---- "is this the first visit?" -------------------------------------------------------------------------------------------------
// The browser remembers per user that the tour was seen (plugged.tour.<user id>): a new account that signs in on a browser where somebody
// else already saw the tour still gets it. Without a user id the key is plugged.tour. Raise TOUR_VERSION when the tour changes so much that
// returning users should see it again. When the browser blocks localStorage (private mode) the tour is shown once per page load.
export const TOUR_KEY = 'plugged.tour'
export const TOUR_VERSION = 1
/** The localStorage key of the tour of this user. */
export const tourKey = (userId) => (userId == null ? TOUR_KEY : `${TOUR_KEY}.${userId}`)
const memory = new Map() // key -> version seen during this page load (when storage is blocked)
const stored = (key) => {
    try {
        return JSON.parse(localStorage.getItem(key))?.v ?? 0
    } catch {
        return 0
    }
}
export const tourSeen = (userId) => Math.max(stored(tourKey(userId)), memory.get(tourKey(userId)) ?? 0) >= TOUR_VERSION
export const markTourSeen = (how = 'done', userId) => {
    memory.set(tourKey(userId), TOUR_VERSION)
    try {
        localStorage.setItem(tourKey(userId), JSON.stringify({v: TOUR_VERSION, how, at: new Date().toISOString()}))
    } catch {
        /* blocked: `memory` is enough for this page load */
    }
}
export const forgetTour = (userId) => {
    memory.delete(tourKey(userId))
    try {
        localStorage.removeItem(tourKey(userId))
    } catch {
        /* nothing to forget */
    }
}

// ---- geometry -------------------------------------------------------------------------------------------------------------------
const HIGHLIGHT_PADDING = 6, // the highlight is a bit larger than the element itself
    CARD_GAP = 14, // space between the highlight and the card
    SCREEN_MARGIN = 12 // minimal distance to the screen edge
const FALLBACKS = {right: ['left', 'bottom', 'top'], left: ['right', 'bottom', 'top'], bottom: ['top', 'right', 'left'], top: ['bottom', 'right', 'left']}
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

// where the card goes: next to the highlighted element (on the preferred side when it fits, else another side), in the corner of the screen
// for big elements (a whole drawing) or when nothing fits, centered when nothing is highlighted
export const place = (rect, size, viewport, preferredSide = 'right') => {
    const {w: width, h: height} = size,
        corner = {left: viewport.w - width - SCREEN_MARGIN, top: viewport.h - height - SCREEN_MARGIN, side: 'none'}
    if (!rect) return {left: (viewport.w - width) / 2, top: (viewport.h - height) / 2, side: 'none'}
    if (preferredSide === 'corner' || rect.w * rect.h > viewport.w * viewport.h * 0.5) return corner
    const centreX = rect.x + rect.w / 2,
        centreY = rect.y + rect.h / 2,
        clampLeft = (left) => clamp(left, SCREEN_MARGIN, viewport.w - width - SCREEN_MARGIN),
        clampTop = (top) => clamp(top, SCREEN_MARGIN, viewport.h - height - SCREEN_MARGIN),
        distance = HIGHLIGHT_PADDING + CARD_GAP,
        attempts = {
            right: () =>
                rect.x + rect.w + distance + width <= viewport.w - SCREEN_MARGIN && {left: rect.x + rect.w + distance, top: clampTop(centreY - height / 2), side: 'right'},
            left: () => rect.x - distance - width >= SCREEN_MARGIN && {left: rect.x - distance - width, top: clampTop(centreY - height / 2), side: 'left'},
            bottom: () =>
                rect.y + rect.h + distance + height <= viewport.h - SCREEN_MARGIN && {left: clampLeft(centreX - width / 2), top: rect.y + rect.h + distance, side: 'bottom'},
            top: () => rect.y - distance - height >= SCREEN_MARGIN && {left: clampLeft(centreX - width / 2), top: rect.y - distance - height, side: 'top'},
        }
    for (const side of FALLBACKS[preferredSide] ? [preferredSide, ...FALLBACKS[preferredSide]] : ['right', ...FALLBACKS.right]) {
        const position = attempts[side]?.()
        if (position) return position
    }
    return corner
}

// ---- finding the element a step points to ---------------------------------------------------------------------------------------
// a target is a CSS selector, an element, a function that returns one of those, or a list of them (the highlight then covers all of them)
const elementsOf = (target) =>
    []
        .concat((typeof target === 'function' ? target() : target) ?? [])
        .map((entry) => (typeof entry === 'string' ? document.querySelector(entry) : entry))
        .filter(Boolean)
const boxOf = (element) => {
    const rect = element.getBoundingClientRect()
    return rect.width || rect.height ? {x: rect.left, y: rect.top, w: rect.width, h: rect.height} : null
}
const unionOf = (elements) => {
    const boxes = elements.map(boxOf).filter(Boolean)
    if (!boxes.length) return null
    const left = Math.min(...boxes.map((box) => box.x)),
        top = Math.min(...boxes.map((box) => box.y)),
        right = Math.max(...boxes.map((box) => box.x + box.w)),
        bottom = Math.max(...boxes.map((box) => box.y + box.h))
    return {x: left, y: top, w: right - left, h: bottom - top}
}
// elements inside a collapsed <details> (the palette categories) have no size: open the ones around the target
const openAround = (element) => {
    for (let details = element.closest('details'); details; details = details.parentElement?.closest('details')) if (!details.open) details.open = true
}
const sameBox = (a, b) => (!a && !b) || (a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)

// ---- the tour -------------------------------------------------------------------------------------------------------------------
// steps: [{id, title, body, target, fallback, missing, place, tab, watch, need, base, done, next, extra}]
//   target / fallback  what to highlight (see elementsOf); `missing` explains what to do when the target is not on screen
//   tab                the tab the step needs: the tour switches to it
//   watch(context)     makes the step interactive: the page stays clickable and the step completes when watch(context) went up by `need`
//                      (default 1) compared with its value when the step started (or compared with `base`)
//   extra              {label, run(context)}: an extra button on the last step
// context: {project, tab, setTab, ...}: what the steps may look at (the project, the active tab) and use (switch tab)
export default function Tour({steps, context, onClose}) {
    const {t} = useTranslation()
    const [stepIndex, setStepIndex] = useState(0),
        [rect, setRect] = useState(null),
        [targetMissing, setTargetMissing] = useState(false),
        [completed, setCompleted] = useState(false),
        [cardSize, setCardSize] = useState({w: 340, h: 220}),
        [viewport, setViewport] = useState({w: innerWidth, h: innerHeight}),
        card = useRef(null),
        primaryButton = useRef(null),
        contextRef = useRef(context),
        startValue = useRef(0),
        done = useRef(false),
        scrolledTo = useRef(null)
    contextRef.current = context
    const step = steps[stepIndex],
        interactive = !!step.watch, // an interactive step: the person has to do something in the page itself
        isFirst = stepIndex === 0,
        isLast = stepIndex === steps.length - 1,
        goBy = (offset) => setStepIndex((index) => clamp(index + offset, 0, steps.length - 1))

    // entering a step: switch to its tab and remember where the counter stands
    useEffect(() => {
        done.current = false
        scrolledTo.current = null
        setCompleted(false)
        const current = contextRef.current
        if (step.tab != null && current.tab !== step.tab) current.setTab(step.tab)
        startValue.current = step.watch ? Number(step.base ?? step.watch(current)) : 0
    }, [stepIndex])

    const measure = useCallback(() => {
        let elements = elementsOf(step.target)
        elements.forEach(openAround)
        let box = unionOf(elements),
            missing = false
        if (step.target && !box) {
            missing = true
            elements = elementsOf(step.fallback)
            elements.forEach(openAround)
            box = unionOf(elements)
        }
        const visible = elements.find(boxOf)
        if (visible && scrolledTo.current !== visible) {
            scrolledTo.current = visible
            visible.scrollIntoView?.({block: box.h < innerHeight * 0.5 ? 'center' : 'nearest', inline: 'nearest', behavior: 'smooth'})
        }
        setRect((current) => (sameBox(current, box) ? current : box))
        setTargetMissing(missing)
        setViewport((current) => (current.w === innerWidth && current.h === innerHeight ? current : {w: innerWidth, h: innerHeight}))
    }, [stepIndex])

    // an interactive step is finished when its counter went up: show a short "well done" and carry on
    const check = useCallback(() => {
        if (!step.watch || done.current) return
        if (Number(step.watch(contextRef.current)) - startValue.current >= (step.need ?? 1)) {
            done.current = true
            setCompleted(true)
        }
    }, [stepIndex])
    useEffect(() => {
        measure()
        check()
        // the page keeps changing under the highlight (panels open, the drawing scrolls): follow it
        const timer = setInterval(() => {
                measure()
                check()
            }, 250),
            onViewportChange = () => measure()
        addEventListener('resize', onViewportChange)
        addEventListener('scroll', onViewportChange, true)
        return () => {
            clearInterval(timer)
            removeEventListener('resize', onViewportChange)
            removeEventListener('scroll', onViewportChange, true)
        }
    }, [measure, check])
    useEffect(check, [context.project, context.tab, check])
    useEffect(() => {
        if (!completed) return
        const timer = setTimeout(() => goBy(1), 1000)
        return () => clearTimeout(timer)
    }, [completed])

    // Escape closes the tour, except in interactive steps where the page itself uses Escape (it cancels the tool that is being used)
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape' && !interactive) {
                event.preventDefault()
                onClose('skip')
            }
        }
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    }, [interactive, onClose])
    // keyboard users continue with Enter / Space; in interactive steps the focus stays where the person is working
    useEffect(() => {
        if (!interactive) primaryButton.current?.focus({preventScroll: true})
    }, [stepIndex])
    useLayoutEffect(() => {
        const box = card.current?.getBoundingClientRect()
        if (box?.width && (box.width !== cardSize.w || box.height !== cardSize.h)) setCardSize({w: box.width, h: box.height})
    })

    const position = place(rect, cardSize, viewport, step.place),
        targetCentreX = rect ? rect.x + rect.w / 2 : 0,
        targetCentreY = rect ? rect.y + rect.h / 2 : 0,
        arrow = {
            '--ax': clamp(targetCentreX - position.left, 22, cardSize.w - 22) + 'px',
            '--ay': clamp(targetCentreY - position.top, 22, cardSize.h - 22) + 'px',
        },
        primaryLabel = isLast ? t('tour.finish') : (step.next ?? (interactive ? t('tour.skipStep') : t('tour.next')))
    return createPortal(
        <div id="tour" className="tour" aria-live="polite">
            {!interactive && <div className="tour-block" />}
            {rect ? (
                <div
                    id="tour-spot"
                    className={'tour-spot' + (interactive ? ' live' : '')}
                    style={{
                        left: rect.x - HIGHLIGHT_PADDING,
                        top: rect.y - HIGHLIGHT_PADDING,
                        width: rect.w + 2 * HIGHLIGHT_PADDING,
                        height: rect.h + 2 * HIGHLIGHT_PADDING,
                    }}
                />
            ) : (
                <div className="tour-dim" />
            )}
            <div
                key={stepIndex}
                id="tour-card"
                ref={card}
                className="tour-tip"
                role="dialog"
                aria-modal={!interactive}
                aria-labelledby="tour-title"
                data-step={step.id}
                data-side={position.side}
                data-live={interactive}
                style={{left: position.left, top: position.top, ...arrow}}
            >
                <div className="tour-bar" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1}>
                    <i style={{width: ((stepIndex + 1) / steps.length) * 100 + '%'}} />
                </div>
                <small id="tour-count" className="tour-count">
                    {t('tour.stepCount', {number: stepIndex + 1, total: steps.length})}
                    {interactive && (
                        <span id="tour-try" className="tour-tag">
                            {t('tour.tryYourself')}
                        </span>
                    )}
                </small>
                <h3 id="tour-title">{step.title}</h3>
                <div id="tour-body" className="tour-body">
                    {step.body}
                </div>
                {targetMissing && !completed && step.missing && (
                    <p id="tour-hint" className="tour-hint">
                        {step.missing}
                    </p>
                )}
                {completed && (
                    <p id="tour-ok" className="tour-ok">
                        ✓ {step.done || t('tour.wellDone')}
                    </p>
                )}
                <div className="tour-actions">
                    <button id="tour-close" className="tour-ghost" onClick={() => onClose('skip')}>
                        {isFirst ? t('tour.notNow') : t('tour.stop')}
                    </button>
                    <span style={{flex: 1}} />
                    {!isFirst && (
                        <button id="tour-back" className="tour-btn" onClick={() => goBy(-1)}>
                            {t('tour.back')}
                        </button>
                    )}
                    {isLast && step.extra && (
                        <button
                            id="tour-extra"
                            className="tour-btn"
                            onClick={() => {
                                onClose('done')
                                step.extra.run(contextRef.current)
                            }}
                        >
                            {step.extra.label}
                        </button>
                    )}
                    <button
                        id="tour-next"
                        ref={primaryButton}
                        className={interactive ? 'tour-btn' : 'tour-btn primary'}
                        onClick={() => (isLast ? onClose('done') : goBy(1))}
                    >
                        {primaryLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
