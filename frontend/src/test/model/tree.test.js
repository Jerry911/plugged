// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {findNode, indentNode, moveNode, outdentNode, replaceNode, rotateNode} from '../../model/tree.js'
import {node} from '../utils.jsx'

const sampleTree = () => [node('A', 'bord', [node('B', 'kring'), node('C', 'kring')]), node('D', 'bord')]
const ids = (ns) => ns.map((n) => [n.id, ids(n.children)])
test('findNode', () => {
    expect(findNode(sampleTree(), 'C').id).toBe('C')
    expect(findNode(sampleTree(), 'zz')).toBeUndefined()
})
test('rotateNode turns a nested element and keeps the angle between 0 and 359', () => {
    expect(findNode(rotateNode(sampleTree(), 'C', 15), 'C').r).toBe(15)
    expect(findNode(rotateNode(sampleTree(), 'C', -15), 'C').r).toBe(345)
    const turned = rotateNode(sampleTree(), 'C', 350)
    expect(findNode(rotateNode(turned, 'C', 30), 'C').r).toBe(20)
    expect(findNode(turned, 'B').r).toBeUndefined()
})
test('replaceNode replaces, removes and recurses', () => {
    expect(replaceNode(sampleTree(), 'D', (n) => [{...n, label: 'x'}])[1].label).toBe('x')
    expect(ids(replaceNode(sampleTree(), 'B', () => []))[0][1]).toEqual([['C', []]])
    expect(ids(replaceNode(sampleTree(), 'zz', () => []))).toEqual(ids(sampleTree()))
})
test('moveNode top-level, nested and out of bounds', () => {
    expect(moveNode(sampleTree(), 'A', 1).map((n) => n.id)).toEqual(['D', 'A'])
    expect(moveNode(sampleTree(), 'C', -1)[0].children.map((n) => n.id)).toEqual(['C', 'B'])
    expect(moveNode(sampleTree(), 'A', -1).map((n) => n.id)).toEqual(['A', 'D'])
    expect(moveNode(sampleTree(), 'D', 1).map((n) => n.id)).toEqual(['A', 'D'])
})
test('indentNode moves under previous sibling', () => {
    expect(ids(indentNode(sampleTree(), 'D'))[0][1].map((x) => x[0])).toEqual(['B', 'C', 'D'])
    expect(ids(indentNode(sampleTree(), 'A'))).toEqual(ids(sampleTree()))
    expect(ids(indentNode(sampleTree(), 'C'))[0][1][0]).toEqual(['B', [['C', []]]])
})
test('outdentNode lifts after parent', () => {
    expect(outdentNode(sampleTree(), 'B').map((n) => n.id)).toEqual(['A', 'B', 'D'])
    expect(outdentNode(sampleTree(), 'A').map((n) => n.id)).toEqual(['A', 'D'])
})
