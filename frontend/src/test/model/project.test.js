// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {hiddenNodes, migrateWaterproof, placeableNodes, setNodeProperties, unplacedNodes} from '../../model/project.js'
import {flatten, newId, withNewIds} from '../../model/tree.js'
import {baseProject, node} from '../utils.jsx'

const tree = [node('a', 'aansluiting', [node('b', 'bord', [node('s', 'stopcontact'), node('l', 'lichtpunt')])])]
test('newId is unique-ish string', () => {
    expect(newId()).not.toBe(newId())
    expect(typeof newId()).toBe('string')
})
test('flatten flattens depth first', () => expect(flatten(tree).map((n) => n.id)).toEqual(['a', 'b', 's', 'l']))
test('withNewIds keeps structure with new ids', () => {
    const r = withNewIds(tree)
    expect(flatten(r)).toHaveLength(4)
    expect(r[0].id).not.toBe('a')
    expect(r[0].children[0].children[1].type).toBe('lichtpunt')
})
test('placeableNodes only returns placeable', () => {
    const p = {...baseProject(), een: [{id: 'e', name: 'x', tree}]}
    expect(placeableNodes(p).map((n) => n.id)).toEqual(['b', 's', 'l'])
})
test('unplacedNodes ignores placed nodes across pages', () => {
    const p = {
        ...baseProject(),
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
    expect(unplacedNodes(p).map((n) => n.id)).toEqual(['b', 'l'])
})
test('hidden nodes leave unplacedNodes and show up in hiddenNodes; unknown ids are ignored', () => {
    const p = {...baseProject(), een: [{id: 'e', name: 'x', tree}], sit: [{id: 's', name: 'y', walls: [], items: []}], hidden: ['b', 'nope']}
    expect(unplacedNodes(p).map((n) => n.id)).toEqual(['s', 'l'])
    expect(hiddenNodes(p).map((n) => n.id)).toEqual(['b'])
    expect(hiddenNodes({...p, hidden: undefined})).toEqual([])
    expect(unplacedNodes({...p, hidden: undefined}).map((n) => n.id)).toEqual(['b', 's', 'l'])
})
test('projects with the old waterproof socket symbol are converted to a socket with h (eendraadschema and situatieschema)', () => {
    const old = {
        ...baseProject(),
        een: [{id: 'e1', name: 'B', tree: [node('a', 'aansluiting', [node('k', 'kring', [node('w', 'stopcontact_h', [], {p: {aantal: 2}}), node('s', 'stopcontact')])])]}],
        sit: [{id: 's1', name: 'P', walls: [], items: [{id: 'i1', kind: 'sym', type: 'stopcontact_h', x: 1, y: 1}, {id: 'i2', kind: 'sym', node: 'w', x: 2, y: 2}, {id: 'i3', kind: 'sym', type: 'tv', x: 3, y: 3}]}],
    }
    const r = migrateWaterproof(old),
        ns = flatten(r.een[0].tree)
    expect(ns.find((n) => n.id === 'w')).toMatchObject({type: 'stopcontact', p: {aantal: 2, h: true}})
    expect(ns.find((n) => n.id === 's')).toMatchObject({type: 'stopcontact'})
    expect(ns.find((n) => n.id === 's').p?.h).toBeUndefined()
    expect(r.sit[0].items[0]).toMatchObject({type: 'stopcontact', h: true})
    expect(r.sit[0].items[1]).toEqual(old.sit[0].items[1]) // linked to a component: follows that component
    expect(r.sit[0].items[2]).toEqual(old.sit[0].items[2])
    expect(JSON.stringify(r)).not.toContain('stopcontact_h')
    expect(migrateWaterproof({custom: []})).toEqual({custom: []}) // other shapes of the project stay as they are
})
test('setNodeProperties changes the properties of one component, wherever it hangs', () => {
    const p = {...baseProject(), een: [{id: 'e1', name: 'B', tree: [node('a', 'aansluiting', [node('k', 'kring', [node('s', 'stopcontact', [], {p: {aantal: 2}})])])]}]},
        r = setNodeProperties(p, 's', {h: true})
    expect(flatten(r.een[0].tree).find((n) => n.id === 's').p).toEqual({aantal: 2, h: true})
    expect(flatten(r.een[0].tree).find((n) => n.id === 'k').p).toBeUndefined()
})
