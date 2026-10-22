// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {
    boxesOverlap,
    dirTo,
    fmtLen,
    fromSheet,
    hitsInBox,
    itemBox,
    parseDims,
    parseLen,
    r2,
    rectWalls,
    scaleOf,
    segHitsRect,
    toSheet,
    unionBox,
    wallBox,
} from '../geometry.jsx'

test('scaleOf reads the footer scale and falls back to 50', () => {
    expect(scaleOf({schaal: '1:100'})).toBe(100)
    expect(scaleOf({schaal: ' 1 : 20,5 '})).toBe(20.5)
    expect(scaleOf({schaal: '1/25'})).toBe(25)
    for (const f of [{schaal: 'groot'}, {schaal: '1:0'}, {}, undefined]) expect(scaleOf(f)).toBe(50)
})
test('parseLen understands units, comma decimals and rejects junk', () => {
    expect(parseLen('3,5')).toBe(3.5)
    expect(parseLen('3.5 m')).toBe(3.5)
    expect(parseLen('350cm')).toBeCloseTo(3.5)
    expect(parseLen('3500 MM')).toBeCloseTo(3.5)
    for (const s of ['', 'abc', '0', '-2', '2 km', '1,2,3', null, undefined]) expect(parseLen(s)).toBeNull()
})
test('sheet <-> real conversions', () => {
    expect(toSheet(3.5, 50)).toBeCloseTo(70)
    expect(toSheet(100, 50)).toBeNull()
    expect(toSheet(0, 50)).toBeNull()
    expect(fromSheet(70, 50)).toBeCloseTo(3.5)
    expect(fmtLen(70, 50)).toBe('3,50 m')
    expect(fmtLen(40, 100)).toBe('4,00 m')
})
test('parseDims: width x height, single value is a square', () => {
    expect(parseDims('4x3,5')).toEqual({w: 4, h: 3.5})
    expect(parseDims('4 × 350cm')).toEqual({w: 4, h: 3.5})
    expect(parseDims('2')).toEqual({w: 2, h: 2})
    for (const s of ['4x', 'x3', '1x2x3', 'abc', '']) expect(parseDims(s)).toBeNull()
})
test('dirTo snaps to axes within 10 degrees, otherwise keeps the angle', () => {
    const o = {x: 0, y: 0}
    expect(dirTo(o, {x: 50, y: 4})).toEqual({x: 1, y: 0})
    expect(dirTo(o, {x: -50, y: -4})).toEqual({x: -1, y: 0})
    expect(dirTo(o, {x: 3, y: 80})).toEqual({x: 0, y: 1})
    expect(dirTo(o, {x: 2, y: -80})).toEqual({x: 0, y: -1})
    const d = dirTo(o, {x: 30, y: 30})
    expect(d.x).toBeCloseTo(Math.SQRT1_2)
    expect(d.y).toBeCloseTo(Math.SQRT1_2)
    expect(dirTo(o, o)).toEqual({x: 1, y: 0})
})
test('r2 and rectWalls', () => {
    expect(r2(1.23456)).toBe(1.23)
    expect(rectWalls({x: 0, y: 0}, {x: 10, y: 5})).toEqual([
        {x1: 0, y1: 0, x2: 10, y2: 0},
        {x1: 10, y1: 0, x2: 10, y2: 5},
        {x1: 10, y1: 5, x2: 0, y2: 5},
        {x1: 0, y1: 5, x2: 0, y2: 0},
    ])
})
test('segHitsRect: inside, crossing, touching and missing segments', () => {
    const r = {x0: 10, y0: 10, x1: 20, y1: 20}
    expect(segHitsRect(12, 12, 18, 18, r)).toBe(true)
    expect(segHitsRect(0, 15, 30, 15, r)).toBe(true)
    expect(segHitsRect(15, 0, 15, 30, r)).toBe(true)
    expect(segHitsRect(0, 0, 30, 30, r)).toBe(true)
    expect(segHitsRect(0, 10, 10, 10, r)).toBe(true)
    expect(segHitsRect(0, 0, 5, 30, r)).toBe(false)
    expect(segHitsRect(0, 5, 30, 5, r)).toBe(false)
    expect(segHitsRect(25, 0, 25, 30, r)).toBe(false)
    expect(segHitsRect(0, 25, 30, 25, r)).toBe(false)
    expect(segHitsRect(0, 0, 12, 0, r)).toBe(false)
    expect(segHitsRect(0, 30, 9, 21, r)).toBe(false)
    expect(segHitsRect(12, 12, 12, 12, r)).toBe(true)
})
test('boxes: overlap, wallBox, itemBox, unionBox', () => {
    expect(boxesOverlap({x0: 0, y0: 0, x1: 5, y1: 5}, {x0: 5, y0: 5, x1: 9, y1: 9})).toBe(true)
    expect(boxesOverlap({x0: 0, y0: 0, x1: 5, y1: 5}, {x0: 6, y0: 0, x1: 9, y1: 9})).toBe(false)
    expect(boxesOverlap({x0: 0, y0: 0, x1: 5, y1: 5}, {x0: 0, y0: 6, x1: 9, y1: 9})).toBe(false)
    expect(wallBox({x1: 30, y1: 10, x2: 10, y2: 20})).toEqual({x0: 9.2, y0: 9.2, x1: 30.8, y1: 20.8})
    expect(itemBox({kind: 'sym', x: 50, y: 50, s: 8})).toEqual({x0: 45, y0: 45, x1: 55, y1: 55})
    expect(itemBox({kind: 'sym', x: 50, y: 50})).toEqual({x0: 45.5, y0: 45.5, x1: 54.5, y1: 54.5})
    expect(itemBox({kind: 'door', x: 50, y: 50, w: 20})).toEqual({x0: 40, y0: 40, x1: 60, y1: 60})
    expect(itemBox({kind: 'window', x: 50, y: 50})).toEqual({x0: 45, y0: 45, x1: 55, y1: 55})
    const t = itemBox({kind: 'text', x: 10, y: 20, txt: 'Hal', s: 4})
    expect(t).toMatchObject({x0: 10, y0: 16})
    expect(t.x1).toBeCloseTo(16.6)
    expect(itemBox({kind: 'text', x: 0, y: 10}).x1).toBe(4)
    expect(unionBox([])).toBeNull()
    expect(
        unionBox([
            {x0: 1, y0: 2, x1: 3, y1: 4},
            {x0: 0, y0: 3, x1: 9, y1: 8},
        ]),
    ).toEqual({x0: 0, y0: 2, x1: 9, y1: 8})
})
test('hitsInBox returns walls and items that touch the rectangle', () => {
    const walls = [
        {id: 'w1', x1: 0, y1: 0, x2: 40, y2: 0},
        {id: 'w2', x1: 100, y1: 100, x2: 140, y2: 100},
    ]
    const items = [
        {id: 'i1', kind: 'sym', x: 20, y: 10},
        {id: 'i2', kind: 'sym', x: 120, y: 10},
    ]
    expect(hitsInBox({x0: -5, y0: -5, x1: 50, y1: 15}, walls, items)).toEqual([
        {k: 'wall', id: 'w1'},
        {k: 'item', id: 'i1'},
    ])
    expect(hitsInBox({x0: 200, y0: 200, x1: 210, y1: 210}, walls, items)).toEqual([])
})
import {suggestScale as _sug} from '../geometry.jsx'
test('suggestScale picks the smallest larger standard scale that fits', () => {
    expect(_sug(4, 50)).toBeNull()
    expect(_sug(50, 50)).toBe(200)
    expect(_sug(50, 200)).toBeNull()
    expect(_sug(1e6, 50)).toBeNull()
})
