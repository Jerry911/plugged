// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The tour inside the real editor: it starts on a first visit, points at things that exist, waits for what the person does.
import {act, fireEvent, render, waitFor} from '@testing-library/react'
import App from '../../../app/App.jsx'
import standard from '../../fixtures/standard-symbols.json'
import {forgetTour, markTourSeen, TOUR_KEY} from '../../../features/tour/Tour.jsx'
import {tourSteps} from '../../../features/tour/tourSteps.jsx'
import {t} from '../../../i18n/translate.js'
import {byId, getById} from '../../utils.jsx'

const TOUR_STEPS = tourSteps()

vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))
const BOX = {left: 100, top: 60, width: 120, height: 30, right: 220, bottom: 90, x: 100, y: 60}
const ZERO = {left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0}
const layout = () =>
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return this.closest('details:not([open])') && !this.matches('summary') ? ZERO : this.matches('.tour-tip') ? {...ZERO, width: 340, height: 200} : BOX
    })
const mount = async () => {
    const r = render(<App />)
    await waitFor(() => getById('tab-comp'))
    return r
}
const card = () => byId('tour-card')
const waitForCard = () => waitFor(() => getById('tour-card'))
// waits until the card shows the step with this id
const waitForStep = (id, options) => waitFor(() => expect(getById('tour-card')).toHaveAttribute('data-step', id), options)
const next = () => fireEvent.click(getById('tour-next'))
beforeEach(() => {
    forgetTour()
    global.fetch = vi.fn(async (url) => (url === '/api/symbols' ? {ok: true, json: async () => standard} : {ok: false}))
    window.alert = vi.fn()
})

test('a first visit starts the tour; Nu niet closes it for good', async () => {
    const {unmount} = await mount()
    const welcome = await waitForCard()
    expect(getById('tour-title')).toHaveTextContent(t('tour.steps.welkom.title'))
    expect(welcome).toHaveAttribute('data-step', 'welkom')
    fireEvent.click(getById('tour-close'))
    expect(card()).toBeNull()
    expect(JSON.parse(localStorage.getItem(TOUR_KEY)).how).toBe('skip')
    unmount()
    await mount()
    await act(async () => {})
    expect(card()).toBeNull()
})

test('a returning visitor does not get the tour', async () => {
    markTourSeen()
    await mount()
    await act(async () => {})
    expect(card()).toBeNull()
})

test('the tour waits until the project has been fetched', async () => {
    let release
    global.fetch = vi.fn((url) => (url === '/api/symbols' ? Promise.resolve({ok: true, json: async () => standard}) : url === '/api/projects/1' ? new Promise((r) => (release = r)) : Promise.resolve({ok: false})))
    await mount()
    await act(async () => {})
    expect(card()).toBeNull()
    await act(async () => release({ok: false}))
    await waitForCard()
})

test('every step points at something that exists in the editor', async () => {
    layout()
    await mount()
    await waitForCard()
    for (const s of TOUR_STEPS) {
        await waitForStep(s.id)
        // the steps that point at something that is not always there (a selection) explain what to do instead of failing
        if (s.target && !s.missing) await waitFor(() => expect(byId('tour-spot')).not.toBeNull())
        next()
    }
    expect(card()).toBeNull()
    expect(JSON.parse(localStorage.getItem(TOUR_KEY)).how).toBe('done')
    // the steps on the situatieschema switched to that tab, and the last steps are on no tab in particular: it stays where the tour left it
    expect(byId('tab-sit').className).toBe('on')
})

test('the tour switches tabs by itself and waits for the first circuit', async () => {
    layout()
    await mount()
    await waitForCard()
    next()
    await waitForStep('tabs')
    next() // the two schemas
    await waitForStep('palet')
    next() // the palette
    await waitForStep('kring')
    const btn = await waitFor(() => {
        const b = document.querySelector('[data-tour="pal-kring"]')
        expect(b).not.toBeNull()
        return b
    })
    expect(btn.closest('details').open).toBe(true) // the tour opened the category
    expect(byId('tour-ok')).toBeNull()
    fireEvent.click(btn)
    await waitFor(() => expect(getById('tour-ok')).toHaveTextContent(t('tour.steps.kring.done')))
    await waitForStep('eigenschappen', {timeout: 3000})
    // the new circuit is selected: its properties are what the step points at
    expect(document.querySelector('[data-tour="eds-props"]')).not.toBeNull()
    await waitFor(() => expect(byId('tour-spot')).not.toBeNull())
})

test('the tour goes to the situatieschema and waits for the walls', async () => {
    layout()
    markTourSeen()
    await mount()
    fireEvent.click(byId('tab-info'))
    fireEvent.click(await waitFor(() => getById('btn-tour')))
    // started from Info: the first step goes back to the eendraadschema
    await waitForStep('welkom')
    await waitFor(() => expect(byId('tab-een').className).toBe('on'))
    for (const s of TOUR_STEPS.slice(0, TOUR_STEPS.findIndex((x) => x.id === 'naar-situatie'))) {
        await waitForStep(s.id)
        next()
    }
    await waitForStep('naar-situatie')
    fireEvent.click(byId('tab-sit')) // doing it is enough: the step carries on by itself
    await waitFor(() => expect(getById('tour-ok')).toHaveTextContent(t('tour.steps.naar-situatie.done')))
    await waitForStep('muur', {timeout: 3000})
    expect(byId('tab-sit').className).toBe('on')
    fireEvent.click(document.querySelector('[data-tour="tool-wall"]'))
    expect(document.querySelector('[data-tour="tool-wall"]').className).toBe('on')
})

test('the last step can start with an empty project', async () => {
    layout()
    await mount()
    await waitForCard()
    for (const s of TOUR_STEPS.slice(0, -1)) {
        await waitForStep(s.id)
        next()
    }
    fireEvent.click(await waitFor(() => getById('tour-extra')))
    expect(card()).toBeNull()
    await waitFor(() => expect(global.fetch.mock.calls.some((c) => c[0] === '/api/projects')).toBe(true))
})
