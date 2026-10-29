// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {addAfter, addBefore, addSibling, addSiblingBefore, circuitOf, canSibling, siblingTypes, canInsert, emptyChoices, insertAt, insertTypes, okUnder, parentOf} from '../insertion.js'

const T = [
    {k: 'bord', parents: []},
    {k: 'diff', parents: ['bord']},
    {k: 'kring', parents: ['bord', 'diff', 'kring']},
    {k: 'schakelaar', parents: ['kring', 'schakelaar', 'lichtpunt']},
    {k: 'lichtpunt', parents: ['kring', 'schakelaar', 'lichtpunt']},
    {k: 'oven', parents: ['kring']},
]
const typeOf = (k) => T.find((t) => t.k === k)
const n = (id, type, children = []) => ({id, type, label: id, info: '', children})
const tree = () => [n('B', 'bord', [n('A', 'kring', [n('S', 'schakelaar', [n('L', 'lichtpunt')])])])]
const keys = (a) => a.map((t) => t.k)
const S = (t) => t[0].children[0].children[0]

test('okUnder follows the "can be placed after" list; a circuit never hangs under a circuit; free mode ignores the list', () => {
    expect(okUnder(typeOf('oven'), 'kring')).toBe(true)
    expect(okUnder(typeOf('oven'), 'schakelaar')).toBe(false)
    expect(okUnder(typeOf('oven'), 'schakelaar', true)).toBe(true)
    expect(okUnder(typeOf('kring'), 'kring')).toBe(false)
    expect(okUnder(typeOf('kring'), 'kring', true)).toBe(false)
})
test('addAfter makes the new element the last child; addBefore puts it between the parent and the element', () => {
    const t = tree(),
        x = n('X', 'leeg')
    expect(addAfter(t, 'S', x)[0].children[0].children[0].children.map((c) => c.id)).toEqual(['L', 'X'])
    const b = addBefore(t, 'S', x)[0].children[0].children
    expect(b.map((c) => c.id)).toEqual(['X'])
    expect(b[0].children.map((c) => c.id)).toEqual(['S'])
    expect(b[0].children[0].children.map((c) => c.id)).toEqual(['L']) // what hangs under S stays under S
    expect(insertAt(t, 'S', 'before', x)).toEqual(addBefore(t, 'S', x))
    expect(insertAt(t, 'S', 'after', x)).toEqual(addAfter(t, 'S', x))
})
test('parentOf: the parent, null at the top, undefined when unknown', () => {
    const t = tree()
    expect(parentOf(t, 'S').id).toBe('A')
    expect(parentOf(t, 'B')).toBeNull()
    expect(parentOf(t, 'nope')).toBeUndefined()
})
test('types that can be inserted after: only those that may hang under the element', () => {
    const t = tree()
    expect(keys(insertTypes(typeOf, t, T, S(t), 'after'))).toEqual(['schakelaar', 'lichtpunt'])
    expect(keys(insertTypes(typeOf, t, T, t[0].children[0], 'after'))).toEqual(['schakelaar', 'lichtpunt', 'oven']) // under the circuit
})
test('types that can be inserted before: must fit under the parent and the element must fit under them', () => {
    const t = tree()
    // under the circuit A and above the switch S (a switch may hang under a switch or a light)
    expect(keys(insertTypes(typeOf, t, T, S(t), 'before'))).toEqual(['schakelaar', 'lichtpunt'])
    // above the circuit: under the board, and a circuit may hang under a diff
    expect(keys(insertTypes(typeOf, t, T, t[0].children[0], 'before'))).toEqual(['diff'])
    // nothing can go above the board (a top level element) without free hierarchy
    expect(canInsert(typeOf, t, t[0], 'before', typeOf('diff'))).toBe(false)
})
test('choices of an empty element: fit under the parent and accept the children', () => {
    const t = insertAt(tree(), 'S', 'before', n('X', 'leeg')),
        x = t[0].children[0].children[0]
    expect(x.id).toBe('X')
    expect(keys(emptyChoices(typeOf, t, T, x))).toEqual(['schakelaar', 'lichtpunt'])
    const t2 = insertAt(tree(), 'S', 'after', n('Y', 'leeg')),
        y = S(t2).children[1]
    expect(keys(emptyChoices(typeOf, t2, T, y))).toEqual(['schakelaar', 'lichtpunt']) // under a switch: no oven
})
test('addSibling: the next branch comes directly after the element, under the same parent', () => {
    const t = [n('B', 'bord', [n('K', 'kring', [n('S1', 'schakelaar'), n('S2', 'schakelaar')])])],
        r = addSibling(t, 'S1', n('X', 'leeg'))
    expect(r[0].children[0].children.map((c) => c.id)).toEqual(['S1', 'X', 'S2'])
    expect(addSibling(t, 'S2', n('X', 'leeg'))[0].children[0].children.map((c) => c.id)).toEqual(['S1', 'S2', 'X'])
    expect(addSibling(t, 'B', n('X', 'leeg')).map((c) => c.id)).toEqual(['B', 'X'])
})
test('canSibling / siblingTypes: the type must fit under the parent of the element', () => {
    const t = tree()
    expect(keys(siblingTypes(t, T, S(t)))).toEqual(['schakelaar', 'lichtpunt', 'oven']) // next to the switch, under the circuit
    expect(keys(siblingTypes(t, T, t[0].children[0]))).toEqual(['diff', 'kring']) // next to the circuit, under the board
    expect(canSibling(t, t[0], typeOf('kring'))).toBe(false) // a top level element has no parent to hang under
    expect(canSibling(t, t[0], typeOf('kring'), true)).toBe(true)
    expect(canSibling(t, n('nope', 'x'), typeOf('oven'))).toBe(false)
})
test('addSiblingBefore / insertAt left+right: a new circuit next to a circuit, under the same parent; circuitOf finds the enclosing circuit', () => {
    const tree = [n('b', 'bord', [n('k1', 'kring', [n('s', 'schakelaar')]), n('k2', 'kring')])],
        x = n('x', 'kring')
    expect(addSiblingBefore(tree, 'k2', x)[0].children.map((c) => c.id)).toEqual(['k1', 'x', 'k2'])
    expect(insertAt(tree, 'k1', 'left', x)[0].children.map((c) => c.id)).toEqual(['x', 'k1', 'k2'])
    expect(insertAt(tree, 'k1', 'right', x)[0].children.map((c) => c.id)).toEqual(['k1', 'x', 'k2'])
    expect(insertAt(tree, null, 'root', x).map((c) => c.id)).toEqual(['b', 'x'])
    expect(circuitOf(tree, 's').id).toBe('k1')
    expect(circuitOf(tree, 'k2').id).toBe('k2')
    expect(circuitOf(tree, 'b')).toBeNull()
    expect(circuitOf(tree, 'nope')).toBeNull()
})
