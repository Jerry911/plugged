// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The steps about the scale: when are they finished? (the tour polls these functions, see Tour.jsx)
import {TOUR_STEPS} from '../tourSteps.jsx'

const step = (id) => TOUR_STEPS.find((s) => s.id === id)
// what a step gets to look at: {p: the project}
const proj = (schaal, walls = 0) => ({p: {footer: {schaal}, een: [], sit: [{id: 's', walls: Array.from({length: walls}, (_, i) => ({id: 'w' + i})), items: []}]}})
const page = (html) => (document.body.innerHTML = html)
const dimbox = (value, withScale = true) =>
    page(`<div data-tour="dimbox"><input data-tour="dim-input" value="${value}" />${withScale ? '<button data-tour="dim-scale">Schaal 1:75</button>' : ''}</div>`)

afterEach(() => (document.body.innerHTML = ''))

test('the steps of the first walls come in the order: wall, length, scale, confirm, Kaderinfo', () => {
    const ids = TOUR_STEPS.map((s) => s.id),
        at = (id) => ids.indexOf(id)
    expect(at('naar-situatie') < at('muur') && at('muur') < at('muur-lengte') && at('muur-lengte') < at('schaal-kiezen')).toBe(true)
    expect(at('schaal-kiezen') < at('muur-bevestig') && at('muur-bevestig') < at('kaderinfo') && at('kaderinfo') < at('kaderinfo-schaal')).toBe(true)
    expect(at('kaderinfo-schaal') < at('deur')).toBe(true) // the rest of the walkthrough carries on after the scale
    for (const id of ['muur-lengte', 'schaal-kiezen', 'muur-bevestig', 'kaderinfo-schaal']) expect(step(id).missing).toBeTruthy() // they explain what to do when their target is not there
})

test('the first wall step is finished by one wall', () => {
    const s = step('muur')
    expect(s.need ?? 1).toBe(1)
    expect(s.watch(proj('1:50', 1)) - s.watch(proj('1:50', 0))).toBe(1)
})

describe('the length step wants a value that is too long for the sheet, but still fits at the proposed scale', () => {
    const w = step('muur-lengte').watch
    test.each([
        ['15', true],
        ['15,5', true],
        ['16', true],
        ['1500cm', true],
        ['14', false], // fits at 1:50 (280 mm): no new scale is proposed
        ['5', false],
        ['', false],
        ['abc', false],
        ['40', false], // would not fit on the sheet at the proposed scale
    ])('at 1:50 %j -> %s', (value, done) => {
        dimbox(value)
        expect(w(proj('1:50'))).toBe(done ? 1 : 0)
    })
    test('the proposal of the application has to be there', () => {
        dimbox('15', false)
        expect(w(proj('1:50'))).toBe(0)
    })
    test('without a length box nothing is finished', () => {
        page('')
        expect(w(proj('1:50'))).toBe(0)
    })
    test('another starting scale needs another length', () => {
        dimbox('15')
        expect(w(proj('1:100'))).toBe(0) // 15 m fits at 1:100
        dimbox('29')
        expect(w(proj('1:100'))).toBe(1)
    })
})

test('the scale step is finished by choosing a larger scale', () => {
    const w = step('schaal-kiezen').watch
    expect(w(proj('1:75')) - w(proj('1:50'))).toBeGreaterThanOrEqual(1)
    expect(w(proj('1:50')) - w(proj('1:50'))).toBe(0)
})

test('the confirm step is finished by the second wall', () => {
    const w = step('muur-bevestig').watch
    expect(w(proj('1:75', 2)) - w(proj('1:75', 1))).toBe(1)
})

describe('Kaderinfo: opened, then closed', () => {
    const dialog = '<div role="dialog" aria-label="Kaderinfo"><input data-tour="footer-schaal" /></div>'
    const open = step('kaderinfo').watch,
        close = step('kaderinfo-schaal').watch
    test('opening is seen; closing finishes the next step only when the dialog was open', () => {
        page('')
        expect(open()).toBe(0) // the tour starts the Kaderinfo step: closed, and nothing was seen
        expect(close()).toBe(0) // a skipped step does not finish the next one
        page(dialog)
        expect(open()).toBe(1)
        expect(close()).toBe(0) // still open
        page('')
        expect(close()).toBe(1) // closed after it was open
    })
    test('another round starts clean', () => {
        page(dialog)
        close()
        page('')
        expect(close()).toBe(1)
        expect(open()).toBe(0) // entering the Kaderinfo step again forgets that it was seen
        expect(close()).toBe(0)
    })
    test('the tour card itself is not mistaken for the Kaderinfo', () => {
        page('<div role="dialog" aria-labelledby="tour-title"><h3 id="tour-title">x</h3></div>')
        expect(open()).toBe(0)
    })
})
