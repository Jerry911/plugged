// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {act, fireEvent, render, screen} from '@testing-library/react'
import Tour, {forgetTour, markTourSeen, place, TOUR_KEY, TOUR_VERSION, tourSeen} from '../Tour.jsx'
import {TOUR_STEPS} from '../tourSteps.jsx'

const BOX = {left: 100, top: 60, width: 120, height: 30, right: 220, bottom: 90, x: 100, y: 60}
const ZERO = {left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0}
// jsdom has no layout: every element gets a box, except the ones inside a closed <details> (as in a browser)
const layout = (box = BOX) =>
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return this.matches('.tour-tip') ? {...ZERO, width: 340, height: 200} : this.closest('details:not([open])') && !this.matches('summary') ? ZERO : box
    })
const ctx = (o = {}) => ({p: {n: 0}, tab: 0, setTab: vi.fn(), ...o})
const step = (o = {}) => ({id: 's', title: 'Titel', body: <p>Uitleg</p>, ...o})
const spot = () => document.querySelector('.tour-spot')
const tick = (ms) => act(() => vi.advanceTimersByTime(ms))

describe('first visit', () => {
    beforeEach(forgetTour)
    test('a new visitor has not seen the tour; marking it as seen is remembered', () => {
        expect(tourSeen()).toBe(false)
        markTourSeen('done')
        expect(tourSeen()).toBe(true)
        expect(JSON.parse(localStorage.getItem(TOUR_KEY))).toMatchObject({v: TOUR_VERSION, how: 'done'})
        forgetTour()
        expect(tourSeen()).toBe(false)
    })
    test('an older version of the tour counts as not seen, a broken value as well', () => {
        localStorage.setItem(TOUR_KEY, JSON.stringify({v: TOUR_VERSION - 1}))
        expect(tourSeen()).toBe(false)
        localStorage.setItem(TOUR_KEY, '{not json')
        expect(tourSeen()).toBe(false)
    })
    test('a browser that blocks localStorage still remembers for this page load', () => {
        const blocked = () => {
            throw new Error('blocked')
        }
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
        expect(tourSeen()).toBe(false)
        markTourSeen()
        expect(tourSeen()).toBe(true)
        forgetTour()
        expect(tourSeen()).toBe(false)
    })
})

describe('place', () => {
    const vp = {w: 1000, h: 700},
        size = {w: 340, h: 200},
        r = {x: 400, y: 300, w: 100, h: 40}
    test('centered without a target', () => expect(place(null, size, vp)).toEqual({left: 330, top: 250, side: 'none'}))
    test('next to the target, on the preferred side when it fits', () => {
        expect(place(r, size, vp, 'right')).toMatchObject({side: 'right', left: 520})
        expect(place(r, size, vp, 'left')).toMatchObject({side: 'left', left: 40})
        expect(place(r, size, vp, 'bottom')).toMatchObject({side: 'bottom', top: 360})
        expect(place(r, size, vp, 'top')).toMatchObject({side: 'top', top: 80})
    })
    test('another side when the preferred one is full, the corner when nothing fits', () => {
        expect(place({x: 800, y: 300, w: 150, h: 40}, size, vp, 'right').side).toBe('left')
        expect(place({x: 10, y: 10, w: 100, h: 20}, size, vp, 'top').side).toBe('bottom')
        expect(place({x: 10, y: 10, w: 980, h: 300}, size, {w: 1000, h: 400}, 'right')).toMatchObject({side: 'none', left: 648, top: 188})
    })
    test('the corner for a huge target or when asked, and the card stays on the screen', () => {
        expect(place({x: 0, y: 0, w: 900, h: 650}, size, vp, 'right')).toMatchObject({side: 'none', left: 648, top: 488})
        expect(place(r, size, vp, 'corner').side).toBe('none')
        expect(place({x: 400, y: 5, w: 100, h: 20}, size, vp, 'bottom').top).toBeGreaterThan(0)
        expect(place({x: 5, y: 650, w: 20, h: 20}, size, vp, 'right')).toMatchObject({side: 'right', top: 488})
        expect(place({x: 5, y: 3, w: 20, h: 20}, size, vp, 'right').top).toBe(12)
    })
    test('an unknown side falls back to the right', () => expect(place(r, size, vp, 'diagonal').side).toBe('right'))
})

describe('Tour', () => {
    afterEach(() => vi.useRealTimers())
    test('walks through the steps with Volgende / Terug and ends with Klaar', () => {
        layout()
        const onClose = vi.fn()
        render(<Tour steps={[step({title: 'Een'}), step({title: 'Twee'}), step({title: 'Drie'})]} ctx={ctx()} onClose={onClose} />)
        screen.getByRole('heading', {name: 'Een'})
        screen.getByText('Stap 1 van 3')
        expect(screen.queryByText('Terug')).toBeNull()
        fireEvent.click(screen.getByText('Volgende'))
        screen.getByRole('heading', {name: 'Twee'})
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
        fireEvent.click(screen.getByText('Terug'))
        screen.getByRole('heading', {name: 'Een'})
        fireEvent.click(screen.getByText('Volgende'))
        fireEvent.click(screen.getByText('Volgende'))
        screen.getByRole('heading', {name: 'Drie'})
        fireEvent.click(screen.getByText('Klaar'))
        expect(onClose).toHaveBeenCalledWith('done')
    })
    test('Stoppen / Nu niet and Escape close the tour; the first step has its own labels', () => {
        layout()
        const onClose = vi.fn()
        const {unmount} = render(<Tour steps={[step({next: 'Start'}), step()]} ctx={ctx()} onClose={onClose} />)
        fireEvent.click(screen.getByText('Nu niet'))
        fireEvent.click(screen.getByText('Start'))
        fireEvent.click(screen.getByText('Stoppen'))
        fireEvent.keyDown(window, {key: 'Escape'})
        fireEvent.keyDown(window, {key: 'a'})
        expect(onClose.mock.calls).toEqual([['skip'], ['skip'], ['skip']])
        unmount()
        expect(screen.queryByRole('dialog')).toBeNull()
    })
    test('a step without target dims the whole page and blocks it; the primary button has the focus', () => {
        render(<Tour steps={[step()]} ctx={ctx()} onClose={vi.fn()} />)
        expect(spot()).toBeNull()
        expect(document.querySelector('.tour-dim')).not.toBeNull()
        expect(document.querySelector('.tour-block')).not.toBeNull()
        expect(screen.getByText('Klaar')).toHaveFocus()
    })
    test('a step with a target highlights it (with some room) and follows the page when it changes', () => {
        document.body.insertAdjacentHTML('beforeend', '<button id="t">x</button>')
        const box = {...BOX}
        layout(box)
        render(<Tour steps={[step({target: '#t'}), step({target: () => ['#nope', document.getElementById('t')]})]} ctx={ctx()} onClose={vi.fn()} />)
        expect(spot()).toHaveStyle({left: '94px', top: '54px', width: '132px', height: '42px'})
        expect(document.querySelector('.tour-tip')).toHaveAttribute('data-side', 'right')
        box.left = box.x = 300
        fireEvent(window, new Event('resize'))
        expect(spot()).toHaveStyle({left: '294px'})
        box.top = box.y = 200
        fireEvent.scroll(document.body)
        expect(spot()).toHaveStyle({top: '194px'})
        fireEvent.click(screen.getByText('Volgende'))
        expect(spot()).toBeInTheDocument()
        document.getElementById('t').remove()
    })
    test('the highlight covers all the targets, and the page is scrolled to the first one', () => {
        document.body.insertAdjacentHTML('beforeend', '<i id="a"></i><i id="b"></i>')
        const scroll = vi.fn()
        Element.prototype.scrollIntoView = scroll
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            return this.id === 'a' ? {...BOX, left: 10, top: 10, width: 50, height: 20} : this.id === 'b' ? {...BOX, left: 100, top: 100, width: 50, height: 20} : ZERO
        })
        render(<Tour steps={[step({target: ['#a', '#b']})]} ctx={ctx()} onClose={vi.fn()} />)
        expect(spot()).toHaveStyle({left: '4px', top: '4px', width: '152px', height: '122px'})
        expect(scroll).toHaveBeenCalledTimes(1)
        expect(scroll.mock.calls[0][0]).toMatchObject({block: 'center'})
        delete Element.prototype.scrollIntoView
        document.getElementById('a').remove()
        document.getElementById('b').remove()
    })
    test('a big target is scrolled into view the gentle way', () => {
        document.body.insertAdjacentHTML('beforeend', '<i id="big"></i>')
        const scroll = vi.fn()
        Element.prototype.scrollIntoView = scroll
        layout({...BOX, height: 700})
        render(<Tour steps={[step({target: '#big'})]} ctx={ctx()} onClose={vi.fn()} />)
        expect(scroll.mock.calls[0][0]).toMatchObject({block: 'nearest'})
        delete Element.prototype.scrollIntoView
        document.getElementById('big').remove()
    })
    test('opens the collapsed category that holds the target', () => {
        document.body.insertAdjacentHTML('beforeend', '<details id="outer"><summary>o</summary><details id="inner"><summary>i</summary><button id="deep">k</button></details></details>')
        layout()
        render(<Tour steps={[step({target: '#deep'})]} ctx={ctx()} onClose={vi.fn()} />)
        expect(document.getElementById('outer').open).toBe(true)
        expect(document.getElementById('inner').open).toBe(true)
        expect(spot()).toBeInTheDocument()
        document.getElementById('outer').remove()
    })
    test('a missing target: the fallback is highlighted and the step says what to do', () => {
        document.body.insertAdjacentHTML('beforeend', '<b id="fb">f</b>')
        layout()
        render(<Tour steps={[step({target: '#nope', fallback: '#fb', missing: 'Selecteer eerst iets'})]} ctx={ctx()} onClose={vi.fn()} />)
        screen.getByText('Selecteer eerst iets')
        expect(spot()).toBeInTheDocument()
        document.getElementById('fb').remove()
    })
    test('a missing target without fallback is shown centered, with or without a hint', () => {
        layout()
        const {rerender} = render(<Tour steps={[step({target: '#nope', missing: 'Hint'})]} ctx={ctx()} onClose={vi.fn()} />)
        expect(spot()).toBeNull()
        screen.getByText('Hint')
        rerender(<Tour steps={[step({target: '#nope'})]} ctx={ctx()} onClose={vi.fn()} />)
        expect(spot()).toBeNull()
    })
    test('a step on another tab switches to it', () => {
        layout()
        const c = ctx({tab: 3})
        render(<Tour steps={[step({tab: 0}), step({tab: 1}), step()]} ctx={c} onClose={vi.fn()} />)
        expect(c.setTab).toHaveBeenLastCalledWith(0)
        fireEvent.click(screen.getByText('Volgende'))
        expect(c.setTab).toHaveBeenLastCalledWith(1)
        fireEvent.click(screen.getByText('Volgende'))
        expect(c.setTab).toHaveBeenCalledTimes(2)
        const d = ctx({tab: 0})
        render(<Tour steps={[step({tab: 0})]} ctx={d} onClose={vi.fn()} />)
        expect(d.setTab).not.toHaveBeenCalled()
    })
    describe('an interactive step', () => {
        const live = (o) => step({title: 'Doe iets', watch: ({p}) => p.n, done: 'Gelukt!', ...o})
        const steps = (o) => [live(o), step({title: 'Daarna'})]
        beforeEach(() => {
            layout()
            vi.useFakeTimers()
        })
        test('leaves the page clickable, lets Escape for the page, and can be skipped', () => {
            const onClose = vi.fn()
            render(<Tour steps={steps()} ctx={ctx()} onClose={onClose} />)
            expect(document.querySelector('.tour-block')).toBeNull()
            expect(spot()).toBeNull() // no target: centered, but the page stays usable
            screen.getByText('probeer zelf')
            expect(screen.getByText('Sla over')).not.toHaveFocus()
            fireEvent.keyDown(window, {key: 'Escape'})
            expect(onClose).not.toHaveBeenCalled()
            fireEvent.click(screen.getByText('Sla over'))
            screen.getByRole('heading', {name: 'Daarna'})
        })
        test('shows a confirmation when the person did it and then carries on by itself', () => {
            const {rerender} = render(<Tour steps={steps()} ctx={ctx()} onClose={vi.fn()} />)
            tick(1500) // nothing happened yet
            expect(screen.queryByText(/Gelukt/)).toBeNull()
            rerender(<Tour steps={steps()} ctx={ctx({p: {n: 1}})} onClose={vi.fn()} />)
            screen.getByText('✓ Gelukt!')
            tick(1000)
            screen.getByRole('heading', {name: 'Daarna'})
            expect(screen.queryByText(/Gelukt/)).toBeNull()
        })
        test('the default confirmation, and a counter that has to go up more than once', () => {
            const {rerender} = render(<Tour steps={steps({done: undefined, need: 2})} ctx={ctx()} onClose={vi.fn()} />)
            rerender(<Tour steps={steps({done: undefined, need: 2})} ctx={ctx({p: {n: 1}})} onClose={vi.fn()} />)
            expect(screen.queryByText(/Goed zo/)).toBeNull()
            rerender(<Tour steps={steps({done: undefined, need: 2})} ctx={ctx({p: {n: 2}})} onClose={vi.fn()} />)
            screen.getByText('✓ Goed zo!')
        })
        test('what was already there at the start does not count; a base of 0 does', () => {
            const {unmount} = render(<Tour steps={steps()} ctx={ctx({p: {n: 5}})} onClose={vi.fn()} />)
            tick(1500)
            expect(screen.queryByText(/Gelukt/)).toBeNull()
            unmount()
            render(<Tour steps={steps({base: 0})} ctx={ctx({p: {n: 5}})} onClose={vi.fn()} />)
            screen.getByText('✓ Gelukt!')
        })
        test('notices a change in the page itself (not in the project) at the next look', () => {
            let on = 0
            render(<Tour steps={steps({watch: () => on, base: 0})} ctx={ctx()} onClose={vi.fn()} />)
            expect(screen.queryByText(/Gelukt/)).toBeNull()
            on = 1
            tick(250)
            screen.getByText('✓ Gelukt!')
        })
    })
    test('the last step can have an extra button next to Klaar', () => {
        layout()
        const onClose = vi.fn(),
            run = vi.fn(),
            c = ctx()
        render(<Tour steps={[step({extra: {label: 'Extra', run}})]} ctx={c} onClose={onClose} />)
        fireEvent.click(screen.getByText('Extra'))
        expect(onClose).toHaveBeenCalledWith('done')
        expect(run).toHaveBeenCalledWith(c)
    })
})

describe('the steps of the application tour', () => {
    test('every step has an id, a title and text; the ids are unique', () => {
        expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length)
        TOUR_STEPS.forEach((s) => expect(s.title && s.body).toBeTruthy())
    })
    test('a step that can point at something that is not always there says what to do', () => {
        TOUR_STEPS.filter((s) => ['eigenschappen', 'eigenschappen-situatie'].includes(s.id)).forEach((s) => expect(s.missing).toBeTruthy())
    })
    test('interactive steps count what the person did', () => {
        const by = Object.fromEntries(TOUR_STEPS.map((s) => [s.id, s]))
        const p = (een = [], sit = []) => ({een: [{tree: een}], sit: [{walls: [], items: [], ...sit}]})
        const n = (type, children = []) => ({type, children})
        expect(by.kring.watch({p: p([n('bord', [n('kring'), n('kring', [n('stopcontact')])])])})).toBe(2)
        expect(by.stopcontact.watch({p: p([n('bord', [n('kring', [n('stopcontact'), n('lichtpunt')])])])})).toBe(3)
        expect(by['naar-situatie'].watch({tab: 1})).toBe(true)
        expect(by['naar-situatie'].watch({tab: 0})).toBe(false)
        expect(by.muur.watch({p: {een: [], sit: [{walls: [1, 2], items: []}, {walls: [3], items: []}]}})).toBe(3)
        const items = [{kind: 'door'}, {kind: 'window'}, {kind: 'sym'}, {kind: 'sym'}]
        expect(by.deur.watch({p: p([], {items})})).toBe(1)
        expect(by.symbool.watch({p: p([], {items})})).toBe(2)
        expect(by.selecteer.watch()).toBe(0)
        document.body.insertAdjacentHTML('beforeend', '<div id="sit-props"></div>')
        expect(by.selecteer.watch()).toBe(1)
        document.getElementById('sit-props').remove()
    })
    test('the last step offers to start with an empty project', () => {
        const onNew = vi.fn(),
            {extra} = TOUR_STEPS.at(-1)
        extra.run({onNew})
        expect(onNew).toHaveBeenCalled()
        extra.run({}) // without a handler nothing happens
    })
})
