// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The rooms the walls enclose: their area, and which room a symbol stands in (by the room name written in it).
import {circuitRoomNames, formatArea, itemRooms, roomArea, roomAt, roomFaces} from '../../model/rooms.js'
import {generateOneWire} from '../../model/generateOneWire.js'
import {flatten} from '../../model/tree.js'
import {typeOf} from '../../symbols/symbolLibrary.js'
import {baseProject} from '../utils.jsx'

const wall = (x1, y1, x2, y2) => ({id: [x1, y1, x2, y2].join(), x1, y1, x2, y2})
// a house of 100 x 50 mm on the sheet, split at x = 40; a wall in the right room stops halfway (it splits nothing)
const house = [wall(0, 0, 100, 0), wall(100, 0, 100, 50), wall(100, 50, 0, 50), wall(0, 50, 0, 0), wall(40, 0, 40, 50), wall(70, 50, 70, 30)]

test('the rooms are the closed areas between the walls, without the outside and without walls that end in a room', () => {
    const faces = roomFaces(house)
    expect(faces.map((face) => face.area)).toEqual([2000, 3000])
    expect(roomAt(faces, {x: 10, y: 10}).area).toBe(2000)
    expect(roomAt(faces, {x: 80, y: 10}).area).toBe(3000)
    expect(roomAt(faces, {x: 120, y: 10})).toBeNull()
})

test('walls that cross or meet in a T split the rooms they cross; a wall running past the house does not make a room outside it', () => {
    const faces = roomFaces([wall(0, 0, 100, 0), wall(100, 0, 100, 50), wall(100, 50, 0, 50), wall(0, 50, 0, 0), wall(-10, 25, 110, 25)])
    expect(faces.map((face) => face.area)).toEqual([2500, 2500])
    expect(roomFaces([wall(0, 0, 10, 0)])).toEqual([])
})

test('the area in m² follows the scale: 40 x 50 mm at 1:50 is 2 x 2,5 m = 5 m²', () => {
    const [face] = roomFaces(house)
    expect(roomArea(face, 50)).toBeCloseTo(5)
    expect(formatArea(12.04, 'nl')).toBe('12,04 m²')
    expect(formatArea(12.04, 'en')).toBe('12.04 m²')
})

test('a symbol stands in the room whose name is written in it; a new circuit is named after the rooms of its points', () => {
    const items = [
        {id: 't1', kind: 'text', x: 10, y: 20, txt: 'Keuken', s: 4, area: true},
        {id: 't2', kind: 'text', x: 60, y: 20, txt: 'Berging', s: 4},
        {id: 's1', kind: 'sym', type: 'stopcontact', x: 20, y: 40, r: 0, s: 7, mark: 'A1'},
        {id: 's2', kind: 'sym', type: 'stopcontact', x: 80, y: 40, r: 0, s: 7, mark: 'A2'},
        {id: 's3', kind: 'sym', type: 'stopcontact', x: 30, y: 30, r: 0, s: 7, mark: 'A3'},
    ]
    const project = {...baseProject(), sit: [{id: 'p', name: 'Gelijkvloers', walls: house, items}]}
    expect([...itemRooms(project).entries()]).toEqual([
        ['s1', 'Keuken'],
        ['s2', 'Berging'],
        ['s3', 'Keuken'],
    ])
    const {project: made} = generateOneWire(project, typeOf)
    const circuit = flatten(made.een[0].tree).find((element) => element.type === 'kring')
    expect(circuit.p.tekst).toBe('Keuken, Berging')
    expect(circuitRoomNames(made, circuit)).toBe('Keuken, Berging')
})
