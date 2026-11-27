// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The tools of the situatieschema and the bedradingsschema: a rail on the drawing with a tip (name + key) per tool, letter shortcuts,
// a fold button and the help of the active tool.
import {fireEvent} from '@testing-library/react'
import SituationSchema from '../../../features/situation/SituationSchema.jsx'
import {DICTIONARIES, t} from '../../../i18n/translate.js'
import {baseProject, byId, clickId, getById, mount} from '../../utils.jsx'

const wiring = () => ({...baseProject(), wire: [{id: 'w1', name: 'Bedrading 1', walls: [], items: [], wires: [], boxes: []}]})
const key = (letter, extra = {}) => fireEvent.keyDown(window, {key: letter, ...extra})
const active = (prefix) => document.querySelector(`#${prefix}-tools .railbtn.on`)?.id

afterEach(() => localStorage.removeItem('plugged.toolRailFolded'))

test('the rail is on the drawing; each tool has an icon, its name and its key in a tip, and the template button comes last', () => {
    mount(SituationSchema, baseProject(), {pageIndex: 0})
    const rail = getById('sit-tools')
    expect(rail.closest('.main')).toBeTruthy()
    expect(rail).toHaveAttribute('role', 'toolbar')
    const wall = getById('sit-tool-wall')
    expect(wall).toHaveAttribute('aria-label', 'Muur')
    expect(wall).toHaveAttribute('aria-keyshortcuts', 'M')
    expect(wall.querySelector('.railtip-head').textContent).toBe('MuurM')
    expect(wall.querySelector('.railtip-help').textContent).toContain('Typ een lengte')
    expect(wall.querySelector('.railtip kbd').textContent).toBe('M')
    const buttons = [...rail.querySelectorAll('button')].map((button) => button.id)
    expect(buttons).toEqual([
        'sit-rail-toggle',
        'sit-tool-select',
        'sit-tool-erase',
        'sit-tool-wall',
        'sit-tool-room',
        'sit-tool-door',
        'sit-tool-window',
        'sit-tool-sym',
        'sit-tool-text',
        'sit-rail-measure',
        'sit-rail-underlay',
        'sit-template',
    ])
    // the left side has no tools any more: only the components (and the properties of a selection)
    expect(document.querySelector('.side #sit-tools')).toBeNull()
})
test('a letter chooses a tool, also with a selection, never while typing or with Ctrl', () => {
    const {container} = mount(SituationSchema, baseProject(), {pageIndex: 0})
    expect(active('sit')).toBe('sit-tool-select')
    key('m')
    expect(active('sit')).toBe('sit-tool-wall')
    // how to use a tool is in its tooltip, not on the drawing
    expect(getById('sit-tool-wall').querySelector('.railtip-help').textContent).toContain('Klik punten')
    expect(byId('sit-help')).toBeNull()
    key('K')
    expect(active('sit')).toBe('sit-tool-room')
    key('v', {ctrlKey: true})
    expect(active('sit')).toBe('sit-tool-room')
    fireEvent.keyDown(container.querySelector('#comp-filter'), {key: 'd'})
    expect(active('sit')).toBe('sit-tool-room')
    key('a')
    expect(active('sit')).toBe('sit-tool-window')
    key('v')
    expect(active('sit')).toBe('sit-tool-select')
})
test('the bedradingsschema has the same rail with Draad and Kader and their keys, and copying a plan as its last button', () => {
    mount(SituationSchema, wiring(), {pageIndex: 0, listKey: 'wire'})
    expect(getById('wire-tool-wire').querySelector('kbd').textContent).toBe('L')
    expect(getById('wire-tool-box').querySelector('kbd').textContent).toBe('B')
    expect([...getById('wire-tools').querySelectorAll('button')].at(-1).id).toBe('wire-copy-plan')
    key('l')
    expect(active('wire')).toBe('wire-tool-wire')
    expect(getById('wire-tool-wire').querySelector('.railtip-help').textContent).toContain('aansluitpunt')
    key('b')
    expect(active('wire')).toBe('wire-tool-box')
})
test('the rail folds away to one button with the active tool, and stays folded next time; the keys still work', () => {
    const first = mount(SituationSchema, baseProject(), {pageIndex: 0})
    clickId('sit-tool-wall')
    clickId('sit-rail-toggle')
    expect(byId('sit-tool-wall')).toBeNull()
    expect(getById('sit-rail-toggle')).toHaveAttribute('aria-expanded', 'false')
    // the keys work while folded: the button shows the tool that is on
    key('k')
    clickId('sit-rail-toggle')
    expect(getById('sit-tool-room')).toHaveClass('on')
    clickId('sit-rail-toggle')
    first.unmount()
    // folded the next time the tab opens
    mount(SituationSchema, baseProject(), {pageIndex: 0})
    expect(byId('sit-tool-wall')).toBeNull()
    expect(getById('sit-rail-toggle')).toHaveAttribute('aria-expanded', 'false')
})
test('the keys of the tools differ from each other in every language and leave R (turning) free', () => {
    for (const [language, dictionary] of Object.entries(DICTIONARIES)) {
        const keys = Object.values(dictionary.situation.toolKeys).map((letter) => letter.toUpperCase())
        expect(new Set(keys).size, language).toBe(keys.length)
        expect(keys, language).not.toContain('R')
        keys.forEach((letter) => expect(letter, language).toMatch(/^[A-Z]$/))
    }
})

test('Meten and Plan als achtergrond open a small panel beside the rail; a choice, Esc or a click outside closes it', () => {
    mount(SituationSchema, baseProject(), {pageIndex: 0})
    expect(byId('sit-rail-measure-panel')).toBeNull()
    fireEvent.click(getById('sit-rail-measure'))
    expect(getById('sit-rail-measure')).toHaveAttribute('aria-expanded', 'true')
    // a distance, with its key; the scale of the plan only once there is a plan
    expect(getById('sit-tool-measure')).toHaveTextContent('E')
    expect(getById('sit-underlay-scale')).toBeDisabled()
    expect(getById('sit-underlay-scale')).toHaveTextContent(t('underlay.scaleNeedsPlan'))
    fireEvent.click(getById('sit-tool-measure'))
    expect(byId('sit-rail-measure-panel')).toBeNull()
    // the entry shows the tool is on
    expect(getById('sit-rail-measure')).toHaveClass('on')
    // the key still chooses it, from any tool
    fireEvent.click(getById('sit-tool-wall'))
    expect(getById('sit-rail-measure')).not.toHaveClass('on')
    fireEvent.keyDown(document.body, {key: 'e'})
    expect(getById('sit-rail-measure')).toHaveClass('on')
    // the plan: one panel at a time; Esc and a click outside close it
    fireEvent.click(getById('sit-rail-underlay'))
    getById('sit-underlay-add')
    fireEvent.click(getById('sit-rail-measure'))
    expect(byId('sit-rail-underlay-panel')).toBeNull()
    fireEvent.keyDown(document, {key: 'Escape'})
    expect(byId('sit-rail-measure-panel')).toBeNull()
    fireEvent.click(getById('sit-rail-underlay'))
    fireEvent.pointerDown(document.body)
    expect(byId('sit-rail-underlay-panel')).toBeNull()
    // the bar under the plan is back to the grid, free drawing and the symbol size
    expect(byId('sit-underlay-opacity')).toBeNull()
})

test('the bedradingsschema has no Meten or plan menus', () => {
    mount(SituationSchema, {...baseProject(), wire: [{id: 'w1', name: '1', walls: [], items: [], wires: []}]}, {pageIndex: 0, listKey: 'wire'})
    expect(byId('wire-rail-measure')).toBeNull()
    expect(byId('wire-rail-underlay')).toBeNull()
})
