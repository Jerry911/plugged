// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {shapeAnchor, translatePath, translateShape} from '../../symbols/shapeEdit.js'

test('every kind of shape moves by the same distance and keeps its other properties', () => {
    expect(translateShape({t: 'line', x1: 1, y1: 12, x2: 11.5, y2: 12, sw: 1.5}, 2, -1)).toEqual({t: 'line', x1: 3, y1: 11, x2: 13.5, y2: 11, sw: 1.5})
    expect(translateShape({t: 'circle', cx: 12, cy: 12, r: 2, f: 2}, 1, 1)).toEqual({t: 'circle', cx: 13, cy: 13, r: 2, f: 2})
    expect(translateShape({t: 'arc', cx: 12, cy: 12, r: 2, a1: 90, a2: 270}, -1, 0)).toEqual({t: 'arc', cx: 11, cy: 12, r: 2, a1: 90, a2: 270})
    expect(translateShape({t: 'rect', x: 2, y: 8.5, w: 20, h: 7}, 1, 1)).toEqual({t: 'rect', x: 3, y: 9.5, w: 20, h: 7})
    expect(translateShape({t: 'text', x: 12, y: 6, s: 'h', fs: 4}, 0, 2)).toEqual({t: 'text', x: 12, y: 8, s: 'h', fs: 4})
})
test('path data moves, also curves and arcs (only their end points move, not radii or flags)', () => {
    expect(translatePath('M8.09 4.61 L9.41 4.13 Z', 1, 2)).toBe('M9.09 6.61L10.41 6.13Z')
    expect(translatePath('M0 0 C1 1 2 2 3 3', 1, 1)).toBe('M1 1C2 2 3 3 4 4')
    expect(translatePath('M0 0 A2 3 0 0 1 4 5', 10, 20)).toBe('M10 20A2 3 0 0 1 14 25')
})
test('the anchor is the point of a shape that follows the grid', () => {
    expect(shapeAnchor({t: 'line', x1: 1, y1: 12, x2: 5, y2: 12})).toEqual({x: 1, y: 12})
    expect(shapeAnchor({t: 'circle', cx: 3, cy: 4, r: 1})).toEqual({x: 3, y: 4})
    expect(shapeAnchor({t: 'path', d: 'M8.09 4.61 L9 9'})).toEqual({x: 8.09, y: 4.61})
    expect(shapeAnchor({t: 'rect', x: 2, y: 3, w: 1, h: 1})).toEqual({x: 2, y: 3})
})
