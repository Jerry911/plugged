// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {shapeBounds, shapesInBox, shapeTouches, unionBounds} from '../../symbols/shapeHit.js'

const left = {t: 'line', x1: 1, y1: 12, x2: 11.5, y2: 12},
    blade = {t: 'line', x1: 11.5, y1: 12, x2: 15, y2: 5},
    ring = {t: 'circle', cx: 12, cy: 12, r: 1.5},
    box = {t: 'rect', x: 2, y: 8.5, w: 20, h: 7},
    half = {t: 'arc', cx: 12, cy: 12, r: 3, a1: 90, a2: 270},
    label = {t: 'text', x: 12, y: 6, s: 'h', fs: 4}

test('bounds of every kind of shape', () => {
    expect(shapeBounds(blade)).toEqual({x1: 11.5, y1: 5, x2: 15, y2: 12})
    expect(shapeBounds(ring)).toEqual({x1: 10.5, y1: 10.5, x2: 13.5, y2: 13.5})
    expect(shapeBounds(box)).toEqual({x1: 2, y1: 8.5, x2: 22, y2: 15.5})
    expect(shapeBounds({t: 'path', d: 'M8 4 L10 4 L9 8 Z'})).toEqual({x1: 8, y1: 4, x2: 10, y2: 8})
    const arc = shapeBounds(half) // a half circle that opens to the right: x from 9 to 12, y from 9 to 15
    expect(arc.x1).toBeCloseTo(9)
    expect(arc.x2).toBeCloseTo(12)
    expect(arc.y1).toBeCloseTo(9)
    expect(arc.y2).toBeCloseTo(15)
    expect(shapeBounds(label).y2).toBe(6)
})
test('a box takes what lies inside it or touches it', () => {
    const shapes = [left, blade, ring]
    expect(shapesInBox(shapes, {x: 0, y: 10}, {x: 11, y: 14})).toEqual([0, 2]) // the line and the ring, not the blade (it starts at x = 11.5)
    expect(shapesInBox(shapes, {x: 24, y: 24}, {x: 0, y: 0})).toEqual([0, 1, 2]) // any direction
    expect(shapesInBox(shapes, {x: 20, y: 20}, {x: 24, y: 24})).toEqual([])
    expect(shapesInBox(shapes, {x: 14, y: 6}, {x: 9, y: 10})).toEqual([1]) // the blade, but not the line or the ring
})
test('the box around several shapes', () => {
    expect(unionBounds([])).toBeNull()
    expect(unionBounds([left, blade])).toEqual({x1: 1, y1: 5, x2: 15, y2: 12})
})
test('a diagonal line is not taken by a box that only touches its bounding box', () => {
    const corner = {x1: 14.5, y1: 10, x2: 15, y2: 11}
    expect(shapeTouches(blade, corner)).toBe(false)
    expect(shapeTouches(blade, {x1: 13, y1: 8, x2: 13.4, y2: 9})).toBe(true)
})
