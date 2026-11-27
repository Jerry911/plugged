import {
    MAX_IMAGE_BYTES,
    calibratedUnderlay,
    fittedUnderlay,
    imageBytes,
    movedUnderlay,
    projectImageBytes,
} from '../../model/underlay.js'

const dataUrl = (bytes) => 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(bytes / 3) * 4)

test('the size of a picture as data URL, of all plans of a project but one', () => {
    expect(imageBytes('data:image/jpeg;base64,QUJD')).toBe(3)
    expect(imageBytes('data:image/jpeg;base64,QUI=')).toBe(2)
    expect(imageBytes(undefined)).toBe(0)
    const project = {sit: [{id: 'a', underlay: {src: dataUrl(300)}}, {id: 'b', underlay: {src: dataUrl(600)}}, {id: 'c'}]}
    expect(projectImageBytes(project)).toBe(900)
    expect(projectImageBytes(project, 'b')).toBe(300)
    expect(MAX_IMAGE_BYTES).toBe(800 * 1024)
})

test('a new plan fills the drawing area as far as it can, centred, half transparent', () => {
    // wide: the width of the area decides
    expect(fittedUnderlay('src', 2770, 1000, 'plan.pdf')).toEqual({src: 'src', x: 10, y: 43, w: 277, h: 100, opacity: 0.5, name: 'plan.pdf'})
    // tall: the height decides
    const tall = fittedUnderlay('src', 1000, 2000)
    expect(tall.h).toBe(170)
    expect(tall.w).toBe(85)
    expect(tall.x).toBe(10 + (277 - 85) / 2)
})

test('the scale from two points: the plan grows or shrinks around the first point so their distance is the real one', () => {
    const underlay = {src: 's', x: 10, y: 10, w: 200, h: 100, opacity: 0.5}
    // 40 mm apart on the sheet; really 4 m at 1:50 = 80 mm: twice as big, the first point (30, 20) stays
    const scaled = calibratedUnderlay(underlay, {x: 30, y: 20}, {x: 70, y: 20}, 4, 50)
    expect(scaled).toEqual({src: 's', x: -10, y: 0, w: 400, h: 200, opacity: 0.5})
    // the same point twice, or no distance: unchanged
    expect(calibratedUnderlay(underlay, {x: 30, y: 20}, {x: 30, y: 20}, 4, 50)).toBe(underlay)
    expect(calibratedUnderlay(underlay, {x: 30, y: 20}, {x: 70, y: 20}, 0, 50)).toBe(underlay)
    expect(movedUnderlay(underlay, 5, -2.5)).toMatchObject({x: 15, y: 7.5, w: 200})
})
