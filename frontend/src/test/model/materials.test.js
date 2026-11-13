// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {billOfMaterials} from '../../model/materials.js'
import {t} from '../../i18n/translate.js'
import {baseProject, node} from '../utils.jsx'

const kring = (id, kids = [], p = {}) => node(id, 'kring', kids, {p: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', kortsl: 3, bescherming: 'automatisch', ...p}})
const project = (...pages) => ({...baseProject(), een: pages.map((tree, index) => ({id: 'e' + index, name: 'Blad', tree}))})
const house = () =>
    project([
        node(
            'A',
            'aansluiting',
            [
                node('B', 'bord', [
                    kring('K1', [node('S1', 'stopcontact', [], {p: {aantal: 3}}), node('S2', 'stopcontact', [], {p: {aantal: 2, h: true}})]),
                    kring('K2', [node('S3', 'stopcontact', [], {p: {aantal: 1}})]),
                    kring('K3', [node('L', 'lichtpunt')], {amp: 10, kabel: 'XVB Cca 3G1,5'}),
                    kring('K4', [node('W', 'wasmachine')], {bescherming: 'differentieelautomaat', delta: 30, diffType: 'A', amp: 20}),
                    kring('K5', [node('X', 'lichtpunt')], {bescherming: 'geen', kabel: ''}),
                    node('E', 'aarding'),
                ]),
            ],
            {p: {teller: true, polen: 4, amp: 40, bescherming: 'differentieel', delta: 300, diffType: 'A', kabel: '4x16'}},
        ),
    ])

test('protection is grouped by article and sorted by kind, then by rating', () => {
    const {protection, circuits} = billOfMaterials(house())
    expect(circuits).toBe(5)
    expect(protection.map((row) => [row.kind, row.description, row.count, row.marks])).toEqual([
        ['differentieel', t('materials.kinds.differentieel') + ' 4P 40A 300mA ' + t('materials.diffType', {type: 'A'}), 1, ''],
        ['differentieelautomaat', t('materials.kinds.differentieelautomaat') + ' 2P B20 30mA ' + t('materials.diffType', {type: 'A'}) + ' 3 kA', 1, 'K4'],
        ['automatisch', t('materials.kinds.automatisch') + ' 2P B16 3 kA', 2, 'K1, K2'],
        ['automatisch', t('materials.kinds.automatisch') + ' 2P B10 3 kA', 1, 'K3'],
    ])
})
test('an automatic connection is a main switch; separate elements take their specs from their text', () => {
    const p = project([
        node('A', 'aansluiting', [node('D', 'diff', [kring('K')], {info: '2P 40A 30mA type B'}), node('Z', 'zekering', [], {info: '25A', p: {aantal: 3}})], {
            p: {bescherming: 'automatisch', polen: 4, amp: 63},
        }),
    ])
    const rows = billOfMaterials(p).protection
    expect(rows.map((row) => row.kind)).toEqual(['hoofdschakelaar', 'differentieel', 'automatisch', 'zekering'])
    expect(rows[0].description).toBe(t('materials.kinds.hoofdschakelaar') + ' 4P 63A')
    expect(rows[1]).toMatchObject({poles: '2', amp: 40, delta: 30, diffType: 'B'})
    expect(rows[3]).toMatchObject({amp: 25, count: 3})
})
test('a circuit without properties (an older drawing) is a breaker from its text; a connection without them is not counted', () => {
    const p = project([node('A', 'aansluiting', [node('K', 'kring', [], {info: 'C20 2,5mm²'})])])
    expect(billOfMaterials(p).protection.map((row) => row.description)).toEqual([t('materials.kinds.automatisch') + ' C20'])
})
test('cables per designation with the circuits that use them, the connection included', () => {
    const {cables} = billOfMaterials(house())
    expect(cables.map((row) => [row.cable, row.count, row.marks])).toEqual([
        ['XVB Cca 3G2,5', 3, 'K1, K2, K4'],
        ['4x16', 1, t('materials.connection')],
        ['XVB Cca 3G1,5', 1, 'K3'],
    ])
})
test('elements are counted with their Aantal, splash-proof apart, and socket outlets add up; boards are separate', () => {
    const {elements, boards, outlets} = billOfMaterials(house())
    const socket = elements.find((row) => row.type === 'stopcontact' && !row.name.includes(t('materials.waterproof')))
    expect(socket).toMatchObject({count: 4, outlets: 4})
    expect(elements.find((row) => row.name.includes(t('materials.waterproof')))).toMatchObject({count: 2, outlets: 2})
    expect(elements.find((row) => row.type === 'lichtpunt').count).toBe(2)
    expect(elements.some((row) => row.type === 'aarding')).toBe(true)
    expect(elements.some((row) => row.type === 'bord' || row.type === 'kring')).toBe(false)
    expect(outlets).toBe(6)
    expect(boards).toEqual([expect.objectContaining({type: 'bord', count: 1})])
})
test('every page counts, the plan does not', () => {
    const p = project([kring('K1', [node('S', 'stopcontact')])], [kring('K2', [node('T', 'stopcontact')])])
    p.sit[0].items = [{id: 'i', kind: 'sym', node: 'S', x: 1, y: 1}]
    const bom = billOfMaterials(p)
    expect(bom.circuits).toBe(2)
    expect(bom.outlets).toBe(2)
})
test('an empty project has nothing', () => {
    expect(billOfMaterials(baseProject())).toEqual({protection: [], cables: [], elements: [], boards: [], outlets: 0, circuits: 0})
})
