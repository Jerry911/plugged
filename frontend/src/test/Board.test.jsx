// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render} from '@testing-library/react'
import {BoardSheet} from '../Board.jsx'
import {board, slices, BUSX0} from '../boardModel.jsx'
import {base, node} from './utils.jsx'

const kring = (id, kids = [], p = {}, extra = {}) =>
    node(id, 'kring', kids, {p: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', kortsl: 3, tekst: '', ...p}, ...extra})
const tree = (krings, q = {}) => [
    node('A', 'aansluiting', [node('B', 'bord', krings, {p: {geaard: true}})], {
        p: {teller: true, bescherming: 'differentieel', delta: 300, polen: 4, amp: 40, diffType: 'A', kabel: '4x16', ...q},
    }),
]
const sheets = (t, props = {}) => {
    const p = {...base(), een: [{id: 'e1', name: 'Blad 1', tree: t}]},
        b = board(p, p.een[0]),
        sl = slices(b)
    return sl.map((s, i) => render(<BoardSheet p={p} pg={p.een[0]} b={b} sl={s} no={i + 1} total={sl.length} {...props} />))
}
test('draws bus, head (kWh, differential, earth) and circuit texts', () => {
    const [{container, getByText}] = sheets(tree([kring('K1', [node('s', 'stopcontact')], {tekst: 'Keuken'})]))
    ;['K1', 'Keuken', '2P - 16A', 'Curve B', '3000', 'XVB Cca 3G2,5', 'kWh', 'Δ300mA', '4P - 40A', 'Type A', '4x16'].forEach((t) =>
        getByText(t),
    )
    expect(container.querySelector('line[stroke-width="5"]')).toBeTruthy()
    expect(container.textContent).not.toMatch(/vervolg/)
})
test('head variants: automatic main breaker, no meter, no earth', () => {
    const a = sheets(tree([kring('K')], {bescherming: 'automatisch', teller: false}))
    expect(a[0].container.textContent).not.toMatch(/Δ|kWh/)
    a[0].getByText('4P - 40A')
    const p = {...base(), een: [{id: 'e', name: 'x', tree: [node('B', 'bord', [kring('K')])]}]},
        b = board(p, p.een[0]),
        r = render(<BoardSheet p={p} pg={p.een[0]} b={b} sl={slices(b)[0]} no={1} total={1} />)
    expect(r.container.textContent).not.toMatch(/kWh|4P/)
})
test('continuation markers on multi-sheet boards', () => {
    const r = sheets(tree(Array.from({length: 40}, (_, i) => kring('K' + i, [node('s' + i, 'stopcontact')]))))
    expect(r.length).toBeGreaterThan(2)
    r[0].getByText('vervolg op blad 2 →')
    r[1].getByText('← vervolg van blad 1')
    r[1].getByText('vervolg op blad 3 →')
    r.at(-1).getByText(`← vervolg van blad ${r.length - 1}`)
    r.forEach(({container}) => expect(container.textContent).toMatch(/kWh/))
})
test('the head is repeated on every sheet and the bus runs page wide where the board continues', () => {
    const r = sheets(tree(Array.from({length: 40}, (_, i) => kring('K' + i, [node('s' + i, 'stopcontact')]))))
    expect(r.length).toBeGreaterThan(2)
    r.forEach(({container}, i) => {
        ;['kWh', 'Δ300mA', '4P - 40A'].forEach((t) => expect(container.textContent).toContain(t))
        const g = container.querySelector('g[transform*="scale"]'),
            [, sc, x0] = /scale\(([\d.]+)\) translate\((-?[\d.]+)/.exec(g.getAttribute('transform')),
            bus = container.querySelector('line[stroke-width="5"]'),
            x1 = Number(bus.getAttribute('x1')),
            x2 = Number(bus.getAttribute('x2'))
        // not the last sheet: the bus ends at the right page margin (277 mm after the left margin)
        if (i < r.length - 1) expect((x2 + Number(x0)) * Number(sc)).toBeCloseTo(277, 1)
        // not the first sheet: the bus starts at the left page margin
        if (i) expect(x1).toBe(-Number(x0))
        else expect(x1).toBe(BUSX0)
    })
})
test('continuation markers are in page coordinates, so they never overlap on a narrow sheet', () => {
    const r = sheets(tree(Array.from({length: 40}, (_, i) => kring('K' + i, [node('s' + i, 'stopcontact')]))))
    // all sheets are rendered into the same document body, so query inside each sheet's own container
    const markers = (container) => [...container.querySelectorAll('svg.sheet > text')]
    r.slice(1, -1).forEach(({container}) => {
        const a = markers(container).find((t) => /← vervolg van blad/.test(t.textContent)),
            c = markers(container).find((t) => /vervolg op blad .* →/.test(t.textContent))
        expect(a).toBeTruthy()
        expect(c).toBeTruthy()
        expect(c.getAttribute('text-anchor')).toBe('end')
        // the left marker starts well before the right one, and both are plain page-level texts (not scaled with the drawing)
        expect(Number(a.getAttribute('x')) + 40).toBeLessThan(Number(c.getAttribute('x')) - 40)
        expect(a.closest('g[transform*="scale"]')).toBeNull()
        expect(c.closest('g[transform*="scale"]')).toBeNull()
    })
    expect(markers(r[0].container).some((t) => /← vervolg van/.test(t.textContent))).toBe(false)
    expect(markers(r.at(-1).container).some((t) => /vervolg op blad/.test(t.textContent))).toBe(false)
})
test('selection: clickable items, highlight and callbacks', () => {
    const onSel = vi.fn(),
        [{container}] = sheets(tree([kring('K1', [node('s', 'stopcontact'), node('d', 'domotica', [], {p: {tekst: 'Box'}})])]), {
            onSel,
            sel: 's',
        })
    expect(container.querySelector('[stroke="#0a6cff"]')).toBeTruthy()
    fireEvent.click(container.querySelector('g[data-nid="s"]'))
    expect(onSel).toHaveBeenLastCalledWith('s')
    fireEvent.click([...container.querySelectorAll('text')].find((t) => t.textContent === 'K1'))
    expect(onSel).toHaveBeenLastCalledWith('K1')
    fireEvent.click(container.querySelector('rect[stroke-width="3"][fill="#fff"]'))
    expect(onSel).toHaveBeenLastCalledWith('d')
})
test('the head is made of library symbols and selects the aansluiting (meter, main breaker) or the board (earth)', () => {
    const onSel = vi.fn(),
        [{container}] = sheets(tree([kring('K1')]), {onSel, sel: 'A'})
    const parts = [...container.querySelectorAll('g[data-nid="A"]')]
    // kWh meter (teller symbol) and main breaker (diff symbol), both with the text of the library symbol / the connection
    expect(parts).toHaveLength(2)
    expect(parts[0].textContent).toContain('kWh')
    parts.forEach((g) => {
        fireEvent.click(g)
        expect(onSel).toHaveBeenLastCalledWith('A')
    })
    fireEvent.click([...container.querySelectorAll('text')].find((t) => t.textContent === 'Δ300mA'))
    expect(onSel).toHaveBeenLastCalledWith('A')
    fireEvent.click(container.querySelector('g[data-nid="B"]'))
    expect(onSel).toHaveBeenLastCalledWith('B')
    // selected: drawn in blue, but no delete button for the whole connection
    expect(container.querySelector('[stroke="#0a6cff"]')).toBeTruthy()
    expect(container.querySelector('#eds-drawing-delete')).toBeNull()
})
test('static rendering has no handlers or highlight', () => {
    const [{container}] = sheets(tree([kring('K1', [node('s', 'stopcontact')])]))
    expect(container.querySelector('[style*="pointer"]')).toBeNull()
    expect(container.querySelector('[stroke="#0a6cff"]')).toBeNull()
})
