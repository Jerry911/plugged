// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'

// ---- "is this the first visit?" -------------------------------------------------------------------------------------------------
// There are no user accounts, so the browser remembers that the tour was seen. Raise TOUR_VERSION when the tour changes so much that
// returning users should see it again. When the browser blocks localStorage (private mode) the tour is shown once per page load.
export const TOUR_KEY = 'plugged.tour'
export const TOUR_VERSION = 1
let memory = 0
const stored = () => {
    try {
        return JSON.parse(localStorage.getItem(TOUR_KEY))?.v ?? 0
    } catch {
        return 0
    }
}
export const tourSeen = () => Math.max(stored(), memory) >= TOUR_VERSION
export const markTourSeen = (how = 'done') => {
    memory = TOUR_VERSION
    try {
        localStorage.setItem(TOUR_KEY, JSON.stringify({v: TOUR_VERSION, how, at: new Date().toISOString()}))
    } catch {
        /* blocked: `memory` is enough for this page load */
    }
}
export const forgetTour = () => {
    memory = 0
    try {
        localStorage.removeItem(TOUR_KEY)
    } catch {
        /* nothing to forget */
    }
}

// ---- geometry -------------------------------------------------------------------------------------------------------------------
const PAD = 6, // the highlight is a bit larger than the element itself
    GAP = 14, // space between the highlight and the card
    EDGE = 12 // minimal distance to the screen edge
const FALLBACKS = {right: ['left', 'bottom', 'top'], left: ['right', 'bottom', 'top'], bottom: ['top', 'right', 'left'], top: ['bottom', 'right', 'left']}
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))

// where the card goes: next to the highlighted element (on the preferred side when it fits, else another side), in the corner of the screen
// for big elements (a whole drawing) or when nothing fits, centered when nothing is highlighted
export const place = (rect, size, vp, pref = 'right') => {
    const {w, h} = size,
        corner = {left: vp.w - w - EDGE, top: vp.h - h - EDGE, side: 'none'}
    if (!rect) return {left: (vp.w - w) / 2, top: (vp.h - h) / 2, side: 'none'}
    if (pref === 'corner' || rect.w * rect.h > vp.w * vp.h * 0.5) return corner
    const cx = rect.x + rect.w / 2,
        cy = rect.y + rect.h / 2,
        x = (v) => clamp(v, EDGE, vp.w - w - EDGE),
        y = (v) => clamp(v, EDGE, vp.h - h - EDGE),
        tries = {
            right: () => rect.x + rect.w + PAD + GAP + w <= vp.w - EDGE && {left: rect.x + rect.w + PAD + GAP, top: y(cy - h / 2), side: 'right'},
            left: () => rect.x - PAD - GAP - w >= EDGE && {left: rect.x - PAD - GAP - w, top: y(cy - h / 2), side: 'left'},
            bottom: () => rect.y + rect.h + PAD + GAP + h <= vp.h - EDGE && {left: x(cx - w / 2), top: rect.y + rect.h + PAD + GAP, side: 'bottom'},
            top: () => rect.y - PAD - GAP - h >= EDGE && {left: x(cx - w / 2), top: rect.y - PAD - GAP - h, side: 'top'},
        }
    for (const s of FALLBACKS[pref] ? [pref, ...FALLBACKS[pref]] : ['right', ...FALLBACKS.right]) {
        const r = tries[s]?.()
        if (r) return r
    }
    return corner
}

// ---- finding the element a step points to ---------------------------------------------------------------------------------------
// a target is a CSS selector, an element, a function that returns one of those, or a list of them (the highlight then covers all of them)
const toEls = (t) =>
    []
        .concat((typeof t === 'function' ? t() : t) ?? [])
        .map((x) => (typeof x === 'string' ? document.querySelector(x) : x))
        .filter(Boolean)
const boxOf = (el) => {
    const r = el.getBoundingClientRect()
    return r.width || r.height ? {x: r.left, y: r.top, w: r.width, h: r.height} : null
}
const union = (els) => {
    const bs = els.map(boxOf).filter(Boolean)
    if (!bs.length) return null
    const x0 = Math.min(...bs.map((b) => b.x)),
        y0 = Math.min(...bs.map((b) => b.y)),
        x1 = Math.max(...bs.map((b) => b.x + b.w)),
        y1 = Math.max(...bs.map((b) => b.y + b.h))
    return {x: x0, y: y0, w: x1 - x0, h: y1 - y0}
}
// elements inside a collapsed <details> (the palette categories) have no size: open the ones around the target
const openAround = (el) => {
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) if (!d.open) d.open = true
}
const same = (a, b) => (!a && !b) || (a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)

// ---- the tour -------------------------------------------------------------------------------------------------------------------
// steps: [{id, title, body, target, fallback, missing, place, tab, watch, need, base, done, next, extra}]
//   target / fallback  what to highlight (see toEls); `missing` explains what to do when the target is not on screen
//   tab                the tab the step needs: the tour switches to it
//   watch(ctx)         makes the step interactive: the page stays clickable and the step completes when watch(ctx) went up by `need`
//                      (default 1) compared with its value when the step started (or compared with `base`)
//   extra              {label, run(ctx)}: an extra button
// ctx: {p, tab, setTab, ...}: what the steps may look at (the project, the active tab) and use (switch tab)
export default function Tour({steps, ctx, onClose}) {
    const [i, setI] = useState(0),
        [rect, setRect] = useState(null),
        [missing, setMissing] = useState(false),
        [ok, setOk] = useState(false),
        [size, setSize] = useState({w: 340, h: 220}),
        [vp, setVp] = useState({w: innerWidth, h: innerHeight}),
        tip = useRef(null),
        primary = useRef(null),
        cx = useRef(ctx),
        start = useRef(0),
        done = useRef(false),
        seen = useRef(null)
    cx.current = ctx
    const step = steps[i],
        live = !!step.watch, // an interactive step: the person has to do something in the page itself
        last = i === steps.length - 1,
        go = (d) => setI((n) => clamp(n + d, 0, steps.length - 1))

    // entering a step: switch to its tab and remember where the counter stands
    useEffect(() => {
        done.current = false
        seen.current = null
        setOk(false)
        const c = cx.current
        if (step.tab != null && c.tab !== step.tab) c.setTab(step.tab)
        start.current = step.watch ? Number(step.base ?? step.watch(c)) : 0
    }, [i])

    const measure = useCallback(() => {
        let els = toEls(step.target)
        els.forEach(openAround)
        let box = union(els),
            miss = false
        if (step.target && !box) {
            miss = true
            els = toEls(step.fallback)
            els.forEach(openAround)
            box = union(els)
        }
        const el = els.find(boxOf)
        if (el && seen.current !== el) {
            seen.current = el
            el.scrollIntoView?.({block: box.h < innerHeight * 0.5 ? 'center' : 'nearest', inline: 'nearest', behavior: 'smooth'})
        }
        setRect((r) => (same(r, box) ? r : box))
        setMissing(miss)
        setVp((v) => (v.w === innerWidth && v.h === innerHeight ? v : {w: innerWidth, h: innerHeight}))
    }, [i])

    // an interactive step is finished when its counter went up: show a short "well done" and carry on
    const check = useCallback(() => {
        if (!step.watch || done.current) return
        if (Number(step.watch(cx.current)) - start.current >= (step.need ?? 1)) {
            done.current = true
            setOk(true)
        }
    }, [i])
    useEffect(() => {
        measure()
        check()
        // the page keeps changing under the highlight (panels open, the drawing scrolls): follow it
        const t = setInterval(() => {
                measure()
                check()
            }, 250),
            f = () => measure()
        addEventListener('resize', f)
        addEventListener('scroll', f, true)
        return () => {
            clearInterval(t)
            removeEventListener('resize', f)
            removeEventListener('scroll', f, true)
        }
    }, [measure, check])
    useEffect(check, [ctx.p, ctx.tab, check])
    useEffect(() => {
        if (!ok) return
        const t = setTimeout(() => go(1), 1000)
        return () => clearTimeout(t)
    }, [ok])

    // Escape closes the tour, except in interactive steps where the page itself uses Escape (it cancels the tool that is being used)
    useEffect(() => {
        const f = (e) => {
            if (e.key === 'Escape' && !live) {
                e.preventDefault()
                onClose('skip')
            }
        }
        addEventListener('keydown', f)
        return () => removeEventListener('keydown', f)
    }, [live, onClose])
    // keyboard users continue with Enter / Space; in interactive steps the focus stays where the person is working
    useEffect(() => {
        if (!live) primary.current?.focus({preventScroll: true})
    }, [i])
    useLayoutEffect(() => {
        const r = tip.current?.getBoundingClientRect()
        if (r?.width && (r.width !== size.w || r.height !== size.h)) setSize({w: r.width, h: r.height})
    })

    const pos = place(rect, size, vp, step.place),
        cxr = rect ? rect.x + rect.w / 2 : 0,
        cyr = rect ? rect.y + rect.h / 2 : 0,
        arrow = {'--ax': clamp(cxr - pos.left, 22, size.w - 22) + 'px', '--ay': clamp(cyr - pos.top, 22, size.h - 22) + 'px'},
        first = i === 0
    return createPortal(
        <div className="tour" aria-live="polite">
            {!live && <div className="tour-block" />}
            {rect ? (
                <div
                    className={'tour-spot' + (live ? ' live' : '')}
                    style={{left: rect.x - PAD, top: rect.y - PAD, width: rect.w + 2 * PAD, height: rect.h + 2 * PAD}}
                />
            ) : (
                <div className="tour-dim" />
            )}
            <div
                key={i}
                ref={tip}
                className="tour-tip"
                role="dialog"
                aria-modal={!live}
                aria-labelledby="tour-title"
                data-side={pos.side}
                data-live={live}
                style={{left: pos.left, top: pos.top, ...arrow}}
            >
                <div className="tour-bar" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1}>
                    <i style={{width: ((i + 1) / steps.length) * 100 + '%'}} />
                </div>
                <small className="tour-count">
                    Stap {i + 1} van {steps.length}
                    {live && <span className="tour-tag">probeer zelf</span>}
                </small>
                <h3 id="tour-title">{step.title}</h3>
                <div className="tour-body">{step.body}</div>
                {missing && !ok && step.missing && <p className="tour-hint">{step.missing}</p>}
                {ok && <p className="tour-ok">✓ {step.done || 'Goed zo!'}</p>}
                <div className="tour-actions">
                    <button className="tour-ghost" onClick={() => onClose('skip')}>
                        {first ? 'Nu niet' : 'Stoppen'}
                    </button>
                    <span style={{flex: 1}} />
                    {!first && (
                        <button className="tour-btn" onClick={() => go(-1)}>
                            Terug
                        </button>
                    )}
                    {last && step.extra && (
                        <button
                            className="tour-btn"
                            onClick={() => {
                                onClose('done')
                                step.extra.run(cx.current)
                            }}
                        >
                            {step.extra.label}
                        </button>
                    )}
                    <button ref={primary} className={live ? 'tour-btn' : 'tour-btn primary'} onClick={() => (last ? onClose('done') : go(1))}>
                        {last ? 'Klaar' : (step.next ?? (live ? 'Sla over' : 'Volgende'))}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
