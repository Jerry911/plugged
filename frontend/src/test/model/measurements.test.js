// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {earthLabel, measuredValue, measurementValue} from '../../model/measurements.js'
import {sensitiveDifferentialsAtOrigin, verify} from '../../model/rules.js'
import {t} from '../../i18n/translate.js'
import {baseProject, node} from '../utils.jsx'

test('a measured value is read with a comma or a point, with or without unit', () => {
    expect(measuredValue('25')).toBe(25)
    expect(measuredValue('25,4 Ω')).toBe(25.4)
    expect(measuredValue('0.5MΩ')).toBe(0.5)
    expect(measuredValue('')).toBeNull()
    expect(measuredValue(undefined)).toBeNull()
    expect(measuredValue('niet gemeten')).toBeNull()
})
test('a printed value: as typed, without a unit typed along; empty when not filled in', () => {
    expect(measurementValue({}, 'aardingsweerstand')).toBe('')
    expect(measurementValue({aardingsweerstand: '25,4 Ω'}, 'aardingsweerstand')).toBe('25,4')
    expect(measurementValue({isolatieweerstand: '500 MΩ'}, 'isolatieweerstand')).toBe('500')
    expect(measurementValue({isolatieweerstand: '>999'}, 'isolatieweerstand')).toBe('>999')
    expect(measurementValue({meetdatum: ' 13/11/2026 '}, 'meetdatum')).toBe('13/11/2026')
})
test('the earth label', () => {
    expect(earthLabel({})).toBeNull()
    expect(earthLabel({aardingsweerstand: '  '})).toBeNull()
    expect(earthLabel({aardingsweerstand: '12'})).toBe(t('sheet.earthLabel', {value: '12'}))
})

const kring = (id, p = {}) => node(id, 'kring', [node(id + 's', 'stopcontact')], {p: {polen: 2, amp: 16, curve: 'B', bescherming: 'automatisch', ...p}})
const withEarth = (value, circuits) => {
    const p = baseProject()
    p.footer = {...p.footer, aardingsweerstand: value}
    p.een[0].tree = [
        node('A', 'aansluiting', [node('B', 'bord', [...circuits, node('E', 'aarding')], {p: {geaard: true}})], {
            p: {bescherming: 'differentieel', delta: 300, polen: 4, amp: 40},
        }),
    ]
    return p
}
const earthIssues = (p) => verify(p).filter((issue) => issue.rule === 'measure.earth')
const diff30 = (id, kids) => node(id, 'diff', kids, {info: '40A 30mA'})

test('sensitive differentials right after the main differential: circuits and diff elements of 30 mA or less, not nested ones', () => {
    const tree = [
        node('A', 'aansluiting', [
            node('B', 'bord', [
                diff30('D1', [kring('K1'), diff30('Dnested', [])]),
                node('D2', 'diff', [diff30('D3', [kring('K5')]), kring('K6')], {info: '40A 300mA'}),
                kring('K2', {bescherming: 'differentieelautomaat', delta: 30}),
                kring('K3', {bescherming: 'differentieel', delta: 10}),
                kring('K4'),
            ]),
        ], {p: {bescherming: 'differentieel', delta: 300}}),
    ]
    expect(sensitiveDifferentialsAtOrigin(tree)).toBe(4)
})
test('earth resistance: not filled in is info, up to 30 Ω fine, up to 100 Ω only with two sensitive differentials, above 100 Ω an error', () => {
    expect(earthIssues(withEarth('', [kring('K')]))).toEqual([expect.objectContaining({level: 'info', msg: t('verify.rules.earthNotMeasured')})])
    expect(earthIssues(withEarth('30', [kring('K')]))).toEqual([])
    const one = earthIssues(withEarth('45,5', [diff30('D', [kring('K')])]))
    expect(one).toEqual([expect.objectContaining({level: 'warn'})])
    expect(one[0].msg).toBe(t('verify.rules.earthHigh', {value: 45.5, limit: 30, max: 100, count: 1}))
    expect(earthIssues(withEarth('45,5', [diff30('D1', [kring('K1')]), diff30('D2', [kring('K2')])]))).toEqual([])
    const tooHigh = earthIssues(withEarth('120 Ω', [diff30('D1', [kring('K1')]), diff30('D2', [kring('K2')])]))
    expect(tooHigh).toEqual([expect.objectContaining({level: 'error', msg: t('verify.rules.earthTooHigh', {value: 120, max: 100})})])
})
test('the earth messages exist in every language', async () => {
    const {setLanguage} = await import('../../i18n/translate.js')
    for (const language of ['nl', 'fr', 'en']) {
        setLanguage(language)
        for (const key of ['earthNotMeasured', 'earthTooHigh', 'earthHigh']) expect(t('verify.rules.' + key)).not.toBe('verify.rules.' + key)
        for (const key of ['measure.earth', 'measure.insulation', 'measure.date', 'earthLabel']) expect(t('sheet.' + key)).not.toBe('sheet.' + key)
    }
    setLanguage('nl')
})
