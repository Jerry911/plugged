// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {allNodes, flat, hiddenOf, reid, uid, unplacedOf} from '../util.jsx'
import {base, node} from './utils.jsx'

const tree = [node('a', 'aansluiting', [node('b', 'bord', [node('s', 'stopcontact'), node('l', 'lichtpunt')])])]
test('uid is unique-ish string', () => {
    expect(uid()).not.toBe(uid())
    expect(typeof uid()).toBe('string')
})
test('flat flattens depth first', () => expect(flat(tree).map((n) => n.id)).toEqual(['a', 'b', 's', 'l']))
test('reid keeps structure with new ids', () => {
    const r = reid(tree)
    expect(flat(r)).toHaveLength(4)
    expect(r[0].id).not.toBe('a')
    expect(r[0].children[0].children[1].type).toBe('lichtpunt')
})
test('allNodes only returns placeable', () => {
    const p = {...base(), een: [{id: 'e', name: 'x', tree}]}
    expect(allNodes(p).map((n) => n.id)).toEqual(['b', 's', 'l'])
})
test('unplacedOf ignores placed nodes across pages', () => {
    const p = {
        ...base(),
        een: [{id: 'e', name: 'x', tree}],
        sit: [
            {
                id: 's',
                name: 'y',
                walls: [],
                items: [
                    {id: 'i', kind: 'sym', node: 's'},
                    {id: 'j', kind: 'door', node: 'l'},
                ],
            },
        ],
    }
    expect(unplacedOf(p).map((n) => n.id)).toEqual(['b', 'l'])
})
test('hidden nodes leave unplacedOf and show up in hiddenOf; unknown ids are ignored', () => {
    const p = {...base(), een: [{id: 'e', name: 'x', tree}], sit: [{id: 's', name: 'y', walls: [], items: []}], hidden: ['b', 'nope']}
    expect(unplacedOf(p).map((n) => n.id)).toEqual(['s', 'l'])
    expect(hiddenOf(p).map((n) => n.id)).toEqual(['b'])
    expect(hiddenOf({...p, hidden: undefined})).toEqual([])
    expect(unplacedOf({...p, hidden: undefined}).map((n) => n.id)).toEqual(['b', 's', 'l'])
})