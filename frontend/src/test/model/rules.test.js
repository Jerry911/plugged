// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {LIMITS, parseSpecs, RULE_IDS, rulesNotApplicable, summarize, verify} from '../../model/rules.js'
import {baseProject, node} from '../utils.jsx'
import {placeableNodes} from '../../model/project.js'
import {flatten} from '../../model/tree.js'

// a schema with everything the AREI asks to be on it (3.1.2): address, voltage and system, version and date, and per circuit the cable
// (type, conductors, section), its installation method and the type of the differential
export const completeFooter = () => ({titel: 'Woning', straat: 'Kerkstraat', nr: '12', postcode: '9000', gemeente: 'Gent', eigenaar: 'Jan', tekenaar: 'Piet', stelsel: '2x230V TT', rev: 'A', datum: '2026-01-01'})
const ok = () => {
    const p = baseProject()
    p.footer = completeFooter()
    p.een[0].tree = [
        node('A', 'aansluiting', [
            node('T', 'teller', [
                node('B', 'bord', [
                    node(
                        'D',
                        'diff',
                        [
                            node('K1', 'kring', [node('S1', 'stopcontact_pekid'), node('S2', 'stopcontact2')], {info: 'B16 XVB Cca 3G2,5', p: {plaatsing: 'inwand'}}),
                            node('K2', 'kring', [node('SW', 'schakelaar', [node('L1', 'lichtpunt')])], {info: 'B10 XVB Cca 3G1,5', p: {plaatsing: 'inwand'}}),
                        ],
                        {info: '40A 30mA type A'},
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
test('differentieel sensitivity: sockets and lighting go behind 30 mA (AREI 4.2.4.3 b)', () => {
    const p = ok()
    const D = get(p, 'D')
    D.info = ''
    expect(rule(p, 'diff.sens')[0].level).toBe('warn')
    D.info = '300mA'
    // both circuits: K1 feeds sockets, K2 lighting
    expect(rule(p, 'kring.sensitive').map((i) => [i.nodeId, i.level])).toEqual([
        ['K1', 'error'],
        ['K2', 'error'],
    ])
    expect(rule(p, 'kring.sensitive')[0].msg).toContain('300 mA')
    D.info = '30 mA'
    expect(rule(p, 'kring.sensitive')).toHaveLength(0)
    expect(rule(p, 'diff.sens')).toHaveLength(0)
    // a circuit with only a fixed appliance may stay behind the 300 mA one
    D.info = '300mA'
    const K1 = get(p, 'K1')
    get(p, 'K2').children = [node('KP', 'kookplaat')]
    D.children = [get(p, 'K2')]
    expect(rule(p, 'kring.sensitive')).toHaveLength(0)
    // a circuit protected by its own 30 mA differentieelautomaat is fine behind 300 mA
    D.children = [K1]
    K1.p = {bescherming: 'differentieelautomaat', delta: 30}
    expect(rule(p, 'kring.sensitive')).toHaveLength(0)
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
    p.footer = {...completeFooter(), eigenaar: '  ', tekenaar: '', datum: undefined}
    expect(rule(p, 'footer')[0].msg).toBe('Kaderinfo onvolledig: eigenaar, getekend door, datum. Adres, spanning, versie en datum horen op het schema (AREI 3.1.2).')
    // what the AREI asks on the schema: the address, the voltage and system, the version (3.1.2)
    p.footer = {...completeFooter(), straat: '', stelsel: '', rev: ''}
    expect(rule(p, 'footer')[0].msg).toContain('straat, stelsel (spanning en net), versie (rev.)')
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
                        node('ZC', 'kring', [node('ZCs', 'schakelaar', many('lichtpunt', 6)), ...many('stopcontact', 6)], {info: 'B16 2,5mm²'}),
                        node('ZD', 'kring', [node('AC', 'airco')], {info: 'B20 2,5mm²'}),
                        node('ZE', 'kring', [node('ZEs', 'schakelaar', many('lichtpunt', 6)), ...many('stopcontact', 6)], {info: 'B16 2,5mm²'}),
                    ])], {info: '40A 30mA'}),
                ]),
            ], {info: 'C40 2P'}),
        ], {info: 'C40 2P 6mm²'}),
    ]
    return p
}
test('counts are done on the last circuit, not on the feeder circuits above it', () => {
    const p = feeder()
    // 6 sockets + 1 group of lights per circuit stays within the limits, but summed over ZC + ZE it would not
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

describe('AREI Boek 1 (version 07)', () => {
    const many = (type, n, prefix = type) => Array.from({length: n}, (_, i) => node(prefix + i, type))
    const kring = (id, children, info = 'B16 2,5mm²', p) => node(id, 'kring', children, {info, ...(p ? {p} : {})})

    test('4.2.4.3 b: a differential of at most 300 mA at the origin of the installation', () => {
        const p = ok()
        // the 30 mA differential in the board is the first protection: fine
        expect(rule(p, 'main.diff')).toHaveLength(0)
        // a differential on the connection above 300 mA
        get(p, 'A').p = {bescherming: 'differentieel', delta: 500}
        expect(rule(p, 'main.diff')[0]).toMatchObject({level: 'error', nodeId: 'A'})
        expect(rule(p, 'main.diff')[0].msg).toContain('500 mA')
        get(p, 'A').p = {bescherming: 'differentieel', delta: 300}
        expect(rule(p, 'main.diff')).toHaveLength(0)
        // a main switch on the connection and a circuit straight in the board: nothing at the origin
        get(p, 'A').p = {bescherming: 'automatisch'}
        get(p, 'B').children.push(kring('K9', [node('KP', 'kookplaat')]))
        expect(rule(p, 'main.diff')[0].msg).toContain("'K9'")
        // a main fuse before the differential is fine
        const q = ok()
        get(q, 'T').children = [node('F', 'zekering', [get(q, 'B')], {info: '40A'})]
        expect(rule(q, 'main.diff')).toHaveLength(0)
    })

    test('4.2.4.3 b: washing machine, dryer and dishwasher also go behind 30 mA', () => {
        const p = ok()
        get(p, 'B').children.unshift(node('D3', 'diff', [kring('KW', [node('W', 'wasmachine')])], {info: '40A 300mA'}))
        expect(rule(p, 'kring.sensitive').map((i) => i.nodeId)).toEqual(['KW'])
        get(p, 'KW').children = [node('V', 'koelkast')]
        expect(rule(p, 'kring.sensitive')).toHaveLength(0)
    })

    test('4.2.4.3 b: at most 8 final circuits per 30 mA differential', () => {
        const p = ok()
        get(p, 'D').children = Array.from({length: 8}, (_, i) => kring('C' + i, [node('s' + i, 'stopcontact')]))
        expect(rule(p, 'diff.circuits')).toHaveLength(0)
        get(p, 'D').children.push(kring('C8', [node('s8', 'stopcontact')]))
        expect(rule(p, 'diff.circuits')[0]).toMatchObject({level: 'error', nodeId: 'D'})
        expect(rule(p, 'diff.circuits')[0].msg).toContain('9')
    })

    test('4.2.4.3 b: earth resistance above 30 Ω: at most 16 sockets per 30 mA differential, other circuits behind at most 100 mA', () => {
        const p = ok()
        p.footer.aardingsweerstand = '45'
        // K1 has 2 sockets, K2 one group of lights: 3
        expect(rule(p, 'diff.highEarth')).toHaveLength(0)
        get(p, 'D').children.push(kring('K3', many('stopcontact', 7)), kring('K4', many('stopcontact', 7, 'x')))
        expect(rule(p, 'diff.highEarth')[0].msg).toContain('17')
        // a fixed appliance behind the 300 mA main differential only: needs 100 mA now
        const q = ok()
        q.footer.aardingsweerstand = '45'
        get(q, 'A').p = {bescherming: 'differentieel', delta: 300}
        get(q, 'B').children.push(kring('KK', [node('KP', 'kookplaat')], 'B32 6mm²'))
        expect(rule(q, 'kring.highEarth').map((i) => i.nodeId)).toEqual(['KK'])
        q.footer.aardingsweerstand = '25'
        expect(rule(q, 'kring.highEarth')).toHaveLength(0)
        q.footer.aardingsweerstand = '45'
        // behind a 100 mA differential of its own
        const KK = get(q, 'KK')
        get(q, 'B').children = [...get(q, 'B').children.filter((n) => n !== KK), node('D100', 'diff', [KK], {info: '100mA'})]
        expect(rule(q, 'kring.highEarth')).toHaveLength(0)
    })

    test('earth resistance: lower than 100 Ω, so exactly 100 Ω is too high (5.4.1)', () => {
        const p = ok()
        p.footer.aardingsweerstand = '99'
        expect(rule(p, 'measure.earth').map((i) => i.level)).not.toContain('error')
        p.footer.aardingsweerstand = '100'
        expect(rule(p, 'measure.earth').map((i) => i.level)).toEqual(['error'])
    })

    test('5.3.5.2 b: 8 points per circuit, a fixed appliance or a group of lights under one switch counting as one socket', () => {
        const p = ok()
        get(p, 'K1').children = [...many('stopcontact', 6), node('SWx', 'schakelaar', many('lichtpunt', 4)), node('BEL', 'bel')]
        expect(rule(p, 'kring.stop')).toHaveLength(0) // 6 + 1 group + 1 appliance
        get(p, 'K1').children.push(node('LOOSE', 'lichtpunt'))
        const i = rule(p, 'kring.stop')
        expect(i[0]).toMatchObject({level: 'error', nodeId: 'K1'})
        expect(i[0].msg).toContain('6 stopcontacten')
        // a circuit with only lights: a guideline, an info
        const q = ok()
        get(q, 'K2').children = many('lichtpunt', 9)
        expect(rule(q, 'kring.stop')).toHaveLength(0)
        expect(rule(q, 'kring.light')[0].level).toBe('info')
    })

    test('5.2.1.2: at least 2.5 mm², 1.5 mm² only without sockets', () => {
        const p = ok()
        get(p, 'K1').info = 'B16 1,5mm²'
        expect(rule(p, 'kring.section').map((i) => i.nodeId)).toEqual(['K1'])
        expect(rule(p, 'kring.section')).toHaveLength(1) // K2 (lights on 1.5 mm²) is fine
        get(p, 'K2').info = 'B6 1mm²'
        expect(rule(p, 'kring.section').map((i) => i.nodeId)).toEqual(['K1', 'K2'])
        // the section from a cable designation as the properties write it
        get(p, 'K1').info = 'B16 2P XVB Cca 3G1,5'
        expect(rule(p, 'kring.section').map((i) => i.nodeId)).toContain('K1')
    })

    test('4.4.1.4 table 4.11: breakers and fuses for each section', () => {
        const p = ok()
        get(p, 'K1').info = 'B40 6mm²'
        expect(rule(p, 'kring.cable')).toHaveLength(0)
        get(p, 'K1').info = 'C50 6mm²'
        expect(rule(p, 'kring.cable')[0].msg).toContain('max. 40A')
        get(p, 'K1').info = 'B80 16mm²'
        expect(rule(p, 'kring.cable')).toHaveLength(0)
        get(p, 'B').children.push(node('Z', 'zekering', [], {info: '25A 4mm²'}))
        expect(rule(p, 'kring.cable').map((i) => i.nodeId)).toEqual(['Z'])
        expect(rule(p, 'kring.cable')[0].msg).toContain('max. 20A')
    })

    test('5.2.1.2: own circuit by name, and by power (2600 W) as a warning', () => {
        const p = ok()
        get(p, 'K1').children = [node('W', 'wasmachine'), node('s', 'stopcontact')]
        expect(rule(p, 'kring.dedicated')[0]).toMatchObject({level: 'error'})
        get(p, 'K1').children = [node('BO', 'boiler'), node('s', 'stopcontact')]
        expect(rule(p, 'kring.dedicated')[0]).toMatchObject({level: 'warn'})
        expect(rule(p, 'kring.dedicated')[0].msg).toContain('2600 W')
    })

    test('5.3.5.2 b: at least two lighting circuits (an info: the drawing does not show the rooms)', () => {
        const p = ok()
        expect(rule(p, 'lighting.circuits')[0].level).toBe('info')
        get(p, 'D').children.push(kring('K3', [node('SW3', 'schakelaar', [node('L3', 'lichtpunt')])], 'B10 1,5mm²'))
        expect(rule(p, 'lighting.circuits')).toHaveLength(0)
    })

    test('7.22: a charging station on its own circuit with its own 30 mA differential against DC faults, never through a socket', () => {
        const p = ok()
        // behind the 30 mA differential shared with K1 and K2
        get(p, 'D').children.push(kring('EV', [node('LP', 'laadpaal')], 'B32 6mm²'))
        expect(rule(p, 'ev.differential').map((i) => i.nodeId)).toEqual(['EV'])
        // its own differentieelautomaat of 30 mA type A: fine, with a reminder about the DC fault current
        get(p, 'D').children = get(p, 'D').children.filter((n) => n.id !== 'EV')
        get(p, 'B').children.push(kring('EV', [node('LP', 'laadpaal')], 'B32 6mm²', {bescherming: 'differentieelautomaat', delta: 30, diffType: 'A'}))
        expect(rule(p, 'ev.differential')).toHaveLength(0)
        expect(rule(p, 'ev.dc')[0].level).toBe('info')
        get(p, 'EV').p.diffType = 'B'
        expect(rule(p, 'ev.dc')).toHaveLength(0)
        // a separate 30 mA differential with only this circuit is fine too
        const q = ok()
        get(q, 'B').children.push(node('DEV', 'diff', [kring('EV', [node('LP', 'laadpaal')], 'B32 6mm²')], {info: '40A 30mA type B'}))
        expect(rule(q, 'ev.differential')).toHaveLength(0)
        expect(rule(q, 'ev.dc')).toHaveLength(0)
        // through a socket
        get(q, 'EV').children = [node('SX', 'stopcontact', [node('LP', 'laadpaal')])]
        expect(rule(q, 'ev.socket')).toHaveLength(1)
    })
})

describe('AREI Boek 1 (version 07): what the schema states and the devices on it', () => {
    test('3.1.2: capital letters, cable type, conductors, installation method and differential type, reported once per kind', () => {
        const p = ok()
        expect(verify(p).filter((i) => i.rule.startsWith('docs.'))).toEqual([])
        get(p, 'K1').label = 'keuken'
        get(p, 'K1').info = 'B16 2,5mm²'
        get(p, 'K2').info = 'B10 1,5mm²'
        delete get(p, 'K2').p.plaatsing
        get(p, 'D').info = '40A 30mA'
        const docs = Object.fromEntries(verify(p).filter((i) => i.rule.startsWith('docs.')).map((i) => [i.rule, i]))
        expect(Object.keys(docs).sort()).toEqual(['docs.cableType', 'docs.conductors', 'docs.diffType', 'docs.letter', 'docs.placement'])
        expect(docs['docs.cableType'].msg).toContain('keuken, K2')
        expect(docs['docs.placement'].msg).toContain('K2')
        expect(docs['docs.placement'].nodeId).toBe('K2')
        expect(docs['docs.letter'].level).toBe('warn')
        // the properties of a circuit drawn in the editor carry all of it
        get(p, 'K2').p = {plaatsing: 'opwand', kabel: 'XVB Cca 3G1,5'}
        expect(rule(p, 'docs.placement')).toHaveLength(0)
    })

    test('5.3.5.3: a differential is at least type A, breaks all poles, and is at least 40 A at the origin', () => {
        const p = ok()
        get(p, 'D').info = '40A 30mA type AC'
        expect(rule(p, 'diff.type')[0]).toMatchObject({level: 'error', nodeId: 'D'})
        get(p, 'D').info = '1P 40A 30mA type A'
        expect(rule(p, 'diff.poles')[0]).toMatchObject({level: 'error', nodeId: 'D'})
        get(p, 'D').info = '2P 25A 30mA type A'
        expect(rule(p, 'main.rating')[0].msg).toContain('25 A')
        // a differential further down may be smaller
        get(p, 'D').info = '2P 40A 300mA type A'
        get(p, 'D').children = [node('D2', 'diff', get(p, 'D').children, {info: '2P 25A 30mA type A'})]
        expect(rule(p, 'main.rating')).toHaveLength(0)
        // on the connection
        const q = ok()
        get(q, 'A').p = {bescherming: 'differentieel', delta: 300, amp: 25, diffType: 'A'}
        expect(rule(q, 'main.rating')[0].nodeId).toBe('A')
    })

    test('5.3.3.1 e: a breaking capacity of at least 3 kA', () => {
        const p = ok()
        get(p, 'K1').p.kortsl = '1,5'
        expect(rule(p, 'kring.breaking')[0]).toMatchObject({level: 'error', nodeId: 'K1'})
        get(p, 'K1').p.kortsl = '3'
        expect(rule(p, 'kring.breaking')).toHaveLength(0)
    })

    test('5.2.9.2 and 5.2.9.10: single conductors not in the ground, nor in a wall without conduit', () => {
        const p = ok()
        get(p, 'K1').p = {plaatsing: 'ondergronds', kabel: 'VOB 3x2,5'}
        expect(rule(p, 'cable.placement')[0].msg).toContain('in de grond')
        get(p, 'K1').p = {plaatsing: 'inwand', kabel: 'VOB 3x2,5'}
        expect(rule(p, 'cable.placement')[0].msg).toContain('zonder buis')
        get(p, 'K1').p.inbuis = true
        expect(rule(p, 'cable.placement')).toHaveLength(0)
        get(p, 'K1').p = {plaatsing: 'ondergronds', kabel: 'EXVB 3G2,5'}
        expect(rule(p, 'cable.placement')).toHaveLength(0)
        // the cable only in the text of the circuit, after the breaker
        get(p, 'K1').p = {plaatsing: 'ondergronds'}
        get(p, 'K1').info = 'B32 VOB 3x6'
        expect(rule(p, 'cable.placement')).toHaveLength(1)
        get(p, 'K1').info = 'B32 XVB Cca 3G6'
        expect(rule(p, 'cable.placement')).toHaveLength(0)
    })

    test('5.3.5.2: sockets with an earth contact, and a reminder for child-safe shutters', () => {
        const p = ok()
        expect(rule(p, 'socket.earth')).toHaveLength(0)
        expect(rule(p, 'socket.childSafe')).toHaveLength(0)
        get(p, 'K1').children = [node('S1', 'stopcontact_alg'), node('S3', 'stopcontact_kid'), node('S4', 'stopcontact')]
        expect(rule(p, 'socket.earth')[0]).toMatchObject({level: 'warn', nodeId: 'S1'})
        expect(rule(p, 'socket.earth')[0].msg).toMatch(/^2 /)
        expect(rule(p, 'socket.childSafe')[0]).toMatchObject({level: 'info'})
        expect(rule(p, 'socket.childSafe')[0].msg).toContain('K1')
    })

    test('4.5 and 7.112: surge protection is advice, a PV installation gets its reminders', () => {
        const p = ok()
        expect(rule(p, 'spd')[0].msg).toContain('niet')
        expect(rule(p, 'pv')).toHaveLength(0)
        get(p, 'B').children.push(node('PVK', 'kring', [node('PV', 'zonnepanelen')], {info: 'B20 XVB Cca 3G2,5', p: {plaatsing: 'opwand'}}))
        expect(rule(p, 'pv')[0].level).toBe('info')
    })
})

test('a rule the user switched off is left out; the catalog lists every rule that reports something', () => {
    const p = ok()
    get(p, 'D').info = '300mA type A'
    expect(rule(p, 'kring.sensitive')).toHaveLength(2)
    expect(verify(p, {disabled: ['kring.sensitive']}).filter((i) => i.rule === 'kring.sensitive')).toHaveLength(0)
    expect(verify(p, {disabled: ['kring.sensitive']}).some((i) => i.rule === 'spd')).toBe(true)
    // an empty schema is always reported
    expect(verify(baseProject(), {disabled: RULE_IDS})).toMatchObject([{rule: 'tree.empty'}])
    // every issue of these tests belongs to a rule of the catalog
    const seen = new Set(verify(p).map((i) => i.rule))
    seen.forEach((id) => expect(RULE_IDS).toContain(id))
    expect(new Set(RULE_IDS).size).toBe(RULE_IDS.length)
})

describe('rules with a date: they apply to work started on site from that date (Kaderinfo → Installatie)', () => {
    const nineCircuits = (p) => (get(p, 'D').children = Array.from({length: 9}, (_, i) => node('C' + i, 'kring', [node('s' + i, 'stopcontact_pekid')], {info: 'B16 XVB Cca 3G2,5', p: {plaatsing: 'inwand'}})))

    test('at most 8 circuits per 30 mA differential: from 01/06/2023 (6.5.8.1)', () => {
        const p = ok()
        nineCircuits(p)
        expect(rule(p, 'diff.circuits')).toHaveLength(1) // no date: a new installation
        p.footer.installatiedatum = '15/03/2021'
        expect(rule(p, 'diff.circuits')).toHaveLength(0)
        expect(rulesNotApplicable(p).map((r) => r.id)).toContain('diff.circuits')
        p.footer.installatiedatum = '2024'
        expect(rule(p, 'diff.circuits')).toHaveLength(1)
        // only the year 2023: it may or may not apply, so it is reported with a note
        p.footer.installatiedatum = '2023'
        expect(rule(p, 'diff.circuits')[0].msg).toContain('01/06/2023')
        expect(rule(p, 'diff.circuits')[0].msg).toContain('2023')
        // not a date: everything applies
        p.footer.installatiedatum = 'ooit'
        expect(rule(p, 'diff.circuits')).toHaveLength(1)
        expect(rulesNotApplicable(p)).toEqual([])
    })

    test('30 mA: sockets and lighting only from 01/06/2023, washing machine, dryer and dishwasher always', () => {
        const p = ok()
        get(p, 'D').info = '300mA type A'
        get(p, 'K2').children.push(node('W', 'wasmachine'))
        expect(rule(p, 'kring.sensitive').map((i) => i.nodeId)).toEqual(['K1', 'K2'])
        p.footer.installatiedatum = '2021'
        // K1 (sockets) no longer; K2 still, for the washing machine
        expect(rule(p, 'kring.sensitive').map((i) => i.nodeId)).toEqual(['K2'])
        expect(rule(p, 'kring.sensitive')[0].msg).toContain("'W'")
        p.footer.installatiedatum = '2023'
        expect(rule(p, 'kring.sensitive').find((i) => i.nodeId === 'K1').msg).toContain('01/06/2023')
    })

    test('child-safe sockets from 01/03/2025, charging stations from 01/11/2022', () => {
        const p = ok()
        get(p, 'K1').children = [node('S9', 'stopcontact')]
        get(p, 'D').children.push(node('EV', 'kring', [node('LP', 'laadpaal')], {info: 'B32 XVB Cca 3G6', p: {plaatsing: 'inwand'}}))
        expect(rule(p, 'socket.childSafe')).toHaveLength(1)
        expect(rule(p, 'ev.differential')).toHaveLength(1)
        p.footer.installatiedatum = '06/2024'
        expect(rule(p, 'socket.childSafe')).toHaveLength(0)
        expect(rule(p, 'ev.differential')).toHaveLength(1)
        p.footer.installatiedatum = '2022-10-15'
        expect(rule(p, 'ev.differential')).toHaveLength(0)
    })

    test('an installation from before Book 1 (01/06/2020) gets a note about part 8', () => {
        const p = ok()
        expect(rule(p, 'install.oldArei')).toHaveLength(0)
        p.footer.installatiedatum = '1995'
        expect(rule(p, 'install.oldArei')[0]).toMatchObject({level: 'info'})
        expect(rule(p, 'install.oldArei')[0].msg).toContain('1995')
        p.footer.installatiedatum = '2020'
        expect(rule(p, 'install.oldArei')).toHaveLength(0)
    })
})

test('a socket is any symbol with socket properties, also an own one: a quadruple socket counts as one, its earth contact and child safety come from the symbol', () => {
    const p = ok()
    p.symbols = [
        {k: 'custom:q4', name: 'Viervoudig stopcontact', cat: 'Stopcontacten', parents: ['kring'], shapes: [], sock: {pe: true, n: 4}},
        {k: 'custom:bare', name: 'Stopcontact zonder aarding', cat: 'Stopcontacten', parents: ['kring'], shapes: [], sock: {pe: false, kid: true}},
    ]
    get(p, 'K1').children = Array.from({length: 8}, (_, i) => node('q' + i, 'custom:q4'))
    expect(rule(p, 'kring.stop')).toHaveLength(0) // 8 boxes, 32 outlets
    get(p, 'K1').children.push(node('q8', 'custom:q4'))
    expect(rule(p, 'kring.stop')[0].msg).toContain('9 stopcontacten')
    // sockets on 1.5 mm² and behind 300 mA are found through the symbol too
    get(p, 'K1').info = 'B16 XVB Cca 3G1,5'
    expect(rule(p, 'kring.section').map((i) => i.nodeId)).toEqual(['K1'])
    // a multiple socket is not asked to be child-safe; a single one without earth contact is reported
    expect(rule(p, 'socket.childSafe')).toHaveLength(0)
    get(p, 'K1').children = [node('b', 'custom:bare')]
    expect(rule(p, 'socket.earth')[0].nodeId).toBe('b')
    expect(rule(p, 'socket.childSafe')).toHaveLength(0)
})
