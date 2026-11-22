// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The cable calculations of a circuit: the estimated length from the situatieschema, the voltage drop and the short-circuit current.
import {circuitCalculation, circuitLength, estimateLength, lengthText} from '../../model/calculations.js'

// a board at (0,0) and two sockets on the plan at 1:50: 100 mm on the sheet is 5 m
const project = (properties = {}, {children, footer, items} = {}) => {
    const circuit = {id: 'k', type: 'kring', p: {amp: 16, curve: 'B', kabel: 'XVB 3G2,5', ...properties}, children: children || [{id: 's1', type: 'stopcontact'}, {id: 's2', type: 'stopcontact'}]}
    return {
        circuit,
        project: {
            footer: {schaal: '1:50', ...footer},
            een: [{tree: [{id: 'b', type: 'bord', children: [circuit]}]}],
            sit: [{items: items || [{id: 'i0', kind: 'sym', type: 'bord', node: 'b', x: 0, y: 0}, {id: 'i1', kind: 'sym', node: 's1', x: 100, y: 0}, {id: 'i2', kind: 'sym', node: 's2', x: 100, y: 100}]}],
        },
    }
}

test('the estimate runs from the board to the nearest point along the walls, with the way down and up at every point', () => {
    const {project: p, circuit} = project()
    // 1,5 at the board + 5 m + 1,5 + 5 m + 1,5
    expect(estimateLength(p, circuit, p.een[0].tree[0])).toBe(14.5)
    expect(circuitLength(p, circuit)).toEqual({length: 14.5, estimated: true})
    expect(lengthText(circuitLength(p, circuit), 'nl-BE')).toBe('≈ 14,5 m')
})

test('a typed length wins over the estimate; without the board or the points on the plan there is no estimate', () => {
    const {project: typed, circuit} = project({lengte: '22,5'})
    expect(circuitLength(typed, circuit)).toEqual({length: 22.5, estimated: false})
    expect(lengthText(circuitLength(typed, circuit), 'nl-BE')).toBe('22,5 m')
    const {project: noBoard, circuit: other} = project({}, {items: [{id: 'i1', kind: 'sym', node: 's1', x: 100, y: 0}]})
    expect(circuitLength(noBoard, other)).toBeNull()
    // a symbol without a position (not placed yet) counts as not on the plan
    const {project: unplaced, circuit: third} = project({}, {items: [{id: 'i0', kind: 'sym', type: 'bord', node: 'b', x: 0, y: 0}, {id: 'q', kind: 'sym', node: 's1'}]})
    expect(circuitLength(unplaced, third)).toBeNull()
})

test('voltage drop, short-circuit current and maximum length of a B16 on 2,5 mm² over the estimated 14,5 m', () => {
    const {project: p, circuit} = project()
    const result = circuitCalculation(p, circuit)
    expect(result).toMatchObject({current: 16, section: 2.5, voltage: 230, dropLimit: 5, impedance: 0.3, impedanceAssumed: true, tripCurrent: 80, estimated: true, trips: true, maxLength: 135})
    expect(result.drop).toBeCloseTo(1.816, 2)
    expect(result.shortCircuit).toBeCloseTo(389.5, 0)
})

test('on a long cable the breaker no longer trips for sure and the drop is too high', () => {
    const {project: p, circuit} = project({lengte: '200'})
    const result = circuitCalculation(p, circuit)
    expect(result.estimated).toBe(false)
    expect(result.trips).toBe(false)
    expect(result.shortCircuit).toBeCloseTo(56, 0)
    expect(result.drop).toBeGreaterThan(result.dropLimit)
})

test('the network impedance from Kaderinfo replaces the assumption; lighting has the lower drop limit; a C curve needs 10 In', () => {
    const {project: p, circuit} = project({curve: 'C'}, {footer: {netimpedantie: '0,5'}, children: [{id: 's1', type: 'lichtpunt'}, {id: 's2', type: 'lichtpunt'}]})
    const result = circuitCalculation(p, circuit)
    expect(result).toMatchObject({impedance: 0.5, impedanceAssumed: false, lighting: true, dropLimit: 3, tripCurrent: 160})
})

test('a three-phase circuit on 400 V has √3 × one conductor; without a cable section there is nothing to calculate', () => {
    const {project: p, circuit} = project({polen: 4, lengte: '10'}, {footer: {stelsel: '3N~400V'}})
    expect(circuitCalculation(p, circuit).drop).toBeCloseTo((100 * Math.sqrt(3) * ((0.0225 * 10) / 2.5) * 16) / 400, 4)
    const {project: none, circuit: bare} = project({kabel: ''})
    expect(circuitCalculation(none, bare)).toBeNull()
    const {project: noLength, circuit: loose} = project({}, {items: []})
    expect(circuitCalculation(noLength, loose)).toMatchObject({lengthKnown: false, maxLength: 135})
})
