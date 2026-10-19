// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render} from '@testing-library/react'
import {BoardSheet} from '../Board.jsx'
import {board, slices} from '../boardModel.js'
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
    expect(r[1].container.textContent).not.toMatch(/kWh/)
})
test('selection: clickable items, highlight and callbacks', () => {
    const onSel = vi.fn(),
        [{container}] = sheets(tree([kring('K1', [node('s', 'stopcontact'), node('d', 'domotica', [], {p: {tekst: 'Box'}})])]), {
            onSel,
            sel: 's',
        })
    expect(container.querySelector('[stroke="#0a6cff"]')).toBeTruthy()
    fireEvent.click(container.querySelector('g[style*="pointer"]'))
    expect(onSel).toHaveBeenLastCalledWith('s')
    fireEvent.click([...container.querySelectorAll('text')].find((t) => t.textContent === 'K1'))
    expect(onSel).toHaveBeenLastCalledWith('K1')
    fireEvent.click(container.querySelector('rect[stroke-width="3"][fill="#fff"]'))
    expect(onSel).toHaveBeenLastCalledWith('d')
})
test('static rendering has no handlers or highlight', () => {
    const [{container}] = sheets(tree([kring('K1', [node('s', 'stopcontact')])]))
    expect(container.querySelector('[style*="pointer"]')).toBeNull()
    expect(container.querySelector('[stroke="#0a6cff"]')).toBeNull()
})
