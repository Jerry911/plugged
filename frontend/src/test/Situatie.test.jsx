// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, screen} from '@testing-library/react'
import Situatie, {SitSheet, ZOOMS} from '../Situatie.jsx'
import {base, mount, node} from './utils.jsx'

const P = () => ({...base(), een: [{id: 'e1', name: 'B', tree: [node('n1', 'stopcontact', [], {label: 'Keuken stopcontact'})]}]})
const sv = (c) => c.querySelector('svg.sheet'),
    clk = (c, x, y) => fireEvent.click(sv(c), {clientX: x, clientY: y}),
    tool = (n) => fireEvent.click(screen.getByRole('button', {name: n}))
const sit = (spy) => spy.p.sit[0]
const wall = (id, x1, y1, x2, y2) => ({id, x1, y1, x2, y2})
test('walls: chain, stop on same point, ignore footer area, right click', () => {
    const {container, spy} = mount(Situatie, P(), {idx: 0})
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
    clk(container, 80, 80)
    expect(sit(spy).walls).toHaveLength(2)
})
test('room tool draws four walls, degenerate ignored', () => {
    const {container, spy} = mount(Situatie, P(), {idx: 0})
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
    const {container, spy} = mount(Situatie, init, {idx: 0})
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
    const {container, spy} = mount(Situatie, P(), {idx: 0})
    screen.getByText(/Nergens geplaatst \(1\)/)
    clk(container, 50, 50)
    tool('Symbool')
    clk(container, 50, 50)
    expect(sit(spy).items).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', {name: /Keuken stopcontact/}))
    clk(container, 50, 50)
    expect(sit(spy).items[0]).toMatchObject({kind: 'sym', node: 'n1', x: 50, y: 50})
    screen.getByText('✓ Alle componenten geplaatst')
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Lokaal').mockReturnValueOnce(null)
    tool('Tekst')
    clk(container, 20, 20)
    clk(container, 30, 30)
    expect(sit(spy).items.filter((i) => i.kind === 'text')).toHaveLength(1)
})
test('auto place missing components', () => {
    const {spy} = mount(Situatie, P(), {idx: 0})
    fireEvent.click(screen.getByText('Plaats ontbrekende op dit blad'))
    expect(sit(spy).items[0]).toMatchObject({kind: 'sym', node: 'n1'})
})
test('select, drag, inspect, keyboard and erase items', () => {
    const init = P()
    init.sit[0].items = [{id: 'i1', kind: 'sym', node: 'n1', x: 100, y: 100, r: 0, s: 7}]
    const {container, spy} = mount(Situatie, init, {idx: 0})
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
    fireEvent.click(screen.getByRole('button', {name: /Verwijder/}))
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
    const {container, spy} = mount(Situatie, init, {idx: 0})
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
    const {container, spy} = mount(Situatie, init, {idx: 0})
    const hit = (i) => container.querySelectorAll('line[stroke="transparent"]')[i]
    fireEvent.pointerDown(hit(0), {clientX: 20, clientY: 20})
    screen.getByText(/Muur · 40 mm/)
    fireEvent.pointerMove(sv(container), {clientX: 20, clientY: 30})
    expect(sit(spy).walls[0]).toMatchObject({y1: 30, y2: 30})
    const hs = container.querySelectorAll('circle[r="1.8"]')
    fireEvent.pointerDown(hs[0], {clientX: 10, clientY: 30})
    fireEvent.pointerMove(sv(container), {clientX: 15, clientY: 35})
    expect(sit(spy).walls[0]).toMatchObject({x1: 15, y1: 35, x2: 50})
    fireEvent.pointerUp(sv(container))
    fireEvent.pointerDown(container.querySelectorAll('circle[r="1.8"]')[1], {clientX: 50, clientY: 30})
    fireEvent.pointerMove(sv(container), {clientX: 55, clientY: 30})
    expect(sit(spy).walls[0].x2).toBe(55)
    fireEvent.click(screen.getByRole('button', {name: /Verwijder/}))
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
    const {container} = mount(Situatie, P(), {idx: 0}),
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
test('toolbar delete button is disabled until something is selected', () => {
    const init = P()
    init.sit[0].items = [{id: 'i1', kind: 'text', x: 20, y: 20, txt: 'Hal', s: 4, r: 0}]
    const {container, spy} = mount(Situatie, init, {idx: 0}),
        btn = () => screen.getByRole('button', {name: '🗑 Verwijder (Del)'})
    expect(btn()).toBeDisabled()
    fireEvent.pointerDown(container.querySelector('svg.sheet g[style*="move"]'), {clientX: 20, clientY: 20})
    expect(btn()).toBeEnabled()
    fireEvent.click(btn())
    expect(sit(spy).items).toHaveLength(0)
    expect(btn()).toBeDisabled()
})
test('footer cells call onFooter', () => {
    const fn = vi.fn(),
        {container} = mount(Situatie, P(), {idx: 0, onFooter: fn})
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
    mount(Situatie, p, {idx: 0})
    screen.getByText('Blad 3/3')
})

test('drawing snaps to grid points by default; free drawing is an opt-in checkbox', () => {
    const {container, spy} = mount(Situatie, P(), {idx: 0})
    const cb = screen.getByLabelText('Vrij tekenen')
    expect(cb).not.toBeChecked()
    tool('Muur')
    clk(container, 12, 17)
    clk(container, 48, 17)
    expect(sit(spy).walls[0]).toMatchObject({x1: 10, y1: 15, x2: 50, y2: 15})
    fireEvent.contextMenu(sv(container))
    fireEvent.click(cb)
    expect(cb).toBeChecked()
    clk(container, 12.34, 17.26)
    clk(container, 30.12, 40.06)
    expect(sit(spy).walls[1]).toMatchObject({x1: 12.3, y1: 17.3, x2: 30.1, y2: 40.1})
    fireEvent.click(cb)
    fireEvent.contextMenu(sv(container))
    fireEvent.change(container.querySelector('.gridsel select'), {target: {value: '2.5'}})
    clk(container, 13.9, 21)
    clk(container, 26, 21)
    expect(sit(spy).walls[2]).toMatchObject({x1: 15, y1: 20, x2: 25, y2: 20})
})
test('a cursor marker shows the snapped grid point; walls and rooms get a preview', () => {
    const {container} = mount(Situatie, P(), {idx: 0}),
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
    const {container, spy} = mount(Situatie, init, {idx: 0}),
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
    const {container} = mount(Situatie, P(), {idx: 0}),
        pct = () => container.querySelector('.zoomctl button:nth-child(2)'),
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
    const {container, spy} = mount(Situatie, P(), {idx: 0})
    fireEvent.click(screen.getByTitle('Inzoomen'))
    tool('Muur')
    clk(container, 12, 17)
    clk(container, 48, 17)
    expect(sit(spy).walls).toHaveLength(1)
})
