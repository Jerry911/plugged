// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The bedradingsschema tab: the editor of the situatieschema with wires (on the connection points of the symbols), frames and line styles.
import {fireEvent, render} from '@testing-library/react'
import SituationSchema from '../../../features/situation/SituationSchema.jsx'
import PageBar from '../../../app/PageBar.jsx'
import {baseProject, byId, clickId, getById, mount, node} from '../../utils.jsx'

const sym = (id, type, x, y, extra = {}) => ({id, kind: 'sym', type, x, y, r: 0, s: 10, ...extra})
const wiring = (page = {}, over = {}) => ({
    ...baseProject(),
    wire: [{id: 'w1', name: 'Bedrading 1', walls: [], items: [], wires: [], boxes: [], ...page}],
    ...over,
})
// a contact above a lamp: the lower point of the contact is (60, 65), the upper one of the lamp (60, 115)
const contactAndLamp = (wires = []) => wiring({items: [sym('c', 'contact_no', 60, 60), sym('l', 'lamp_s', 60, 120)], wires})
const attached = {id: 'w', a: {item: 'c', pin: 1}, b: {item: 'l', pin: 0}, points: [], style: 'solid', color: 'black', w: 0.35, ortho: true}
const sheet = (container) => container.querySelector('svg.sheet')
const click = (container, x, y, extra = {}) => fireEvent.click(sheet(container), {clientX: x, clientY: y, ...extra})
const tool = (name) => clickId('wire-tool-' + name)
const page = (spy) => spy.project.wire[0]
const open = (project) => mount(SituationSchema, project, {pageIndex: 0, listKey: 'wire'})

test('the tab has the wire and frame tools, its own ids, no list of elements to place and no templates', () => {
    const {container} = open(wiring())
    expect(byId('wire-tool-wire')).toBeTruthy()
    expect(byId('wire-tool-box')).toBeTruthy()
    expect(byId('sit-tool-wall')).toBeNull()
    expect(byId('wire-sheet')).toBeTruthy()
    expect(byId('sit-unplaced-panel')).toBeNull()
    expect(byId('wire-template')).toBeNull()
    // the symbols of control circuits first in the palette, the furniture last
    const keys = [...container.querySelectorAll('#sit-palette .compbtn')].map((button) => button.id)
    expect(keys[0]).toBe('comp-contact_no')
    expect(keys.at(-1)).toBe('comp-auto')
    expect(keys).toContain('comp-kring')
    // one folding group per category: the contacts first and open, the others folded until a search opens them all
    const groups = [...container.querySelectorAll('#sit-palette details.palgroup')]
    expect(groups[0].id).toBe('comp-category-Contacten___schakelaars')
    expect(groups.map((group) => group.open)).toEqual(groups.map((_, index) => index === 0))
    expect(groups.at(-1).id).toBe('comp-category-Inrichting')
    expect(getById('comp-iec_13_03_v').closest('details')).toBe(groups[0])
    fireEvent.change(getById('comp-filter'), {target: {value: 'standhoudend'}})
    const found = [...container.querySelectorAll('#sit-palette details.palgroup')]
    expect(found.every((group) => group.open)).toBe(true)
    expect(found.some((group) => group.querySelector('#comp-iec_13_03_v'))).toBe(true)
})
test('a wire drawn from a connection point to a connection point is attached to both symbols, in the line style of the pen', () => {
    const {container, spy} = open(contactAndLamp())
    tool('wire')
    expect(container.querySelectorAll('#wire-pins circle')).toHaveLength(4)
    clickId('wire-pen-style-dotted')
    clickId('wire-pen-color-red')
    click(container, 61, 66)
    click(container, 60, 100) // a bend
    click(container, 59, 114)
    expect(page(spy).wires).toHaveLength(1)
    expect(page(spy).wires[0]).toMatchObject({a: {item: 'c', pin: 1}, b: {item: 'l', pin: 0}, points: [{x: 60, y: 100}], style: 'dotted', color: 'red', ortho: true})
})
test('a click on the start point again drops a wire without bends; the wire tool stays on', () => {
    const {container, spy} = open(wiring())
    tool('wire')
    click(container, 40, 40)
    click(container, 40, 40)
    expect(page(spy).wires).toHaveLength(0)
    click(container, 40, 40)
    click(container, 80, 40)
    click(container, 80, 40) // a double click: ends here
    expect(page(spy).wires).toEqual([expect.objectContaining({a: {x: 40, y: 40}, b: {x: 80, y: 40}, points: []})])
    expect(getById('wire-tool-wire')).toHaveClass('on')
})
test('a right click ends the wire at its last point, the next one goes back to Selecteer', () => {
    const {container, spy} = open(wiring())
    tool('wire')
    click(container, 40, 40)
    click(container, 80, 40)
    fireEvent.contextMenu(sheet(container))
    expect(page(spy).wires).toHaveLength(1)
    expect(getById('wire-tool-wire')).toHaveClass('on')
    fireEvent.contextMenu(sheet(container))
    expect(getById('wire-tool-select')).toHaveClass('on')
})
test('deleting a symbol leaves its wires with a free end where it was', () => {
    const {spy} = open(contactAndLamp([attached]))
    fireEvent.pointerDown(getById('wire-item-l'), {clientX: 60, clientY: 120})
    fireEvent.pointerUp(document.querySelector('svg.sheet'))
    clickId('wire-delete')
    expect(page(spy).items.map((item) => item.id)).toEqual(['c'])
    expect(page(spy).wires[0]).toMatchObject({a: {item: 'c', pin: 1}, b: {x: 60, y: 115}})
})
test('a copied symbol and wire stay attached to each other; the end on a symbol that is not copied becomes free', () => {
    const {container, spy} = open(contactAndLamp([attached]))
    // a selection box around the lamp and the lower part of the wire
    fireEvent.pointerDown(sheet(container), {clientX: 40, clientY: 100})
    fireEvent.pointerMove(sheet(container), {clientX: 80, clientY: 140})
    fireEvent.pointerUp(sheet(container))
    clickId('wire-multi-duplicate')
    const {items, wires} = page(spy)
    expect(items).toHaveLength(3)
    const copy = items[2]
    expect(copy).toMatchObject({type: 'lamp_s', x: 65, y: 125})
    expect(wires[1]).toMatchObject({a: {x: 65, y: 70}, b: {item: copy.id, pin: 0}})
})
test('the selected wire changes colour and style; its length shows', () => {
    const {spy} = open(contactAndLamp([attached]))
    fireEvent.pointerDown(getById('wire-wire-w'), {clientX: 60, clientY: 90})
    fireEvent.pointerUp(document.querySelector('svg.sheet'))
    expect(getById('wire-wire-title').textContent).toBe('Draad · 2,50 m')
    clickId('wire-sel-color-blue')
    clickId('wire-sel-style-dashed')
    fireEvent.change(getById('wire-sel-width'), {target: {value: '0.7'}})
    expect(page(spy).wires[0]).toMatchObject({color: 'blue', style: 'dashed', w: 0.7})
})
test('a frame is drawn with two clicks', () => {
    const {container, spy} = open(wiring())
    tool('box')
    clickId('wire-pen-color-gray')
    click(container, 20, 20)
    click(container, 120, 80)
    expect(page(spy).boxes).toEqual([expect.objectContaining({x1: 20, y1: 20, x2: 120, y2: 80, color: 'gray', style: 'solid'})])
})
test('the dialog copies a plan of the situatieschema onto the page', () => {
    const project = wiring(
        {},
        {
            een: [{id: 'e1', name: 'B', tree: [node('a', 'aansluiting', [node('b', 'bord', [node('k', 'kring', [node('s', 'stopcontact')], {label: 'C'})])])]}],
            sit: [
                {id: 's1', name: 'Leeg', walls: [], items: []},
                {id: 's2', name: 'Gelijkvloers', walls: [{id: 'm', x1: 0, y1: 0, x2: 50, y2: 0}], items: [{id: 'p', kind: 'sym', node: 's', x: 5, y: 5, r: 0, s: 7}]},
            ],
        },
    )
    const onStatus = vi.fn()
    const {spy} = mount(SituationSchema, project, {pageIndex: 0, listKey: 'wire', onStatus})
    clickId('wire-copy-plan')
    // the first plan with a drawing is chosen
    expect(getById('copy-plan-page').value).toBe('1')
    clickId('copy-plan-ok')
    expect(page(spy).walls).toHaveLength(1)
    expect(page(spy).items).toEqual([expect.objectContaining({type: 'stopcontact', mark: 'C1'})])
    expect(onStatus).toHaveBeenCalledWith("Plattegrond 'Gelijkvloers' overgenomen.")
    expect(byId('copy-plan-dialog')).toBeNull()
})
test('without a drawn plan there is nothing to copy', () => {
    open(wiring())
    expect(getById('wire-copy-plan')).toBeDisabled()
    expect(byId('wire-empty')).toBeNull()
})
test('a duplicated page of the bedradingsschema keeps its wires on the copies of its symbols', () => {
    const project = contactAndLamp([attached])
    let current = project
    render(<PageBar project={project} setProject={(next) => (current = next)} listKey="wire" pageIndex={0} setPageIndex={() => {}} />)
    clickId('wire-page-duplicate')
    const copy = current.wire[1]
    expect(copy.items.map((item) => item.id)).not.toContain('c')
    expect(copy.wires[0].a.item).toBe(copy.items[0].id)
    expect(copy.wires[0].b.item).toBe(copy.items[1].id)
    expect(copy.wires[0].id).not.toBe('w')
})
