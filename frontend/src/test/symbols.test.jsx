// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {render} from '@testing-library/react'
import {allTypes, BUILTIN, Sym, typeOf} from '../symbols.jsx'

test('keys unique and parents refer to existing types', () => {
    const ks = BUILTIN.map(t => t.k);
    expect(new Set(ks).size).toBe(ks.length)
    BUILTIN.forEach(t => t.parents.forEach(k => expect(ks).toContain(k)))
})
test('root element has no parents', () => expect(BUILTIN.filter(t => !t.parents.length).map(t => t.k)).toEqual(['aansluiting']))
test('allTypes adds custom types and handles missing custom', () => {
    expect(allTypes({})).toHaveLength(BUILTIN.length)
    const p = {custom: [{id: '1', name: 'Mijn', shapes: []}]};
    const t = allTypes(p).at(-1);
    expect(t).toMatchObject({k: 'custom:1', cat: 'Eigen', place: true, parents: ['kring']})
})
test('typeOf falls back to first builtin', () => {
    expect(typeOf({custom: []}, 'nope').k).toBe('aansluiting');
    expect(typeOf({custom: []}, 'oven').name).toBe('Oven')
})
test('Sym renders every shape kind', () => {
    const {container} = render(<svg><Sym
        shapes={[{t: 'line', x1: 0, y1: 0, x2: 1, y2: 1}, {t: 'circle', cx: 1, cy: 1, r: 1}, {
            t: 'rect',
            x: 0,
            y: 0,
            w: 2,
            h: 2
        }, {t: 'text', x: 1, y: 1, s: 'M'}]}/></svg>)
    expect(container.querySelector('line')).toBeTruthy();
    expect(container.querySelector('circle')).toBeTruthy();
    expect(container.querySelector('rect')).toBeTruthy();
    expect(container.querySelector('text').textContent).toBe('M')
})
test('every builtin symbol renders', () => BUILTIN.forEach(t => {
    const {container, unmount} = render(<svg><Sym shapes={t.shapes}/></svg>);
    expect(container.querySelector('g').children.length).toBe(t.shapes.length);
    unmount()
}))
