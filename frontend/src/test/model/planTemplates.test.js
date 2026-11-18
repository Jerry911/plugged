// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {PLAN_TEMPLATES, TEMPLATE_AREA, bestScaleForTemplate, fitsAt, hasDrawing, roomWalls, scaleForTemplate, templatePages} from '../../model/planTemplates.js'
import {t} from '../../i18n/translate.js'

const EPSILON = 1e-6
// the wall an opening lies on: a wall of the same direction through its centre that holds its whole width
const wallUnder = (walls, opening) =>
    walls.find((wall) =>
        opening.r === 0
            ? Math.abs(wall.y1 - opening.y) < EPSILON && wall.y1 === wall.y2 && Math.min(wall.x1, wall.x2) <= opening.x - opening.w / 2 + EPSILON && Math.max(wall.x1, wall.x2) >= opening.x + opening.w / 2 - EPSILON
            : Math.abs(wall.x1 - opening.x) < EPSILON && wall.x1 === wall.x2 && Math.min(wall.y1, wall.y2) <= opening.y - opening.w / 2 + EPSILON && Math.max(wall.y1, wall.y2) >= opening.y + opening.w / 2 - EPSILON,
    )
const onEdgeOf = (room, opening) =>
    opening.r === 0
        ? (Math.abs(opening.y - room.y) < EPSILON || Math.abs(opening.y - (room.y + room.h)) < EPSILON) && opening.x > room.x && opening.x < room.x + room.w
        : (Math.abs(opening.x - room.x) < EPSILON || Math.abs(opening.x - (room.x + room.w)) < EPSILON) && opening.y > room.y && opening.y < room.y + room.h
const overlap = (a, b) => a.x < b.x + b.w - EPSILON && b.x < a.x + a.w - EPSILON && a.y < b.y + b.h - EPSILON && b.y < a.y + a.h - EPSILON

describe.each(PLAN_TEMPLATES.map((template) => [template.id, template]))('template %s', (id, template) => {
    test.each(template.floors.map((floor) => [floor.name, floor]))('floor %s: rooms inside the outline and not overlapping', (name, floor) => {
        floor.rooms.forEach((room) => {
            expect(room.x).toBeGreaterThanOrEqual(0)
            expect(room.y).toBeGreaterThanOrEqual(0)
            expect(room.x + room.w).toBeLessThanOrEqual(template.w + EPSILON)
            expect(room.y + room.h).toBeLessThanOrEqual(template.h + EPSILON)
        })
        floor.rooms.forEach((a, i) => floor.rooms.slice(i + 1).forEach((b) => expect(overlap(a, b), `${a.name} / ${b.name}`).toBe(false)))
        // the rooms fill the outline: no hole in the plan
        const area = floor.rooms.reduce((sum, room) => sum + room.w * room.h, 0)
        expect(area).toBeCloseTo(template.w * template.h, 5)
    })
    test.each(template.floors.map((floor) => [floor.name, floor]))('floor %s: every door, window and passage lies on a wall, and none overlap', (name, floor) => {
        const walls = roomWalls(floor.rooms),
            openings = [...floor.doors, ...floor.windows, ...(floor.passages || [])]
        openings.forEach((opening) => expect(wallUnder(walls, opening), JSON.stringify(opening)).toBeTruthy())
        // two openings on the same wall line do not overlap
        openings.forEach((a, i) =>
            openings.slice(i + 1).forEach((b) => {
                const sameLine = a.r === b.r && (a.r === 0 ? Math.abs(a.y - b.y) < EPSILON : Math.abs(a.x - b.x) < EPSILON),
                    along = (o) => (o.r === 0 ? o.x : o.y)
                if (sameLine) expect(Math.abs(along(a) - along(b)), `${JSON.stringify(a)} / ${JSON.stringify(b)}`).toBeGreaterThanOrEqual((a.w + b.w) / 2 - EPSILON)
            }),
        )
        // doors and windows are not in a passage: there is still wall under them
        const cutWalls = roomWalls(floor.rooms, floor.passages)
        ;[...floor.doors, ...floor.windows].forEach((opening) => expect(wallUnder(cutWalls, opening), JSON.stringify(opening)).toBeTruthy())
    })
    test.each(template.floors.map((floor) => [floor.name, floor]))('floor %s: every room but the stairs can be entered', (name, floor) => {
        floor.rooms
            .filter((room) => room.name !== 'stairs')
            .forEach((room) => expect([...floor.doors, ...(floor.passages || [])].some((door) => onEdgeOf(room, door)), room.name).toBe(true))
    })
    test('the stairs are in the same place on every floor', () => {
        const stairs = template.floors.map((floor) => floor.rooms.find((room) => room.name === 'stairs')).filter(Boolean)
        stairs.forEach((room) => expect(room).toMatchObject({x: stairs[0].x, w: stairs[0].w}))
    })
    test('fits an A4 sheet at 1:50, and fills at least three quarters of its width or height at its best scale', () => {
        expect(fitsAt(template, 50)).toBe(true)
        expect(scaleForTemplate(template, 50)).toBe(50)
        const best = bestScaleForTemplate(template)
        expect(best).toBeLessThanOrEqual(50)
        expect(Math.max((template.w * 1000) / best / TEMPLATE_AREA.w, (template.h * 1000) / best / TEMPLATE_AREA.h)).toBeGreaterThan(0.75)
    })
    test('every room and floor has a name in every language', async () => {
        const {setLanguage} = await import('../../i18n/translate.js')
        for (const language of ['nl', 'fr', 'en']) {
            setLanguage(language)
            expect(t('templates.names.' + id)).not.toBe('templates.names.' + id)
            expect(t('templates.descriptions.' + id)).not.toBe('templates.descriptions.' + id)
            template.floors.forEach((floor) => {
                expect(t('templates.floors.' + floor.name)).not.toBe('templates.floors.' + floor.name)
                floor.rooms.forEach((room) => expect(t('templates.rooms.' + room.name)).not.toBe('templates.rooms.' + room.name))
            })
        }
        setLanguage('nl')
    })
})

test('shared walls are one line: two rooms side by side give 7 walls, not 8', () => {
    const walls = roomWalls([
        {x: 0, y: 0, w: 4, h: 3},
        {x: 4, y: 0, w: 2, h: 3},
    ])
    // top and bottom run over both rooms; left, middle and right
    expect(walls).toHaveLength(5)
    expect(walls).toContainEqual({x1: 0, y1: 0, x2: 6, y2: 0})
    expect(walls).toContainEqual({x1: 4, y1: 0, x2: 4, y2: 3})
})

test('a passage leaves out that part of the wall', () => {
    const walls = roomWalls(
        [
            {x: 0, y: 0, w: 4, h: 3},
            {x: 4, y: 0, w: 2, h: 3},
        ],
        [{x: 4, y: 1.5, r: 90, w: 1}],
    )
    expect(walls).toContainEqual({x1: 4, y1: 0, x2: 4, y2: 1})
    expect(walls).toContainEqual({x1: 4, y1: 2, x2: 4, y2: 3})
    expect(walls).toHaveLength(6)
})

test('the pages: one per floor, in millimetres at the scale, centred in the drawing area', () => {
    let next = 0
    const newId = () => 'id' + next++,
        template = PLAN_TEMPLATES.find((candidate) => candidate.id === 'terraced'),
        pages = templatePages(template, 50, t, newId)
    expect(pages.map((page) => page.name)).toEqual([t('templates.floors.ground'), t('templates.floors.first')])
    const xs = pages[0].walls.flatMap((wall) => [wall.x1, wall.x2]),
        ys = pages[0].walls.flatMap((wall) => [wall.y1, wall.y2])
    // 10 x 6 m at 1:50 = 200 x 120 mm, centred
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(200)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(120)
    expect(Math.min(...xs)).toBeCloseTo(TEMPLATE_AREA.x + (TEMPLATE_AREA.w - 200) / 2)
    expect(Math.min(...ys)).toBeCloseTo(TEMPLATE_AREA.y + (TEMPLATE_AREA.h - 120) / 2)
    const doors = pages[0].items.filter((item) => item.kind === 'door')
    expect(doors).toHaveLength(template.floors[0].doors.length)
    expect(doors[0]).toMatchObject({r: 90, w: 20}) // a front door of 1 m
    expect(pages[0].items.filter((item) => item.kind === 'text').map((item) => item.txt)).toContain(t('templates.rooms.kitchen'))
    // at 1:100 everything is half as big
    const half = templatePages(template, 100, t, newId)[0].items.find((item) => item.kind === 'door')
    expect(half.w).toBeCloseTo(10)
    const ids = pages.flatMap((page) => [...page.walls, ...page.items].map((entry) => entry.id))
    expect(new Set(ids).size).toBe(ids.length)
})

test('a template that does not fit gets a larger standard scale', () => {
    const big = {w: 30, h: 15}
    expect(fitsAt(big, 50)).toBe(false)
    expect(scaleForTemplate(big, 50)).toBe(125) // 240 x 120 mm
    expect(scaleForTemplate({w: 400, h: 400}, 50)).toBeNull()
})

test('a drawing on any page', () => {
    expect(hasDrawing([{walls: [], items: []}])).toBe(false)
    expect(hasDrawing([{walls: [], items: []}, {walls: [{id: 'w'}], items: []}])).toBe(true)
})
