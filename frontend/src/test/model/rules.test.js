// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {LIMITS, parseSpecs, summarize, verify} from '../../model/rules.js'
import {baseProject, node} from '../utils.jsx'
import {placeableNodes} from '../../model/project.js'
import {flatten} from '../../model/tree.js'

const ok = () => {
    const p = baseProject()
    p.footer = {titel: 'Woning', gemeente: 'Gent', eigenaar: 'Jan', tekenaar: 'Piet', datum: '2026-01-01'}
    p.een[0].tree = [
        node('A', 'aansluiting', [
            node('T', 'teller', [
                node('B', 'bord', [
                    node(
                        'D',
                        'diff',
                        [
                            node('K1', 'kring', [node('S1', 'stopcontact'), node('S2', 'stopcontact2')], {info: 'B16 2,5mm²'}),
                            node('K2', 'kring', [node('SW', 'schakelaar', [node('L1', 'lichtpunt')])], {info: 'B10 1,5mm²'}),
                        ],
                        {info: '40A 30mA'},
                    ),
                    node('E', 'aarding'),
                ]),
            ]),
        ]),
    ]
    p.sit[0].items = placeableNodes(p).map((n) => ({id: 'i' + n.id, kind: 'sym', node: n.id, x: 1, y: 1}))
    return p
}
const get = (p, id) => flatten(p.een.flatMap((g) => g.tree)).find((n) => n.id === id)
const rule = (p, r) => verify(p).filter((i) => i.rule === r)
test('a correct schema has no errors or warnings', () => {
    expect(verify(ok()).filter((i) => i.level !== 'info')).toEqual([])
})
test('overspanning hint is informational and disappears when present', () => {
    const p = ok()
    expect(rule(p, 'spd')[0].level).toBe('info')
    get(p, 'B').children.push(node('O', 'overspanning'))
    expect(rule(p, 'spd')).toHaveLength(0)
})
test('empty schema is an error', () => {
    const p = baseProject()
    expect(verify(p)).toMatchObject([{rule: 'tree.empty', level: 'error'}])
})
test('missing aansluiting and aarding', () => {
    const p = ok()
    get(p, 'T').children = []
    p.een[0].tree = [get(p, 'T')]
    p.een[0].tree[0].children = [node('B2', 'bord', [node('K', 'kring', [node('X', 'vrij')], {info: 'B16 2,5mm²'})])]
    expect(rule(p, 'tree.noConnection')[0].level).toBe('error')
    expect(rule(p, 'earth')[0].level).toBe('error')
})
test('aansluiting without children', () => {
    const p = ok()
    get(p, 'A').children = []
    const i = rule(p, 'connection.empty')
    expect(i).toHaveLength(1)
    expect(i[0]).toMatchObject({level: 'error', nodeId: 'A', page: 0, pageName: 'Blad 1'})
})
test('kring directly under bord lacks differentieel', () => {
    const p = ok()
    const B = get(p, 'B')
    B.children = [...get(p, 'D').children, get(p, 'E')]
    const i = rule(p, 'kring.noDiff')
    expect(i.map((x) => x.nodeId)).toEqual(['K1', 'K2'])
    expect(i[0].level).toBe('error')
})
test('differentieel sensitivity', () => {
    const p = ok()
    const D = get(p, 'D')
    D.info = ''
    expect(rule(p, 'diff.sens')[0].level).toBe('warn')
    D.info = '300mA'
    expect(rule(p, 'diff.stop')[0]).toMatchObject({level: 'error', nodeId: 'D'})
    D.info = '30 mA'
    expect(rule(p, 'diff.stop')).toHaveLength(0)
    expect(rule(p, 'diff.sens')).toHaveLength(0)
    D.info = '300mA'
    D.children = [get(p, 'K2')]
    expect(rule(p, 'diff.stop')).toHaveLength(0)
})
test('empty differentieel, bord and kring', () => {
    const p = ok()
    get(p, 'D').children = []
    expect(rule(p, 'diff.empty')).toHaveLength(1)
    get(p, 'B').children = [get(p, 'E')]
    expect(rule(p, 'bord.empty')).toHaveLength(1)
    const q = ok()
    get(q, 'K1').children = []
    expect(rule(q, 'kring.empty')[0].nodeId).toBe('K1')
})
test('kring specs and cable limits', () => {
    const p = ok(),
        K = get(p, 'K1')
    K.info = ''
    expect(rule(p, 'kring.specs')).toHaveLength(1)
    K.info = 'B16'
    expect(rule(p, 'kring.specs')).toHaveLength(1)
    K.info = '2,5mm²'
    expect(rule(p, 'kring.specs')).toHaveLength(1)
    K.info = 'B20 1,5mm²'
    expect(rule(p, 'kring.cable')[0].msg).toContain('max. 16A')
    K.info = 'B16 1.5mm²'
    expect(rule(p, 'kring.cable')).toHaveLength(0)
    K.info = 'B40 3mm²'
    expect(rule(p, 'kring.cable')).toHaveLength(0)
    K.info = '25A 2,5 mm'
    expect(rule(p, 'kring.cable')).toHaveLength(1)
})
test('too many stopcontacten (a double or triple socket counts as one)', () => {
    const p = ok(),
        K = get(p, 'K1')
    K.children = [...Array.from({length: 4}, (_, i) => node('d' + i, 'stopcontact2')), ...Array.from({length: 4}, (_, i) => node('t' + i, 'stopcontact3'))]
    expect(rule(p, 'kring.stop')).toHaveLength(0) // 8 boxes, 20 outlets
    K.children.push(node('x', 'stopcontact'))
    expect(rule(p, 'kring.stop')[0].msg).toContain(`${LIMITS.maxSockets + 1} stopcontacten`)
})
test('too many lichtpunten, including those behind a switch', () => {
    const p = ok(),
        K = get(p, 'K2')
    K.children = [
        node(
            'SW2',
            'schakelaar',
            Array.from({length: 9}, (_, i) => node('l' + i, 'lichtpunt')),
        ),
    ]
    expect(rule(p, 'kring.light')).toHaveLength(1)
    K.children[0].children.pop()
    expect(rule(p, 'kring.light')).toHaveLength(0)
})
test('dedicated appliances should have their own kring', () => {
    const p = ok(),
        K = get(p, 'K1')
    K.children = [node('o', 'oven')]
    expect(rule(p, 'kring.dedicated')).toHaveLength(0)
    K.children = [node('o', 'oven'), node('s', 'stopcontact')]
    expect(rule(p, 'kring.dedicated')[0].msg).toContain("'o'")
    K.children = [node('sw', 'schakelaar', [node('l', 'lichtpunt')]), node('k', 'kookplaat')]
    expect(rule(p, 'kring.dedicated')).toHaveLength(1)
    K.children = [node('k', 'kookplaat'), node('sw', 'schakelaar')]
    expect(rule(p, 'kring.dedicated')).toHaveLength(0)
})
test('switches must operate a lamp', () => {
    const p = ok()
    get(p, 'SW').children = []
    expect(rule(p, 'switch.empty')).toHaveLength(1)
    get(p, 'K2').children = [node('w', 'wissel', [node('wl', 'wandlamp')]), node('dm', 'dimmer')]
    expect(rule(p, 'switch.empty').map((i) => i.nodeId)).toEqual(['dm'])
})
test('duplicate kring names (case/space insensitive)', () => {
    const p = ok()
    get(p, 'K2').label = ' k1 '
    expect(rule(p, 'kring.duplicate').map((i) => i.nodeId)).toEqual(['K1', 'K2'])
    get(p, 'K2').label = 'K2'
    expect(rule(p, 'kring.duplicate')).toHaveLength(0)
})
test('hierarchy violations (free mode)', () => {
    const p = ok()
    get(p, 'B').children.push(node('bad', 'stopcontact'), node('A2', 'aansluiting'))
    get(p, 'D').children.push(node('A3', 'aansluiting'))
    p.een[0].tree.push(node('loose', 'kring'), node('A4', 'aansluiting', [node('A5', 'aansluiting')]))
    const h = rule(p, 'hierarchy')
    expect(h.map((i) => i.nodeId)).toEqual(['A3', 'bad', 'A2', 'loose', 'A5'])
    expect(h[1].msg).toContain('mag niet onder')
    expect(h[3].msg).toContain('kan niet los staan')
})
test('footer completeness', () => {
    const p = ok()
    expect(rule(p, 'footer')).toHaveLength(0)
    p.footer = {titel: '  ', gemeente: 'Gent'}
    expect(rule(p, 'footer')[0].msg).toBe('Kaderinfo onvolledig: titel, eigenaar, getekend door, datum.')
    p.footer = undefined
    expect(rule(p, 'footer')).toHaveLength(1)
})
test('components missing on the situatieschema (placement across pages)', () => {
    const p = ok()
    p.sit[0].items = p.sit[0].items.filter((i) => i.node !== 'S1')
    const u = rule(p, 'plan.unplaced')
    expect(u).toHaveLength(1)
    expect(u[0]).toMatchObject({nodeId: 'S1', level: 'warn'})
    p.sit.push({id: 's2', name: '2', walls: [], items: [{id: 'z', kind: 'sym', node: 'S1'}]})
    expect(rule(p, 'plan.unplaced')).toHaveLength(0)
})
test('multiple pages: earth on another page counts, page index reported', () => {
    const p = ok()
    const E = get(p, 'E')
    get(p, 'B').children = [get(p, 'D')]
    p.een.push({id: 'e2', name: 'Extra', tree: [node('A9', 'aansluiting', [E])]})
    expect(rule(p, 'earth')).toHaveLength(0)
    p.een[1].tree[0].children = []
    expect(rule(p, 'connection.empty')[0]).toMatchObject({page: 1, pageName: 'Extra'})
    expect(rule(p, 'earth')).toHaveLength(1)
})
test('custom components count as consumers', () => {
    const p = ok()
    p.custom = [{id: 'c1', name: 'X', shapes: []}]
    get(p, 'K1').children = [node('cx', 'custom:c1')]
    p.sit[0].items.push({id: 'q', kind: 'sym', node: 'cx'})
    expect(verify(p).filter((i) => i.level !== 'info')).toEqual([])
})
test('issues are sorted error > warn > info with unique ids', () => {
    const p = ok()
    get(p, 'D').info = ''
    get(p, 'K1').info = ''
    get(p, 'T').children = []
    const v = verify(p),
        l = v.map((i) => i.level)
    expect(l).toEqual([...l].sort((a, b) => ({error: 0, warn: 1, info: 2})[a] - {error: 0, warn: 1, info: 2}[b]))
    expect(new Set(v.map((i) => i.id)).size).toBe(v.length)
    expect(summarize(v)).toEqual({
        error: l.filter((x) => x === 'error').length,
        warn: l.filter((x) => x === 'warn').length,
        info: l.filter((x) => x === 'info').length,
    })
})
test('parseSpecs', () => {
    expect(parseSpecs('B16 2P 2,5mm²')).toEqual({amp: 16, mm2: 2.5, mA: null})
    expect(parseSpecs('40A / 30mA')).toEqual({amp: 40, mm2: null, mA: 30})
    expect(parseSpecs('300 mA')).toEqual({amp: null, mm2: null, mA: 300})
    expect(parseSpecs('c10 1.5 mm')).toEqual({amp: 10, mm2: 1.5, mA: null})
    expect(parseSpecs()).toEqual({amp: null, mm2: null, mA: null})
    expect(parseSpecs('niets')).toEqual({amp: null, mm2: null, mA: null})
})

test('a main differential on the aansluiting protects circuits directly on the bus', () => {
    const p = ok()
    get(p, 'B').children = [...get(p, 'D').children, get(p, 'E')]
    get(p, 'A').p = {bescherming: 'differentieel'}
    expect(rule(p, 'kring.noDiff')).toHaveLength(0)
    get(p, 'A').p = {bescherming: 'automatisch'}
    expect(rule(p, 'kring.noDiff')).toHaveLength(2)
})
test('a geaard bord counts as earth', () => {
    const p = ok()
    get(p, 'B').children = [get(p, 'D')]
    expect(rule(p, 'earth')).toHaveLength(1)
    get(p, 'B').p = {geaard: true}
    expect(rule(p, 'earth')).toHaveLength(0)
})
test('circuits without protection skip the spec checks', () => {
    const p = ok(),
        K = get(p, 'K1')
    K.info = ''
    K.p = {bescherming: 'geen'}
    expect(rule(p, 'kring.specs')).toHaveLength(0)
    K.info = 'B40 1,5mm²'
    expect(rule(p, 'kring.cable')).toHaveLength(0)
    K.p = {bescherming: 'automatisch'}
    expect(rule(p, 'kring.cable')).toHaveLength(1)
})
test('aantal weighs lichtpunten but not stopcontacten (a multiple socket is one)', () => {
    const p = ok(),
        K = get(p, 'K1')
    K.children = [node('a', 'stopcontact', [], {p: {aantal: 9}})]
    expect(rule(p, 'kring.stop')).toHaveLength(0)
    K.children = [node('a', 'stopcontact2', [], {p: {aantal: 2}})]
    expect(rule(p, 'kring.stop')).toHaveLength(0)
    const L = get(p, 'K2')
    L.children = [node('l', 'lichtpunt', [], {p: {aantal: '9'}})]
    expect(rule(p, 'kring.light')).toHaveLength(1)
    L.children = [node('l', 'lichtcircuit', [], {p: {aantal: 8}})]
    expect(rule(p, 'kring.light')).toHaveLength(0)
})
test('cable section is read from 3G2,5 notation', () => {
    expect(parseSpecs('C16 XVB Cca 3G2,5').mm2).toBe(2.5)
    expect(parseSpecs('3G1,5').mm2).toBe(1.5)
    const p = ok()
    get(p, 'K1').info = 'C20 2P XVB Cca 3G1,5'
    expect(rule(p, 'kring.cable')[0].msg).toContain('1.5 mm²')
})
test('many unplaced components are summarised in one warning', () => {
    const p = ok()
    p.sit[0].items = []
    get(p, 'K1').children.push(...Array.from({length: 5}, (_, i) => node('x' + i, 'stopcontact')))
    const u = rule(p, 'plan.unplaced')
    expect(u).toHaveLength(1)
    expect(u[0].msg).toMatch(/^11 componenten staan nog niet op het situatieschema \(o\.a\. /)
    get(p, 'K1').children = [get(p, 'S1')]
    expect(rule(p, 'plan.unplaced').length).toBeGreaterThan(1)
})
test('nested circuits are valid; empty circuit names are not duplicates', () => {
    const p = ok()
    get(p, 'K1').children.push(
        node('KN', 'kring', [node('m', 'motor')], {label: ''}),
        node('KM', 'kring', [node('m2', 'motor')], {label: ''}),
    )
    p.sit[0].items.push({id: 'q', kind: 'sym', node: 'm'}, {id: 'q2', kind: 'sym', node: 'm2'})
    expect(rule(p, 'hierarchy')).toHaveLength(0)
    expect(rule(p, 'kring.duplicate')).toHaveLength(0)
})
test('components hidden from the situatieschema are not reported as missing', () => {
    const p = ok()
    p.sit[0].items = p.sit[0].items.filter((i) => i.node !== 'S1')
    expect(rule(p, 'plan.unplaced')).toHaveLength(1)
    p.hidden = ['S1']
    expect(rule(p, 'plan.unplaced')).toHaveLength(0)
})
test('an issue about an element carries its circuit and point (as drawn), other issues carry none', () => {
    const p = ok()
    get(p, 'K1').label = 'F'
    get(p, 'K2').label = 'G'
    p.sit[0].items = p.sit[0].items.filter((i) => i.node !== 'S2' && i.node !== 'L1')
    const un = verify(p).filter((i) => i.rule === 'plan.unplaced')
    // S2 is the 2nd element under circuit F, the lamp hangs under the switch that is point 1 of circuit G
    expect(un.map((i) => i.mark).sort()).toEqual(['F2', 'G1'])
    expect(rule(p, 'footer')).toEqual([])
    expect(verify({...p, footer: {}}).find((i) => i.rule === 'footer').mark).toBeUndefined()
    // a circuit itself is named in its message, no extra mark
    get(p, 'K1').children = []
    expect(rule(p, 'kring.empty')[0].mark).toBeUndefined()
})

test('an empty symbol (made by the insert buttons) is a warning, not a hierarchy error', () => {
    const p = ok()
    p.een[0].tree[0].children[0].children[0].children[0].children[0].children.push(node('X', 'leeg'))
    const is = verify(p)
    expect(is.some((i) => i.rule === 'symbol.empty' && i.nodeId === 'X' && i.level === 'warn')).toBe(true)
    expect(is.some((i) => i.rule === 'hierarchy')).toBe(false)
})

// a circuit that only feeds a sub board (feeder) must not collect what hangs behind the circuits further down
const feeder = () => {
    const p = ok()
    const many = (t, n) => Array.from({length: n}, (_, i) => node('m' + t + i, t))
    get(p, 'D').children = [
        node('Z', 'kring', [
            node('ZA', 'kring', [
                node('SB', 'subbord', [
                    node('ZB', 'diff', [node('SB2', 'subbord', [
                        node('ZC', 'kring', many('lichtpunt', 6).concat(many('stopcontact', 6)), {info: 'B16 2,5mm²'}),
                        node('ZD', 'kring', [node('AC', 'airco')], {info: 'B20 2,5mm²'}),
                        node('ZE', 'kring', many('lichtpunt', 6).concat(many('stopcontact', 6)), {info: 'B16 2,5mm²'}),
                    ])], {info: '40A 30mA'}),
                ]),
            ], {info: 'C40 2P'}),
        ], {info: 'C40 2P 6mm²'}),
    ]
    return p
}
test('counts are done on the last circuit, not on the feeder circuits above it', () => {
    const p = feeder()
    // 6 + 6 per circuit stays within the limits, but summed over ZC + ZE it would not (12 + 12)
    expect(rule(p, 'kring.stop')).toHaveLength(0)
    expect(rule(p, 'kring.light')).toHaveLength(0)
    expect(rule(p, 'kring.dedicated')).toHaveLength(0) // the airco is alone behind ZD
})
test('a circuit behind the last breaker is still counted, with the sheet it is drawn on', () => {
    const p = feeder()
    get(p, 'ZC').children.push(...Array.from({length: 5}, (_, i) => node('x' + i, 'stopcontact')))
    const i = rule(p, 'kring.stop')
    expect(i).toHaveLength(1)
    expect(i[0].msg).toContain("'ZC'")
    expect(i[0].msg).toContain('11 stopcontacten')
    expect(i[0].pageName).toBeTruthy()
})
test('a dedicated appliance sharing its own circuit with others is still reported', () => {
    const p = feeder()
    get(p, 'ZD').children.push(node('extra', 'stopcontact'))
    expect(rule(p, 'kring.dedicated').map((x) => x.nodeId)).toEqual(['ZD'])
})