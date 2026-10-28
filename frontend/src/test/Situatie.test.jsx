// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, screen} from '@testing-library/react'
import SituationSchema, {SitSheet, ZOOMS} from '../SituationSchema.jsx'
import {base, mount, node} from './utils.jsx'
import {marksOf} from '../util.jsx'

const P = () => ({...base(), een: [{id: 'e1', name: 'B', tree: [node('n1', 'stopcontact', [], {label: 'Keuken stopcontact'})]}]})
const sv = (c) => c.querySelector('svg.sheet'),
    clk = (c, x, y) => fireEvent.click(sv(c), {clientX: x, clientY: y}),
    tool = (n) => fireEvent.click(screen.getByRole('button', {name: n}))
const sit = (spy) => spy.p.sit[0]
const wall = (id, x1, y1, x2, y2) => ({id, x1, y1, x2, y2})
test('walls: chain, stop on same point, ignore footer area, right click', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Muur')
    clk(container, 10, 20)
    clk(container, 50, 20)
    clk(container, 50, 60)
    expect(sit(spy).walls).toHaveLength(2)
    clk(container, 50, 60)
    clk(container, 70, 70)
    expect(sit(spy).walls).toHaveLength(2)
    clk(container, 70, 190)
    fireEvent.contextMenu(sv(container))
    expect(screen.getByRole('button', {name: 'Selecteer'})).toHaveClass('on')
    clk(container, 80, 80)
    expect(sit(spy).walls).toHaveLength(2)
})
test('room tool draws four walls, degenerate ignored', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Kamer')
    clk(container, 10, 10)
    clk(container, 60, 50)
    expect(sit(spy).walls).toHaveLength(4)
    clk(container, 10, 10)
    clk(container, 10, 50)
    expect(sit(spy).walls).toHaveLength(4)
})
test('doors and windows snap to walls or float', () => {
    const init = P()
    init.sit[0].walls = [wall('w', 10, 20, 50, 20)]
    const {container, spy} = mount(SituationSchema, init, {idx: 0})
    tool('Deur')
    clk(container, 30, 25)
    expect(sit(spy).items[0]).toMatchObject({kind: 'door', x: 30, y: 20, r: 0})
    clk(container, 150, 150)
    expect(sit(spy).items[1]).toMatchObject({x: 150, y: 150, r: 0})
    tool('Raam')
    clk(container, 30, 25)
    expect(sit(spy).items[2].kind).toBe('window')
})
test('symbols and warnings, auto place, text tool', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    screen.getByText(/Nergens geplaatst \(1\)/)
    clk(container, 50, 50)
    tool('Symbool')
    clk(container, 50, 50)
    expect(sit(spy).items).toHaveLength(0)
    // left list = general components: placed without a link to the eendraadschema, so n1 stays unplaced
    fireEvent.click(container.querySelector('#comp-stopcontact'))
    clk(container, 50, 50)
    expect(sit(spy).items[0]).toMatchObject({kind: 'sym', type: 'stopcontact', x: 50, y: 50})
    expect(sit(spy).items[0].node).toBeUndefined()
    screen.getByText(/Nergens geplaatst \(1\)/)
    // right list = the eendraadschema's own components: linked through `node`
    fireEvent.click(container.querySelector('#unplaced-n1'))
    expect(sit(spy).items[1]).toMatchObject({kind: 'sym', node: 'n1'})
    screen.getByText('✓ Alle componenten geplaatst')
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Lokaal').mockReturnValueOnce(null)
    tool('Tekst')
    clk(container, 20, 20)
    clk(container, 30, 30)
    expect(sit(spy).items.filter((i) => i.kind === 'text')).toHaveLength(1)
})
test('auto place missing components', () => {
    const {spy} = mount(SituationSchema, P(), {idx: 0})
    fireEvent.click(screen.getByText('Plaats ontbrekende op dit blad'))
    expect(sit(spy).items[0]).toMatchObject({kind: 'sym', node: 'n1'})
})
test('select, drag, inspect, keyboard and erase items', () => {
    const init = P()
    init.sit[0].items = [{id: 'i1', kind: 'sym', node: 'n1', x: 100, y: 100, r: 0, s: 7}]
    const {container, spy} = mount(SituationSchema, init, {idx: 0})
    const grab = () => container.querySelector('svg.sheet g[style*="move"]')
    fireEvent.pointerMove(sv(container), {clientX: 5, clientY: 5})
    fireEvent.pointerDown(grab(), {clientX: 100, clientY: 100})
    screen.getByText('Geselecteerd: sym')
    fireEvent.pointerMove(sv(container), {clientX: 100, clientY: 100})
    fireEvent.pointerMove(sv(container), {clientX: 110, clientY: 105})
    expect(sit(spy).items[0]).toMatchObject({x: 110, y: 105})
    fireEvent.pointerUp(sv(container))
    fireEvent.pointerMove(sv(container), {clientX: 200, clientY: 200})
    expect(sit(spy).items[0].x).toBe(110)
    fireEvent.pointerLeave(sv(container))
    fireEvent.click(screen.getByText('⟳15°'))
    fireEvent.click(screen.getByText('⟲15°'))
    fireEvent.click(screen.getByText('⟳90°'))
    expect(sit(spy).items[0].r).toBe(90)
    fireEvent.change(container.querySelector('input[type=range]'), {target: {value: '12'}})
    expect(sit(spy).items[0].s).toBe(12)
    const b = document.body
    fireEvent.keyDown(b, {key: 'ArrowRight'})
    fireEvent.keyDown(b, {key: 'ArrowUp'})
    expect(sit(spy).items[0]).toMatchObject({x: 115, y: 100})
    fireEvent.keyDown(b, {key: 'r'})
    expect(sit(spy).items[0].r).toBe(105)
    fireEvent.keyDown(b, {key: 'x'})
    fireEvent.keyDown(container.querySelector('select'), {key: 'Delete'})
    expect(sit(spy).items).toHaveLength(1)
    fireEvent.click(screen.getByText('⧉'))
    expect(sit(spy).items).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', {name: 'Verwijder selectie'}))
    expect(sit(spy).items).toHaveLength(1)
    fireEvent.click(grab())
    fireEvent.click(sv(container), {clientX: 5, clientY: 5})
    expect(screen.queryByText(/Geselecteerd/)).toBeNull()
    fireEvent.pointerDown(grab(), {clientX: 115, clientY: 100})
    fireEvent.keyDown(b, {key: 'Delete'})
    expect(sit(spy).items).toHaveLength(0)
    fireEvent.keyDown(b, {key: 'Delete'})
})
test('door inspector flips and text edit; erase tool; snap', () => {
    const init = P()
    init.sit[0].walls = [wall('w', 10, 20, 50, 20)]
    init.sit[0].items = [
        {id: 'd', kind: 'door', x: 30, y: 20, r: 0, w: 10},
        {id: 't', kind: 'text', x: 60, y: 60, txt: 'Hal', s: 4, r: 0},
    ]
    const {container, spy} = mount(SituationSchema, init, {idx: 0})
    const moves = () => [...container.querySelectorAll('svg.sheet g[style*="move"]')]
    fireEvent.pointerDown(moves()[0], {clientX: 30, clientY: 20})
    fireEvent.click(screen.getByText('⇅ spiegel'))
    fireEvent.click(screen.getByText('⇄ spiegel'))
    expect(sit(spy).items[0]).toMatchObject({f: true, m: true})
    fireEvent.pointerMove(sv(container), {clientX: 34, clientY: 24})
    expect(sit(spy).items[0]).toMatchObject({x: 35, y: 20})
    fireEvent.pointerDown(moves()[1], {clientX: 60, clientY: 60})
    fireEvent.change(screen.getByDisplayValue('Hal'), {target: {value: 'Keuken'}})
    expect(sit(spy).items[1].txt).toBe('Keuken')
    fireEvent.change(container.querySelector('select'), {target: {value: '10'}})
    fireEvent.pointerDown(moves()[1], {clientX: 60, clientY: 60})
    fireEvent.pointerMove(sv(container), {clientX: 68, clientY: 68})
    expect(sit(spy).items[1].x).toBe(70)
    tool('Wis')
    fireEvent.click(container.querySelector('svg.sheet g[style*="not-allowed"]'))
    expect(sit(spy).items).toHaveLength(1)
})
test('walls: select, move, handles, delete, erase', () => {
    const init = P()
    init.sit[0].walls = [wall('w', 10, 20, 50, 20), wall('v', 10, 60, 50, 60)]
    const {container, spy} = mount(SituationSchema, init, {idx: 0})
    const hit = (i) => container.querySelectorAll('line[stroke="transparent"]')[i]
    fireEvent.pointerDown(hit(0), {clientX: 20, clientY: 20})
    expect(screen.getByLabelText(/Lengte/).value).toBe('2,00 m')
    fireEvent.pointerMove(sv(container), {clientX: 20, clientY: 30})
    expect(sit(spy).walls[0]).toMatchObject({y1: 30, y2: 30})
    const hs = sv(container).querySelectorAll('circle[r="1.8"]')
    fireEvent.pointerDown(hs[0], {clientX: 10, clientY: 30})
    fireEvent.pointerMove(sv(container), {clientX: 15, clientY: 35})
    expect(sit(spy).walls[0]).toMatchObject({x1: 15, y1: 35, x2: 50})
    fireEvent.pointerUp(sv(container))
    fireEvent.pointerDown(sv(container).querySelectorAll('circle[r="1.8"]')[1], {clientX: 50, clientY: 30})
    fireEvent.pointerMove(sv(container), {clientX: 55, clientY: 30})
    expect(sit(spy).walls[0].x2).toBe(55)
    fireEvent.pointerUp(sv(container))
    fireEvent.click(screen.getByRole('button', {name: 'Verwijder selectie'}))
    expect(sit(spy).walls).toHaveLength(1)
    tool('Wis')
    fireEvent.pointerDown(hit(0), {clientX: 20, clientY: 60})
    fireEvent.click(hit(0))
    expect(sit(spy).walls).toHaveLength(0)
})
test('SitSheet static: orphan symbol, text, window, no handles', () => {
    const p = P(),
        pg = {
            id: 's',
            name: 'X',
            walls: [wall('w', 0, 0, 10, 0)],
            items: [
                {id: '1', kind: 'sym', node: 'ghost', x: 5, y: 5},
                {id: '2', kind: 'text', x: 1, y: 1, txt: 'Hi'},
                {id: '3', kind: 'window', x: 5, y: 0, r: 0},
            ],
        }
    const {container} = render(<SitSheet p={p} pg={pg} no={2} total={3} />)
    screen.getByText('(verwijderd)')
    screen.getByText('Hi')
    expect(container.querySelector('line[stroke="transparent"]')).toBeNull()
    screen.getByText(/Situatieschema – X/)
})
test('grid dots follow the snap setting; the selector lives in the drawing', () => {
    const {container} = mount(SituationSchema, P(), {idx: 0}),
        sel = container.querySelector('.gridsel select'),
        w = (id) => container.querySelector('#' + id).getAttribute('width')
    expect(sel).toBeTruthy()
    expect([w('gMinor'), w('gMajor')]).toEqual(['5', '10'])
    fireEvent.change(sel, {target: {value: '2.5'}})
    expect(w('gMinor')).toBe('2.5')
    fireEvent.change(sel, {target: {value: '10'}})
    expect(w('gMinor')).toBe('10')
    expect(container.querySelectorAll('rect[fill^="url(#g"]')).toHaveLength(2)
    expect(container.querySelector('#gMinor circle').getAttribute('r')).not.toBe('0')
})
test('canvas delete button only appears once something is selected', () => {
    const init = P()
    init.sit[0].items = [{id: 'i1', kind: 'text', x: 20, y: 20, txt: 'Hal', s: 4, r: 0}]
    const {container, spy} = mount(SituationSchema, init, {idx: 0}),
        btn = () => screen.queryByRole('button', {name: 'Verwijder selectie'})
    expect(btn()).toBeNull()
    fireEvent.pointerDown(container.querySelector('svg.sheet g[style*="move"]'), {clientX: 20, clientY: 20})
    fireEvent.pointerUp(container.querySelector('svg.sheet'))
    expect(btn()).not.toBeNull()
    fireEvent.click(btn())
    expect(sit(spy).items).toHaveLength(0)
    expect(btn()).toBeNull()
})
test('footer cells call onFooter', () => {
    const fn = vi.fn(),
        {container} = mount(SituationSchema, P(), {idx: 0, onFooter: fn})
    fireEvent.click(container.querySelectorAll('.fcell')[1])
    expect(fn).toHaveBeenCalledWith('straat')
})

test('footer page number counts all printed een sheets before the situatieschema', () => {
    const p = {
        ...P(),
        een: [
            {id: 'e1', name: 'A', tree: []},
            {id: 'e2', name: 'B', tree: []},
        ],
    }
    mount(SituationSchema, p, {idx: 0})
    screen.getByText('Blad 1/1')
})

test('drawing snaps to grid points by default; free drawing is an opt-in checkbox', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    const cb = screen.getByLabelText('Vrij tekenen')
    expect(cb).not.toBeChecked()
    tool('Muur')
    clk(container, 12, 17)
    clk(container, 48, 17)
    expect(sit(spy).walls[0]).toMatchObject({x1: 10, y1: 15, x2: 50, y2: 15})
    fireEvent.contextMenu(sv(container))
    tool('Muur')
    fireEvent.click(cb)
    expect(cb).toBeChecked()
    clk(container, 12.34, 17.26)
    clk(container, 30.12, 40.06)
    expect(sit(spy).walls[1]).toMatchObject({x1: 12.3, y1: 17.3, x2: 30.1, y2: 40.1})
    fireEvent.click(cb)
    fireEvent.contextMenu(sv(container))
    tool('Muur')
    fireEvent.change(container.querySelector('.gridsel select'), {target: {value: '2.5'}})
    clk(container, 13.9, 21)
    clk(container, 26, 21)
    expect(sit(spy).walls[2]).toMatchObject({x1: 15, y1: 20, x2: 25, y2: 20})
})
test('Escape cancels the active tool like a right click', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Muur')
    clk(container, 12, 17)
    fireEvent.keyDown(window, {key: 'Escape'})
    expect(screen.getByText('Selecteer')).toHaveClass('on')
    clk(container, 48, 17)
    expect(sit(spy)?.walls ?? []).toHaveLength(0)
})
test('a cursor marker shows the snapped grid point; walls and rooms get a preview', () => {
    const {container} = mount(SituationSchema, P(), {idx: 0}),
        mv = (x, y) => fireEvent.pointerMove(sv(container), {clientX: x, clientY: y}),
        mark = () => container.querySelector('svg.sheet g[stroke="#0a6cff"] circle')
    mv(12, 17)
    expect(mark()).toBeNull()
    tool('Muur')
    mv(12, 17)
    expect(mark().getAttribute('cx')).toBe('10')
    expect(mark().getAttribute('cy')).toBe('15')
    mv(12.4, 17.4)
    mv(13, 18)
    expect(mark().getAttribute('cx')).toBe('15')
    expect(container.querySelector('line[stroke-dasharray]')).toBeNull()
    clk(container, 12, 17)
    mv(48, 37)
    const pv = container.querySelector('line[stroke-dasharray]')
    expect(pv.getAttribute('x1')).toBe('10')
    expect(pv.getAttribute('x2')).toBe('50')
    expect(pv.getAttribute('y2')).toBe('35')
    tool('Kamer')
    mv(12, 17)
    clk(container, 12, 17)
    mv(52, 47)
    const r = container.querySelector('rect[stroke-dasharray]')
    expect(r.getAttribute('width')).toBe('40')
    expect(r.getAttribute('height')).toBe('30')
    fireEvent.pointerLeave(sv(container))
    expect(mark()).toBeNull()
    mv(12, 17)
    tool('Selecteer')
    expect(mark()).toBeNull()
    tool('Wis')
    mv(20, 20)
    expect(mark()).toBeNull()
})
test('dragging snaps items and walls onto grid points (not when free)', () => {
    const init = P()
    init.sit[0].items = [{id: 't', kind: 'text', x: 101, y: 98, txt: 'Hal', s: 4, r: 0}]
    init.sit[0].walls = [wall('w', 11, 22, 51, 22)]
    const {container, spy} = mount(SituationSchema, init, {idx: 0}),
        it = () => container.querySelector('svg.sheet g[style*="move"]'),
        hit = () => container.querySelector('line[stroke="transparent"]')
    fireEvent.pointerDown(it(), {clientX: 101, clientY: 98})
    fireEvent.pointerMove(sv(container), {clientX: 101, clientY: 98})
    expect(sit(spy).items[0]).toMatchObject({x: 100, y: 100})
    fireEvent.pointerUp(sv(container))
    fireEvent.pointerDown(hit(), {clientX: 30, clientY: 22})
    fireEvent.pointerMove(sv(container), {clientX: 30, clientY: 32})
    expect(sit(spy).walls[0]).toMatchObject({x1: 10, y1: 30, x2: 50, y2: 30})
    fireEvent.pointerUp(sv(container))
    fireEvent.click(screen.getByLabelText('Vrij tekenen'))
    fireEvent.pointerDown(it(), {clientX: 100, clientY: 100})
    fireEvent.pointerMove(sv(container), {clientX: 103.33, clientY: 101.27})
    expect(sit(spy).items[0]).toMatchObject({x: 103.3, y: 101.3})
})
test('zoom buttons in the top right of the drawing', () => {
    const {container} = mount(SituationSchema, P(), {idx: 0}),
        pct = () => screen.getByTitle('Zoom terugzetten (100%)'),
        inner = () => container.querySelector('.zoomscroll > div'),
        zin = () => screen.getByTitle('Inzoomen'),
        zout = () => screen.getByTitle('Uitzoomen')
    expect(pct().textContent).toBe('100%')
    expect(inner().style.width).toBe('100%')
    expect(container.querySelector('.zoomscroll').style.maxHeight).toBe('none')
    fireEvent.click(zin())
    expect(pct().textContent).toBe('150%')
    expect(inner().style.width).toBe('150%')
    expect(container.querySelector('.zoomscroll').style.maxHeight).toBe('82vh')
    expect(container.querySelector('.gridsel').style.bottom).toBe('12px')
    for (let i = 0; i < 10; i++) fireEvent.click(zin())
    expect(pct().textContent).toBe('400%')
    expect(zin()).toBeDisabled()
    fireEvent.click(pct())
    expect(pct().textContent).toBe('100%')
    for (let i = 0; i < 10; i++) fireEvent.click(zout())
    expect(pct().textContent).toBe('50%')
    expect(zout()).toBeDisabled()
    expect(ZOOMS).toEqual([0.5, 0.75, 1, 1.5, 2, 3, 4])
    fireEvent.click(zin())
    expect(pct().textContent).toBe('75%')
})
test('drawing still works while zoomed', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    fireEvent.click(screen.getByTitle('Inzoomen'))
    tool('Muur')
    clk(container, 12, 17)
    clk(container, 48, 17)
    expect(sit(spy).walls).toHaveLength(1)
})

// ---- right click, box selection, multi-select ----
const dn = (c, x, y, o = {}) => fireEvent.pointerDown(sv(c), {clientX: x, clientY: y, ...o}),
    mv = (c, x, y) => fireEvent.pointerMove(sv(c), {clientX: x, clientY: y}),
    up = (c) => fireEvent.pointerUp(sv(c)),
    boxRect = (c) => c.querySelector('svg.sheet rect[fill-opacity]'),
    grabs = (c) => [...c.querySelectorAll('svg.sheet g[style*="move"]')]
const MULTI = () => {
    const init = P()
    init.sit[0].walls = [wall('w', 10, 20, 50, 20), wall('v', 100, 100, 140, 100)]
    init.sit[0].items = [
        {id: 'a', kind: 'text', x: 30, y: 40, txt: 'Hal', s: 4, r: 0},
        {id: 'b', kind: 'sym', node: 'n1', x: 60, y: 40, r: 0, s: 7},
        {id: 'c', kind: 'door', x: 200, y: 60, r: 0, w: 10},
    ]
    return init
}
test('right click cancels drawing, hides the dimension input and switches to select', () => {
    const {container} = mount(SituationSchema, P(), {idx: 0})
    tool('Muur')
    clk(container, 10, 20)
    mv(container, 50, 20)
    expect(container.querySelector('.dimbox')).toBeTruthy()
    expect(container.querySelector('line[stroke-dasharray]')).toBeTruthy()
    fireEvent.contextMenu(sv(container))
    expect(screen.getByRole('button', {name: 'Selecteer'})).toHaveClass('on')
    expect(screen.getByRole('button', {name: 'Muur'})).not.toHaveClass('on')
    expect(container.querySelector('.dimbox')).toBeNull()
    expect(container.querySelector('line[stroke-dasharray]')).toBeNull()
})
test('dragging on an empty spot draws a box and selects everything it touches', () => {
    const {container, spy} = mount(SituationSchema, MULTI(), {idx: 0})
    dn(container, 5, 10)
    mv(container, 70, 50)
    expect(boxRect(container)).toBeTruthy()
    expect(boxRect(container).getAttribute('width')).toBe('65')
    up(container)
    expect(boxRect(container)).toBeNull()
    screen.getByText('3 elementen geselecteerd')
    expect(sv(container).querySelectorAll('circle[r="1.8"]')).toHaveLength(0)
    // the click that follows the drag must not clear the selection, the next one does
    fireEvent.click(sv(container), {clientX: 150, clientY: 150})
    screen.getByText('3 elementen geselecteerd')
    fireEvent.click(sv(container), {clientX: 150, clientY: 150})
    expect(screen.queryByText(/elementen geselecteerd/)).toBeNull()
    expect(sit(spy).walls).toHaveLength(2)
})
test('Shift + box adds to the selection; tiny boxes, other tools, the footer and right button do not box-select', () => {
    const {container} = mount(SituationSchema, MULTI(), {idx: 0})
    dn(container, 5, 10)
    mv(container, 70, 50)
    up(container)
    dn(container, 90, 90, {shiftKey: true})
    mv(container, 150, 110)
    up(container)
    screen.getByText('4 elementen geselecteerd')
    fireEvent.click(sv(container), {clientX: 150, clientY: 150})
    fireEvent.click(sv(container), {clientX: 150, clientY: 150})
    dn(container, 150, 150)
    mv(container, 150.5, 150.5)
    up(container)
    expect(screen.queryByText(/geselecteerd:/)).toBeNull()
    dn(container, 150, 190)
    mv(container, 160, 195)
    expect(boxRect(container)).toBeNull()
    dn(container, 150, 150, {button: 2})
    mv(container, 160, 160)
    expect(boxRect(container)).toBeNull()
    tool('Muur')
    dn(container, 5, 10)
    mv(container, 70, 50)
    expect(boxRect(container)).toBeNull()
})
test('leaving the drawing cancels a box', () => {
    const {container} = mount(SituationSchema, MULTI(), {idx: 0})
    dn(container, 5, 10)
    mv(container, 70, 50)
    expect(boxRect(container)).toBeTruthy()
    fireEvent.pointerLeave(sv(container))
    expect(boxRect(container)).toBeNull()
    up(container)
    expect(screen.queryByText(/elementen geselecteerd/)).toBeNull()
})
test('a box can select a diagonal wall only when the wall crosses it', () => {
    const init = P()
    init.sit[0].walls = [wall('d', 10, 10, 100, 100)]
    const {container} = mount(SituationSchema, init, {idx: 0})
    dn(container, 70, 20)
    mv(container, 90, 40)
    up(container)
    expect(container.querySelector('[aria-label="Verwijder selectie"]')).toBeNull()
    dn(container, 40, 40)
    mv(container, 60, 60)
    up(container)
    expect(container.querySelector('[aria-label="Verwijder selectie"]')).toBeTruthy()
})
test('a group moves, rotates, duplicates and is deleted together', () => {
    const {container, spy} = mount(SituationSchema, MULTI(), {idx: 0})
    dn(container, 5, 10)
    mv(container, 70, 50)
    up(container)
    fireEvent.pointerDown(grabs(container)[1], {clientX: 60, clientY: 40})
    fireEvent.pointerMove(sv(container), {clientX: 70, clientY: 45})
    expect(sit(spy).items.map((i) => [i.x, i.y])).toEqual([
        [40, 45],
        [70, 45],
        [200, 60],
    ])
    expect(sit(spy).walls[0]).toMatchObject({x1: 20, y1: 25, x2: 60, y2: 25})
    expect(sit(spy).walls[1]).toMatchObject({x1: 100, y1: 100})
    up(container)
    screen.getByText('3 elementen geselecteerd')
    fireEvent.keyDown(document.body, {key: 'ArrowLeft'})
    fireEvent.keyDown(document.body, {key: 'ArrowDown'})
    expect(sit(spy).items[1]).toMatchObject({x: 65, y: 50})
    expect(sit(spy).walls[0]).toMatchObject({x1: 15, y1: 30})
    expect(sit(spy).items[2]).toMatchObject({x: 200, y: 60})
    fireEvent.keyDown(document.body, {key: 'r'})
    expect(sit(spy).items.map((i) => i.r || 0)).toEqual([15, 15, 0])
    fireEvent.click(screen.getByText('⟲15°'))
    fireEvent.click(screen.getByText('⟳15°'))
    fireEvent.click(screen.getByText('⟲15°'))
    expect(sit(spy).items.map((i) => i.r || 0)).toEqual([0, 0, 0])
    fireEvent.click(screen.getByText('⧉'))
    expect(sit(spy).walls).toHaveLength(3)
    expect(sit(spy).items).toHaveLength(5)
    screen.getByText('3 elementen geselecteerd')
    fireEvent.keyDown(document.body, {key: 'Delete'})
    expect(sit(spy).walls.map((w) => w.id)).toEqual(['w', 'v'])
    expect(sit(spy).items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(screen.queryByText(/elementen geselecteerd/)).toBeNull()
})
test('Shift-click toggles an item in the selection; a plain click replaces it', () => {
    const {container} = mount(SituationSchema, MULTI(), {idx: 0})
    fireEvent.pointerDown(grabs(container)[0], {clientX: 30, clientY: 40})
    fireEvent.pointerDown(grabs(container)[1], {clientX: 60, clientY: 40, shiftKey: true})
    screen.getByText('2 elementen geselecteerd')
    fireEvent.pointerDown(grabs(container)[1], {clientX: 60, clientY: 40, shiftKey: true})
    expect(screen.queryByText(/elementen geselecteerd/)).toBeNull()
    fireEvent.pointerDown(grabs(container)[1], {clientX: 60, clientY: 40, shiftKey: true})
    fireEvent.pointerDown(grabs(container)[2], {clientX: 200, clientY: 60})
    expect(screen.queryByText(/elementen geselecteerd/)).toBeNull()
    screen.getByText('Geselecteerd: door')
    up(container)
})
test('moving a single door still snaps it to a wall, a group does not', () => {
    const init = P()
    init.sit[0].walls = [wall('w', 10, 20, 50, 20)]
    init.sit[0].items = [{id: 'd', kind: 'door', x: 30, y: 20, r: 0, w: 10}]
    const {container, spy} = mount(SituationSchema, init, {idx: 0})
    fireEvent.pointerDown(grabs(container)[0], {clientX: 30, clientY: 20})
    mv(container, 34, 24)
    expect(sit(spy).items[0]).toMatchObject({x: 35, y: 20})
    up(container)
    dn(container, 5, 10)
    mv(container, 60, 30)
    up(container)
    fireEvent.pointerDown(grabs(container)[0], {clientX: 35, clientY: 20})
    mv(container, 35, 28)
    expect(sit(spy).items[0].y).toBe(30)
})

// ---- delete overlay and easier selection ----
test('a trash button appears at the top right of the selection and deletes it', () => {
    const init = P()
    init.sit[0].items = [{id: 'i', kind: 'sym', node: 'n1', x: 100, y: 100, r: 0, s: 7}]
    const {container, spy} = mount(SituationSchema, init, {idx: 0}),
        trash = () => container.querySelector('[aria-label="Verwijder selectie"]')
    expect(trash()).toBeNull()
    fireEvent.pointerDown(grabs(container)[0], {clientX: 100, clientY: 100})
    expect(trash()).toBeNull()
    up(container)
    expect(trash().getAttribute('transform')).toBe('translate(107.5,92.5)')
    fireEvent.pointerDown(trash(), {clientX: 107, clientY: 92})
    mv(container, 130, 130)
    expect(boxRect(container)).toBeNull()
    fireEvent.click(trash())
    expect(sit(spy).items).toHaveLength(0)
    expect(trash()).toBeNull()
})
test('the trash button covers a whole group, stays inside the sheet and is hidden in other tools', () => {
    const {container} = mount(SituationSchema, MULTI(), {idx: 0}),
        trash = () => container.querySelector('[aria-label="Verwijder selectie"]')
    dn(container, 5, 10)
    mv(container, 70, 50)
    up(container)
    expect(trash().getAttribute('transform')).toBe('translate(67.5,16.2)')
    tool('Muur')
    expect(trash()).toBeNull()
    tool('Selecteer')
    expect(trash()).toBeTruthy()
    dn(container, 150, 150)
    mv(container, 250, 170)
    expect(trash()).toBeNull()
    fireEvent.pointerLeave(sv(container))
    const init = P()
    init.sit[0].items = [{id: 'i', kind: 'sym', node: 'n1', x: 292, y: 6, r: 0, s: 7}]
    const r = mount(SituationSchema, init, {idx: 0})
    fireEvent.pointerDown(grabs(r.container)[0], {clientX: 292, clientY: 6})
    up(r.container)
    expect(r.container.querySelectorAll('[aria-label="Verwijder selectie"]')[0].getAttribute('transform')).toBe('translate(289,8)')
})
test('items and walls have generous invisible hit areas', () => {
    const init = MULTI()
    init.sit[0].items.push({id: 'e', kind: 'window', x: 150, y: 50, r: 0, w: 10})
    const {container} = mount(SituationSchema, init, {idx: 0})
    expect(container.querySelector('line[stroke="transparent"]').getAttribute('stroke-width')).toBe('7')
    const g = grabs(container)
    expect(g).toHaveLength(4)
    g.forEach((x) => expect(x.querySelector('[fill="transparent"]')).toBeTruthy())
    expect(g[1].querySelector('circle[fill="transparent"]').getAttribute('r')).toBe('5')
})

// ---- dimensions ----
const texts = (c) => [...c.querySelectorAll('svg.sheet text')].map((t) => t.textContent)
test('wall lengths are shown from the footer scale and can be hidden with the Maten button', () => {
    const init = P()
    init.sit[0].walls = [wall('w', 10, 20, 50, 20), wall('t', 5, 5, 6, 5)]
    const {container, spy} = mount(SituationSchema, init, {idx: 0}),
        btn = () => screen.getByTitle('Maten tonen/verbergen')
    expect(texts(container)).toContain('2,00 m')
    expect(texts(container).filter((t) => t.endsWith(' m'))).toHaveLength(1)
    expect(btn()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn())
    expect(texts(container)).not.toContain('2,00 m')
    expect(sit(spy).dims).toBe(false)
    expect(btn()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(btn())
    expect(texts(container)).toContain('2,00 m')
    expect(sit(spy).dims).toBe(true)
})
test('the scale of the footer drives the dimensions', () => {
    const p = P()
    p.footer.schaal = '1:100'
    p.sit[0].walls = [wall('w', 10, 20, 50, 20), wall('r', 50, 60, 10, 20)]
    const {container} = mount(SituationSchema, p, {idx: 0})
    expect(texts(container).filter((t) => t === '4,00 m')).toHaveLength(1)
    expect(texts(container)).toContain('5,66 m')
    const q = {...p, footer: {...p.footer, schaal: 'groot'}}
    const r = render(<SitSheet p={q} pg={q.sit[0]} no={1} total={1} />)
    expect(r.container.textContent).toContain('2,00 m')
})
test('static sheets (PDF/print) follow the per-sheet dimension setting', () => {
    const p = P(),
        pg = {id: 's', name: 'X', walls: [wall('w', 10, 20, 50, 20)], items: []}
    const a = render(<SitSheet p={p} pg={pg} no={1} total={1} />)
    expect(a.container.textContent).toContain('2,00 m')
    const b = render(<SitSheet p={p} pg={{...pg, dims: false}} no={1} total={1} />)
    expect(b.container.textContent).not.toContain('2,00 m')
    expect(b.container.querySelector('[aria-label="Verwijder selectie"]')).toBeNull()
})
test('while drawing the length of the preview is shown, even when dimensions are hidden', () => {
    const {container} = mount(SituationSchema, P(), {idx: 0}),
        live = () =>
            [...container.querySelectorAll('svg.sheet text')].filter((t) => t.getAttribute('fill') === '#0a6cff').map((t) => t.textContent)
    fireEvent.click(screen.getByTitle('Maten tonen/verbergen'))
    tool('Muur')
    clk(container, 10, 20)
    mv(container, 50, 20)
    expect(live()).toEqual(['2,00 m'])
    mv(container, 10, 60)
    expect(live()).toEqual(['2,00 m'])
    tool('Kamer')
    clk(container, 10, 20)
    mv(container, 60, 70)
    expect(live()).toEqual(['2,50 m', '2,50 m'])
})
test('the wall length and the door width can be typed in the inspector', () => {
    const init = P()
    init.sit[0].walls = [wall('w', 10, 20, 50, 20), wall('v', 10, 20, 10, 60)]
    init.sit[0].items = [{id: 'd', kind: 'door', x: 30, y: 20, r: 0, w: 10}]
    const {container, spy} = mount(SituationSchema, init, {idx: 0}),
        hit = (i) => container.querySelectorAll('line[stroke="transparent"]')[i]
    fireEvent.pointerDown(hit(0), {clientX: 30, clientY: 20})
    up(container)
    let len = screen.getByLabelText(/Lengte/)
    expect(len.value).toBe('2,00 m')
    fireEvent.change(len, {target: {value: '3'}})
    fireEvent.keyDown(len, {key: 'Enter'})
    expect(sit(spy).walls[0]).toMatchObject({x1: 10, y1: 20, x2: 70, y2: 20})
    len = screen.getByLabelText(/Lengte/)
    expect(len.value).toBe('3,00 m')
    fireEvent.blur(len)
    expect(sit(spy).walls[0].x2).toBe(70)
    fireEvent.change(len, {target: {value: 'abc'}})
    fireEvent.keyDown(len, {key: 'Enter'})
    fireEvent.change(len, {target: {value: '50'}})
    fireEvent.blur(len)
    fireEvent.keyDown(len, {key: 'a'})
    expect(sit(spy).walls[0].x2).toBe(70)
    fireEvent.pointerDown(hit(1), {clientX: 10, clientY: 40})
    up(container)
    fireEvent.change(screen.getByLabelText(/Lengte/), {target: {value: '100cm'}})
    fireEvent.blur(screen.getByLabelText(/Lengte/))
    expect(sit(spy).walls[1]).toMatchObject({x2: 10, y2: 40})
    fireEvent.pointerDown(grabs(container)[0], {clientX: 30, clientY: 20})
    up(container)
    const w = screen.getByLabelText(/Breedte/)
    expect(w.value).toBe('0,50 m')
    fireEvent.change(w, {target: {value: '0,9'}})
    fireEvent.keyDown(w, {key: 'Enter'})
    expect(sit(spy).items[0].w).toBe(18)
    fireEvent.blur(screen.getByLabelText(/Breedte/))
    expect(sit(spy).items[0].w).toBe(18)
    fireEvent.change(screen.getByLabelText(/Breedte/), {target: {value: 'x'}})
    fireEvent.keyDown(screen.getByLabelText(/Breedte/), {key: 'a'})
    expect(sit(spy).items[0].w).toBe(18)
})
test('typing a length while drawing a wall continues the chain in the direction of the cursor', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Muur')
    expect(container.querySelector('.dimbox')).toBeNull()
    clk(container, 10, 20)
    const input = screen.getByPlaceholderText('bv. 3,5 of 350cm')
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, {target: {value: '3,5'}})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(sit(spy).walls[0]).toMatchObject({x1: 10, y1: 20, x2: 80, y2: 20})
    expect(input.value).toBe('')
    mv(container, 80, 60)
    fireEvent.change(input, {target: {value: '350cm'}})
    fireEvent.click(screen.getByText('OK'))
    expect(sit(spy).walls[1]).toMatchObject({x1: 80, y1: 20, x2: 80, y2: 90})
    mv(container, 60, 90)
    fireEvent.change(input, {target: {value: '1'}})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(sit(spy).walls[2]).toMatchObject({x1: 80, y1: 90, x2: 60, y2: 90})
    mv(container, 70, 100)
    fireEvent.change(input, {target: {value: '2'}})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(sit(spy).walls[3].x1).toBe(60)
    expect(sit(spy).walls[3].y2).toBeGreaterThan(90)
})
test('a typed length keeps the direction of the cursor after the mouse left the drawing for the input', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Muur')
    clk(container, 240, 100)
    mv(container, 200, 100)
    fireEvent.pointerLeave(container.querySelector('svg.sheet'))
    const input = screen.getByPlaceholderText('bv. 3,5 of 350cm')
    fireEvent.change(input, {target: {value: '2'}})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(sit(spy).walls[0]).toMatchObject({x1: 240, y1: 100, x2: 200, y2: 100})
})
test('a length that does not fit offers a larger scale that makes it fit', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Muur')
    clk(container, 20, 100)
    const input = screen.getByPlaceholderText('bv. 3,5 of 350cm')
    fireEvent.change(input, {target: {value: '50'}})
    expect(container.querySelector('.dimerr').textContent).toMatch(/1:50/)
    fireEvent.click(screen.getByText('Schaal 1:200'))
    expect(spy.p.footer.schaal).toBe('1:200')
})
test('arrow keys in the length input choose the direction', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Muur')
    clk(container, 100, 100)
    const input = screen.getByPlaceholderText('bv. 3,5 of 350cm')
    fireEvent.change(input, {target: {value: '1'}})
    fireEvent.keyDown(input, {key: 'ArrowUp'})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(sit(spy).walls[0]).toMatchObject({x1: 100, y1: 100, x2: 100, y2: 80})
})
test('a typed length that would end outside the sheet is flagged instead of silently drawn', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Muur')
    clk(container, 240, 100)
    const input = screen.getByPlaceholderText('bv. 3,5 of 350cm')
    fireEvent.change(input, {target: {value: '10'}})
    expect(input).toHaveClass('bad')
    expect(container.querySelector('.dimerr').textContent).toMatch(/buiten het blad/)
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(sit(spy).walls).toHaveLength(0)
})
test('invalid or oversized typed lengths are rejected; Escape stops drawing', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Muur')
    clk(container, 10, 20)
    const input = screen.getByPlaceholderText('bv. 3,5 of 350cm')
    fireEvent.change(input, {target: {value: 'abc'}})
    expect(input).toHaveClass('bad')
    fireEvent.keyDown(input, {key: 'Enter'})
    fireEvent.change(input, {target: {value: '100'}})
    fireEvent.keyDown(input, {key: 'Enter'})
    fireEvent.click(screen.getByText('OK'))
    expect(sit(spy).walls).toHaveLength(0)
    fireEvent.change(input, {target: {value: '2'}})
    expect(input).not.toHaveClass('bad')
    fireEvent.keyDown(input, {key: 'a'})
    fireEvent.keyDown(input, {key: 'Escape'})
    expect(container.querySelector('.dimbox')).toBeNull()
    expect(sit(spy).walls).toHaveLength(0)
})
test('typing "width x height" draws a room from the first point towards the cursor', () => {
    const {container, spy} = mount(SituationSchema, P(), {idx: 0})
    tool('Kamer')
    clk(container, 100, 100)
    const input = screen.getByPlaceholderText('bv. 4x3,5 (m)')
    fireEvent.change(input, {target: {value: '4x'}})
    expect(input).toHaveClass('bad')
    fireEvent.keyDown(input, {key: 'Enter'})
    fireEvent.change(input, {target: {value: '100x1'}})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(sit(spy).walls).toHaveLength(0)
    mv(container, 50, 50)
    fireEvent.change(input, {target: {value: '4x3'}})
    fireEvent.keyDown(input, {key: 'Enter'})
    expect(sit(spy).walls).toHaveLength(4)
    expect(sit(spy).walls[0]).toMatchObject({x1: 100, y1: 100, x2: 20, y2: 100})
    expect(sit(spy).walls[1]).toMatchObject({x2: 20, y2: 40})
    expect(container.querySelector('.dimbox')).toBeNull()
    clk(container, 100, 100)
    fireEvent.change(screen.getByPlaceholderText('bv. 4x3,5 (m)'), {target: {value: '2'}})
    fireEvent.keyDown(screen.getByPlaceholderText('bv. 4x3,5 (m)'), {key: 'Enter'})
    expect(sit(spy).walls[4]).toMatchObject({x1: 100, y1: 100, x2: 140, y2: 100})
    expect(sit(spy).walls[5]).toMatchObject({x2: 140, y2: 140})
    tool('Muur')
    expect(container.querySelector('.dimbox')).toBeNull()
})

// ---- collapsible "nergens geplaatst" panel ----
test('the "nergens geplaatst" list sits right of the drawing and can be collapsed so the drawing grows', () => {
    const {container} = mount(SituationSchema, P(), {idx: 0}),
        panel = () => container.querySelector('.rightpanel'),
        wrap = () => container.querySelector('.zoomscroll').parentElement
    expect(container.querySelector('.main').nextElementSibling).toBe(panel())
    expect(container.querySelector('.side').textContent).not.toContain('Nergens geplaatst')
    expect(panel().textContent).toContain('Nergens geplaatst (1)')
    expect(wrap().style.maxWidth).toBe('1100px')
    const toggle = () => screen.getByRole('button', {name: /Nergens geplaatst (inklappen|openen)/})
    expect(toggle()).toHaveAccessibleName('Nergens geplaatst inklappen')
    expect(toggle().textContent).toBe('>')
    fireEvent.click(toggle())
    expect(panel()).toHaveClass('closed')
    expect(panel().textContent).not.toContain('Keuken')
    expect(toggle()).toHaveAccessibleName('Nergens geplaatst openen')
    expect(toggle().textContent).toBe('<1')
    expect(wrap().style.maxWidth).toBe('1480px')
    fireEvent.click(toggle())
    expect(panel()).not.toHaveClass('closed')
    expect(panel().textContent).toContain('Keuken stopcontact')
    expect(wrap().style.maxWidth).toBe('1100px')
})
test('the panel shows the all-placed message and has no badge when nothing is missing', () => {
    const init = P()
    init.sit[0].items = [{id: 'i', kind: 'sym', node: 'n1', x: 10, y: 10, r: 0, s: 7}]
    const {container} = mount(SituationSchema, init, {idx: 0})
    expect(container.querySelector('.rightpanel').textContent).toContain('✓ Alle componenten geplaatst')
    fireEvent.click(screen.getByRole('button', {name: 'Nergens geplaatst inklappen'}))
    expect(container.querySelector('.badge')).toBeNull()
})
test('"Plaats ontbrekende" works from the right panel', () => {
    const {spy} = mount(SituationSchema, P(), {idx: 0})
    fireEvent.click(screen.getByText('Plaats ontbrekende op dit blad'))
    expect(sit(spy).items[0]).toMatchObject({kind: 'sym', node: 'n1'})
})

// ---- search, markings and clickable "nergens geplaatst" ----
// circuit A with 7 points; point 7 is a switch with a lamp hanging under it
const circ = () => {
    const pts = [1, 2, 3, 4, 5, 6].map((i) => node('p' + i, 'stopcontact', [], {label: 'Stop ' + i}))
    pts.push(node('p7', 'schakelaar', [node('l7', 'lichtpunt', [], {label: 'Lamp'})], {label: 'Schakelaar'}))
    return {...base(), een: [{id: 'e1', name: 'B', tree: [node('k', 'kring', pts, {label: 'A'})]}]}
}
const rightPanel = (c) => c.querySelector('.rightpanel')
const unplacedIds = (c) => [...c.querySelectorAll('.warn .unprow button[id^="hide-"]')].map((b) => b.id.slice(5))
test('markings: a point and everything under it share circuit letter + point number', () => {
    expect(marksOf(circ()).get('p7')).toBe('A7')
    expect(marksOf(circ()).get('l7')).toBe('A7')
    expect(marksOf(circ()).get('p1')).toBe('A1')
    expect(marksOf(circ()).has('k')).toBe(false)
    const q = circ()
    q.een[0].tree[0].children[0].p = {nr: '12'}
    expect(marksOf(q).get('p1')).toBe('A12')
})
test('unplaced list: buttons with the marking right-aligned, clicking places the symbol and removes it from the list', () => {
    const {container, spy} = mount(SituationSchema, circ(), {idx: 0})
    const btn = () => rightPanel(container).querySelector('#unplaced-p7')
    expect(btn().tagName).toBe('BUTTON')
    expect(btn().querySelector('.nm').textContent).toBe('Schakelaar')
    expect(btn().querySelector('.mark').textContent).toBe('A7')
    expect(btn().lastElementChild).toHaveClass('mark')
    expect(rightPanel(container).querySelector('#unplaced-l7 .mark').textContent).toBe('A7')
    expect(rightPanel(container).textContent).toContain('Nergens geplaatst (8)')
    fireEvent.click(btn())
    expect(sit(spy).items).toHaveLength(1)
    expect(sit(spy).items[0]).toMatchObject({kind: 'sym', node: 'p7', r: 0})
    expect(rightPanel(container).querySelector('#unplaced-p7')).toBeNull()
    expect(rightPanel(container).textContent).toContain('Nergens geplaatst (7)')
    // the placed symbol is drawn with its marking
    expect([...sv(container).querySelectorAll('text')].some((x) => x.textContent === 'A7')).toBe(true)
})
test('unplaced list: successive clicks do not stack symbols on one spot', () => {
    const {container, spy} = mount(SituationSchema, circ(), {idx: 0})
    fireEvent.click(container.querySelector('#unplaced-p1'))
    fireEvent.click(container.querySelector('#unplaced-p2'))
    const [a, b] = sit(spy).items
    expect(a.x !== b.x || a.y !== b.y).toBe(true)
})
test('deleting a placed symbol puts it back in the unplaced list', () => {
    const init = circ()
    init.sit[0].items = [{id: 'i1', kind: 'sym', node: 'p7', x: 100, y: 100, r: 0, s: 7}]
    const {container, spy} = mount(SituationSchema, init, {idx: 0})
    expect(rightPanel(container).querySelector('#unplaced-p7')).toBeNull()
    fireEvent.pointerDown(container.querySelector('svg.sheet g[style*="move"]'), {clientX: 100, clientY: 100})
    fireEvent.keyDown(document.body, {key: 'Delete'})
    expect(sit(spy).items).toHaveLength(0)
    expect(rightPanel(container).querySelector('#unplaced-p7 .mark').textContent).toBe('A7')
})
test('left list: general library components, filtered by name or category', () => {
    const {container} = mount(SituationSchema, circ(), {idx: 0})
    const f = container.querySelector('#comp-filter'),
        ids = () => [...container.querySelectorAll('.pallist button')].map((b) => b.id)
    expect(ids()).toContain('comp-stopcontact')
    expect(ids()).not.toContain('comp-p7') // no eendraadschema components here
    expect(ids()).not.toContain('comp-aansluiting') // types that cannot be placed are left out
    expect(container.querySelector('.pallist .mark')).toBeNull() // general components carry no marking
    fireEvent.change(f, {target: {value: 'kinder'}})
    expect(ids()).toEqual(expect.arrayContaining(['comp-stopcontact_kid', 'comp-stopcontact_pekid']))
    expect(ids()).not.toContain('comp-stopcontact')
    fireEvent.change(f, {target: {value: 'zzz'}})
    expect(ids()).toEqual([])
    screen.getByText('Geen componenten gevonden')
    fireEvent.change(f, {target: {value: ''}})
    expect(ids()).toContain('comp-stopcontact')
})
test('a placed symbol shows only the symbol; the marking appears only for eendraadschema components', () => {
    const {container} = mount(SituationSchema, circ(), {idx: 0})
    const texts = () => [...sv(container).querySelectorAll('text')].map((t) => t.textContent)
    const before = texts().length
    fireEvent.click(container.querySelector('#comp-stopcontact'))
    clk(container, 50, 50)
    expect(texts()).toHaveLength(before) // no type name, no marking
    fireEvent.click(container.querySelector('#unplaced-p7'))
    expect(texts()).toHaveLength(before + 1) // marking only, not the name 'Schakelaar'
    expect(texts()).toContain('A7')
    expect(texts()).not.toContain('Schakelaar')
})
test('the text next to a symbol can be edited, cleared and reset to the marking', () => {
    const {container, spy} = mount(SituationSchema, circ(), {idx: 0})
    const texts = () => [...sv(container).querySelectorAll('text')].map((t) => t.textContent)
    fireEvent.click(container.querySelector('#unplaced-p7')) // placed and selected
    const input = () => container.querySelector('#sym-text')
    expect(input().value).toBe('A7')
    fireEvent.change(input(), {target: {value: 'A7b'}})
    expect(sit(spy).items[0].mark).toBe('A7b')
    expect(texts()).toContain('A7b')
    expect(texts()).not.toContain('A7')
    fireEvent.change(input(), {target: {value: ''}})
    expect(texts()).not.toContain('A7b')
    fireEvent.change(input(), {target: {value: 'X'}})
    fireEvent.click(container.querySelector('#sym-text-reset'))
    expect(sit(spy).items[0].mark).toBeUndefined()
    expect(texts()).toContain('A7')
    // a general component can get a text too, but has no reset button
    fireEvent.click(container.querySelector('#comp-stopcontact'))
    clk(container, 50, 50)
    tool('Selecteer')
    fireEvent.pointerDown(sv(container).querySelectorAll('g[style*="move"]')[1], {clientX: 50, clientY: 50})
    expect(input().value).toBe('')
    expect(container.querySelector('#sym-text-reset')).toBeNull()
    fireEvent.change(input(), {target: {value: 'WCD'}})
    expect(texts()).toContain('WCD')
})
test('components can be hidden from the unplaced list and restored; the choice is stored in the project', () => {
    const {container, spy} = mount(SituationSchema, circ(), {idx: 0})
    expect(container.querySelector('#unplaced-p7')).not.toBeNull()
    expect(container.querySelector('#toggle-hidden')).toBeNull()
    fireEvent.click(container.querySelector('#hide-p7'))
    expect(spy.p.hidden).toEqual(['p7'])
    expect(container.querySelector('#unplaced-p7')).toBeNull()
    expect(rightPanel(container).textContent).toContain('Nergens geplaatst (7)')
    fireEvent.click(container.querySelector('#toggle-hidden'))
    expect(container.querySelector('#hidden-p7')).not.toBeNull()
    fireEvent.click(container.querySelector('#unhide-p7'))
    expect(spy.p.hidden).toEqual([])
    expect(container.querySelector('#unplaced-p7')).not.toBeNull()
    expect(container.querySelector('#toggle-hidden')).toBeNull()
})
test('hiding several components keeps them all; hiding everything shows the "all placed" message and the restore list', () => {
    const {container, spy} = mount(SituationSchema, circ(), {idx: 0})
    fireEvent.click(container.querySelector('#hide-p1'))
    fireEvent.click(container.querySelector('#hide-p2'))
    expect([...spy.p.hidden].sort()).toEqual(['p1', 'p2'])
    unplacedIds(container).forEach((id) => fireEvent.click(container.querySelector('#hide-' + id)))
    expect(spy.p.hidden).toHaveLength(8)
    screen.getByText('✓ Alle componenten geplaatst')
    expect(container.querySelector('#toggle-hidden').textContent).toContain('(8)')
    expect(container.querySelector('#toggle-hidden')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(container.querySelector('#toggle-hidden'))
    expect(container.querySelector('#toggle-hidden')).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelectorAll('.hiddenlist .unprow')).toHaveLength(8)
})
test('"Plaats ontbrekende" skips hidden components', () => {
    const p = circ()
    p.hidden = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']
    const {spy} = mount(SituationSchema, p, {idx: 0})
    fireEvent.click(screen.getByText('Plaats ontbrekende op dit blad'))
    expect(sit(spy).items.map((i) => i.node)).toEqual(['l7'])
})
test('a hidden component placed on the sheet anyway stays on the sheet', () => {
    const p = circ()
    p.hidden = ['p7']
    p.sit[0].items = [{id: 'i1', kind: 'sym', node: 'p7', x: 100, y: 100, r: 0, s: 7}]
    const {container} = mount(SituationSchema, p, {idx: 0})
    expect([...sv(container).querySelectorAll('text')].some((x) => x.textContent === 'A7')).toBe(true)
})

// ---- waterproof (h) is a property of a socket, shared with the eendraadschema ----
const hs = (c) => [...sv(c).querySelectorAll('text')].filter((t) => t.textContent === 'h').length
test('waterproof: a placed socket follows the component of the eendraadschema, and the checkbox changes that component (both ways)', () => {
    const {container, spy} = mount(SituationSchema, circ(), {idx: 0})
    fireEvent.click(container.querySelector('#unplaced-p1')) // placed and selected
    expect(hs(container)).toBe(0)
    const cb = () => container.querySelector('#sym-waterproof')
    expect(cb().checked).toBe(false)
    fireEvent.click(cb())
    // the property lives on the component of the eendraadschema, not on the loose symbol
    expect(spy.p.een[0].tree[0].children[0].p.h).toBe(true)
    expect(sit(spy).items[0].h).toBeUndefined()
    expect(hs(container)).toBe(1)
    expect(cb().checked).toBe(true)
    fireEvent.click(cb())
    expect(spy.p.een[0].tree[0].children[0].p.h).toBe(false)
    expect(hs(container)).toBe(0)
})
test('waterproof: set on the eendraadschema it shows on the situatieschema (symbol and component list), no checkbox for other symbols', () => {
    const P2 = circ()
    P2.een[0].tree[0].children[0].p = {h: true}
    P2.sit[0].items = [{id: 'i1', kind: 'sym', node: 'p1', x: 50, y: 50, r: 0, s: 7}, {id: 'i2', kind: 'sym', node: 'p2', x: 80, y: 50, r: 0, s: 7}]
    const {container} = mount(SituationSchema, P2, {idx: 0})
    expect(hs(container)).toBe(1) // only p1
    const hit = () => [...sv(container).querySelectorAll('circle[fill="transparent"]')]
    fireEvent.pointerDown(hit()[0], {clientX: 50, clientY: 50})
    expect(container.querySelector('#sym-waterproof').checked).toBe(true)
    fireEvent.pointerDown(hit()[1], {clientX: 80, clientY: 50})
    expect(container.querySelector('#sym-waterproof').checked).toBe(false)
})
test('waterproof: a general socket from the library has its own h; other symbols have no checkbox', () => {
    const {container, spy} = mount(SituationSchema, circ(), {idx: 0})
    fireEvent.click(container.querySelector('#comp-stopcontact'))
    clk(container, 50, 50)
    expect(sit(spy).items).toHaveLength(1)
    expect(hs(container)).toBe(0)
    fireEvent.contextMenu(sv(container)) // back to selecting
    fireEvent.pointerDown(sv(container).querySelector('circle[fill="transparent"]'), {clientX: 50, clientY: 50})
    fireEvent.click(container.querySelector('#sym-waterproof'))
    expect(sit(spy).items[0].h).toBe(true)
    expect(spy.p.een[0].tree[0].children[0].p?.h).toBeUndefined() // not linked to any component
    expect(hs(container)).toBe(1)
    fireEvent.click(container.querySelector('#unplaced-p7')) // a switch
    expect(container.querySelector('#sym-waterproof')).toBeNull()
})

test('a socket with p.aantal 2 is drawn as a double socket on the situatieschema, like on the eendraadschema', () => {
    const arcs = (p, items) => {
        const {container} = render(<SitSheet p={p} pg={{id: 's', name: 'X', walls: [], items}} no={2} total={3} />)
        return container.querySelectorAll('path').length
    }
    const mk = (extra) => ({...base(), een: [{id: 'e1', name: 'B', tree: [node('n1', 'stopcontact', [], extra)]}]})
    const item = [{id: '1', kind: 'sym', node: 'n1', x: 50, y: 50, r: 0, s: 7}]
    const single = arcs(mk({p: {aantal: 1}}), item),
        double = arcs(mk({p: {aantal: 2}}), item)
    expect(double).toBeGreaterThan(single)
})

test('symbols on the drawing are drawn with a thinner line than the default', () => {
    const p = {...base(), een: [{id: 'e1', name: 'B', tree: [node('n1', 'stopcontact', [])]}]}
    const items = [{id: '1', kind: 'sym', node: 'n1', x: 50, y: 50, r: 0, s: 7}]
    const {container} = render(<SitSheet p={p} pg={{id: 's', name: 'X', walls: [], items}} no={2} total={3} />)
    const g = container.querySelector('g[stroke-linecap="round"]')
    expect(Number(g.getAttribute('stroke-width'))).toBeLessThan(1.5)
})

test('the h of a waterproof socket stays upright when the symbol is rotated', () => {
    const p = {...base(), een: [{id: 'e1', name: 'B', tree: [node('n1', 'stopcontact', [], {p: {h: true}})]}]}
    const h = (r) => {
        const items = [{id: '1', kind: 'sym', node: 'n1', x: 50, y: 50, r, s: 7}]
        const {container} = render(<SitSheet p={p} pg={{id: 's', name: 'X', walls: [], items}} no={2} total={3} />)
        return [...container.querySelectorAll('text')].find((t) => t.textContent === 'h')
    }
    expect(h(0).getAttribute('transform')).toBeNull()
    expect(h(90).getAttribute('transform')).toMatch(/^rotate\(-90 /)
    expect(h(-30).getAttribute('transform')).toMatch(/^rotate\(30 /)
})

test('selected-item panel: close button on top, text first, size slider next, buttons last', () => {
    const init = P()
    init.sit[0].items = [{id: 'i1', kind: 'sym', node: 'n1', x: 100, y: 100, r: 0, s: 7}]
    const {container} = mount(SituationSchema, init, {idx: 0})
    fireEvent.pointerMove(sv(container), {clientX: 5, clientY: 5})
    fireEvent.pointerDown(container.querySelector('svg.sheet g[style*="move"]'), {clientX: 100, clientY: 100})
    const panel = container.querySelector('#sit-props'),
        before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(panel.firstElementChild.contains(container.querySelector('#sit-close'))).toBe(true)
    const text = panel.querySelector('#sym-text'), slider = panel.querySelector('input[type=range]'), buttons = panel.querySelector('.tb')
    expect(before(text, slider)).toBe(true)
    expect(before(slider, buttons)).toBe(true)
    expect(buttons.lastElementChild.textContent).toBe('⧉')
    fireEvent.click(container.querySelector('#sit-close'))
    expect(container.querySelector('#sit-props')).toBeNull()
    expect(screen.queryByText(/Geselecteerd/)).toBeNull()
})
