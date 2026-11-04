// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {expect, test} from 'vitest'
import {DRAWING_AREA, candidateSpots, centredTextBox, itemBox, labelWidth, placeLabels, wallInBox} from '../../model/labelPlacement.js'

const sym = (id, x, y, extra = {}) => ({id, kind: 'sym', x, y, ...extra})
const SIZE = 7
const place = (walls, items, labels = items.filter((item) => item.kind === 'sym').map((item) => ({item, size: SIZE, text: 'A1'}))) =>
    placeLabels(
        walls,
        items.map((item) => ({item, size: item.kind === 'sym' ? SIZE : item.s || item.w || 4})),
        labels,
    )
const overlaps = (a, b) => Math.min(a.x2, b.x2) > Math.max(a.x1, b.x1) && Math.min(a.y2, b.y2) > Math.max(a.y1, b.y1)

test('a free symbol keeps its marking on the right, next to the symbol', () => {
    const spot = place([], [sym('a', 100, 100)]).get('a')
    expect(spot.side).toBe('right')
    expect(spot.box.x1).toBeCloseTo(100 + SIZE / 2 + 0.8, 5)
    expect(spot.y).toBe(100)
})

test('a wall right of the symbol: the marking goes to a free side', () => {
    const wall = {x1: 106, y1: 50, x2: 106, y2: 150}
    const spot = place([wall], [sym('a', 100, 100)]).get('a')
    expect(spot.side).toBe('left')
    expect(wallInBox(wall, spot.box)).toBe(0)
})

test('a symbol in a corner of two walls (right and above-left) still finds a readable spot', () => {
    const walls = [
        {x1: 106, y1: 50, x2: 106, y2: 150},
        {x1: 50, y1: 106, x2: 150, y2: 106},
    ]
    const spot = place(walls, [sym('a', 100, 100)]).get('a')
    expect(walls.every((wall) => wallInBox(wall, spot.box) === 0)).toBe(true)
    expect(['left', 'top-left', 'top']).toContain(spot.side)
})

test('another symbol next to it pushes the marking away, also when the neighbour has a marking of its own', () => {
    const items = [sym('a', 100, 100), sym('b', 110, 100)]
    const spots = place([], items)
    const a = spots.get('a'),
        b = spots.get('b')
    expect(overlaps(a.box, itemBox(items[1], SIZE))).toBe(false)
    expect(overlaps(b.box, itemBox(items[0], SIZE))).toBe(false)
    expect(overlaps(a.box, b.box)).toBe(false)
    expect(b.side).toBe('right')
})

test('markings of neighbours do not cover each other', () => {
    // two symbols one above the other: the right side is free for both, but their markings must not touch
    const items = [sym('a', 100, 100), sym('b', 100, 101)]
    const spots = place([], items)
    expect(overlaps(spots.get('a').box, spots.get('b').box)).toBe(false)
})

test('the marking stays on the drawing area of the sheet', () => {
    const spot = place([], [sym('a', DRAWING_AREA.x2 - 4, 100)]).get('a')
    expect(spot.box.x2).toBeLessThanOrEqual(DRAWING_AREA.x2)
    expect(spot.side).toBe('left')
})

test('doors, windows and texts are obstacles too', () => {
    const door = {id: 'd', kind: 'door', x: 110, y: 100, w: 10}
    expect(place([], [sym('a', 100, 100), door]).get('a').side).not.toBe('right')
    const window = {id: 'w', kind: 'window', x: 106, y: 100, w: 10, r: 90}
    expect(place([], [sym('a', 100, 100), window]).get('a').side).not.toBe('right')
    const text = {id: 't', kind: 'text', x: 104.5, y: 101, s: 4, txt: 'Keuken'}
    expect(place([], [sym('a', 100, 100), text]).get('a').side).not.toBe('right')
})

test('boxes of items follow their rotation and mirroring', () => {
    expect(itemBox(sym('a', 10, 20), 6)).toEqual({x1: 7, y1: 17, x2: 13, y2: 23})
    const door = itemBox({kind: 'door', x: 0, y: 0, w: 10}, 10)
    expect([door.x1, door.y1, door.x2, door.y2]).toEqual([-5, -10, 5, 0])
    const flipped = itemBox({kind: 'door', x: 0, y: 0, w: 10, f: 1, m: 1}, 10)
    expect([flipped.y1, flipped.y2].map((v) => Math.round(v) + 0)).toEqual([0, 10])
    const turned = itemBox({kind: 'window', x: 0, y: 0, r: 90}, 10)
    expect([turned.x1, turned.x2, turned.y1, turned.y2].map((v) => Math.round(v) + 0)).toEqual([-1, 1, -5, 5])
    const text = itemBox({kind: 'text', x: 0, y: 10, txt: ''}, 4)
    expect([text.x1, text.y1, text.x2]).toEqual([0, 6, 4])
})

test('when every spot is taken the one that hides the least wins', () => {
    // symbols all around: no free spot, the marking still gets a place
    const around = [
        [110, 100],
        [90, 100],
        [100, 90],
        [100, 110],
        [110, 90],
        [110, 110],
        [90, 90],
        [90, 110],
    ].map(([x, y], index) => sym('n' + index, x, y))
    const spots = place([], [sym('a', 100, 100), ...around], [{item: sym('a', 100, 100), size: SIZE, text: 'A1'}])
    expect(spots.get('a')).toBeDefined()
})

test('the walls in a box: crossing, along, grazing and far away', () => {
    const box = {x1: 0, y1: 0, x2: 10, y2: 4}
    expect(wallInBox({x1: 5, y1: -10, x2: 5, y2: 10}, box)).toBeCloseTo(5.6, 5)
    expect(wallInBox({x1: -5, y1: 2, x2: 20, y2: 2}, box)).toBeCloseTo(11.6, 5)
    expect(wallInBox({x1: -5, y1: 20, x2: 20, y2: 20}, box)).toBe(0)
    expect(wallInBox({x1: 20, y1: -5, x2: 20, y2: 20}, box)).toBe(0)
    expect(wallInBox({x1: 30, y1: 30, x2: 40, y2: 40}, box)).toBe(0)
    // the end of the wall touches the edge of the grown box: it still counts a little
    expect(wallInBox({x1: 10.8, y1: 2, x2: 20, y2: 2}, box)).toBe(0.1)
})

test('the candidate spots go around the symbol, the right side first', () => {
    const spots = candidateSpots(sym('a', 50, 50), SIZE, 'F12')
    expect(spots.map((spot) => spot.side)).toEqual(['right', 'top-right', 'bottom-right', 'left', 'top-left', 'bottom-left', 'top', 'bottom'])
    const box = itemBox(sym('a', 50, 50), SIZE)
    spots.forEach((spot) => expect(overlaps(spot.box, box), spot.side).toBe(false))
    expect(spots[0].box.x2 - spots[0].box.x1).toBeCloseTo(labelWidth('F12'), 5)
    expect(labelWidth('')).toBeGreaterThan(0)
})

test('other texts on the page (the lengths of the walls) are kept clear of', () => {
    const length = centredTextBox(106, 100, 90, 7, 2.4)
    expect(length.x2 - length.x1).toBeCloseTo(2.4, 5)
    expect(placeLabels([], [{item: sym('a', 100, 100), size: SIZE}], [{item: sym('a', 100, 100), size: SIZE, text: 'A1'}], [length]).get('a').side).not.toBe('right')
})
