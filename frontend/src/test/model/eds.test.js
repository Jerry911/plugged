// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import pako from 'pako'
import {decodeEds, edsToProject, edsTypeOf, encodeEds, exportEds, importEds, KNOWN_EDS_TYPES, lampKey, moduleKey, projectToEds, socketKey, switchKey} from '../../model/eds.js'
import {flatten} from '../../model/tree.js'
import {verify} from '../../model/rules.js'
import {setLanguage} from '../../i18n/translate.js'
import {baseProject} from '../utils.jsx'

const enc = (j) => 'EDS0040000' + btoa(String.fromCharCode(...pako.deflate(JSON.stringify(j))))
const row = (id, parent, type, props = {}) => ({id, parent, indent: 0, props: {type, ...props}})
const J = () => ({
    data: [
        row(1, 0, 'Aansluiting', {
            met_teller: true,
            aantal_polen: 4,
            bescherming: 'differentieel',
            amperage: 40,
            differentieel_delta_amperage: 300,
            type_differentieel: 'A',
            type_kabel_na_teller: '4x16',
            kortsluitvermogen: '3',
        }),
        row(2, 1, 'Bord', {is_geaard: true}),
        row(5, 2, 'Kring', {
            naam: 'A',
            aantal_polen: '2',
            amperage: '6,5',
            curve_automaat: 'C',
            type_kabel: 'XVB Cca 3G2,5',
            kortsluitvermogen: '3',
            tekst: 'Domotica',
            bescherming: 'automatisch',
        }),
        row(7, 5, 'Contactdoos', {aantal: '3', adres: 'Keuken', nr: '1'}),
        row(8, 7, 'Motor', {adres: 'Garagepoort'}),
        row(9, 2, 'Bord', {naam: 'Veranda'}),
        row(10, 5, 'Iets nieuws'),
        row(11, 5, 'Verbruiker', {tekst: 'Rookmelder'}),
        row(12, 5, 'Schakelaars', {aantal_schakelaars: '2'}),
        row(98, 95, 'Lichtpunt'),
        {id: 99, parent: 5, props: {}},
        row(50, 999, 'Lichtpunt'),
        row(13, 2, 'Kring', {amperage: 'x', bescherming: 'geen'}),
    ],
    properties: {owner: 'Jan Peeters<br>Dorpstraat 12A<br>9000 Gent<br>GSM: 1', info: '230V'},
    sitplanjson: {
        elements: [
            {electroItemId: 7, posx: 100, posy: 200, rotate: '90'},
            {electroItemId: 999, posx: 1, posy: 1},
            {electroItemId: 8, posx: 5000, posy: 5000},
        ],
    },
})
const get = (r, id) => flatten(r.een[0].tree).find((n) => n.id === id)
test('decodeEds reads header + base64 + zlib json', () => {
    expect(decodeEds(enc(J())).data).toHaveLength(13)
    expect(decodeEds('  ' + enc({data: []}) + '\n')).toEqual({data: []})
})
test('decodeEds rejects wrong and corrupt files', () => {
    expect(() => decodeEds('hello')).toThrow('geen geldig .eds-bestand')
    expect(() => decodeEds('EDS0040000!!!')).toThrow('kon niet gelezen worden')
    expect(() => decodeEds('EDS0040000' + btoa('niet gecomprimeerd'))).toThrow('kon niet gelezen')
})
test('tree structure, ids and dropped rows', () => {
    const r = edsToProject(J())
    expect(r.een).toHaveLength(1)
    expect(r.een[0].name).toBe('Blad 1')
    const t = r.een[0].tree
    expect(t.map((n) => n.id)).toEqual(['e1'])
    expect(flatten(t).map((n) => n.id)).toEqual(['e1', 'e2', 'e5', 'e7', 'e8', 'e10', 'e11', 'e12', 'e9', 'e13'])
    expect(get(r, 'e50')).toBeUndefined()
    expect(get(r, 'e99')).toBeUndefined()
    expect(r.stats).toEqual({nodes: 10, circuits: 2, unknown: ['Iets nieuws']})
})
test('type mapping and labels', () => {
    const r = edsToProject(J())
    expect(get(r, 'e7')).toMatchObject({type: 'stopcontact', label: 'Keuken', p: {aantal: 3, nr: '1'}})
    expect(get(r, 'e8')).toMatchObject({type: 'motor', label: 'Garagepoort', p: {aantal: 1}})
    expect(get(r, 'e10')).toMatchObject({type: 'vrij', label: 'Iets nieuws'})
    expect(get(r, 'e11')).toMatchObject({type: 'vrij', label: 'Rookmelder'})
    expect(get(r, 'e12')).toMatchObject({type: 'schakelaar', label: '', p: {aantal: 2}})
    expect(get(r, 'e9').type).toBe('subbord')
    expect(get(r, 'e9').label).toBe('Veranda')
    expect(KNOWN_EDS_TYPES).toContain('Contactdoos')
    expect(KNOWN_EDS_TYPES).toContain('Warmtepomp/airco')
})
test('kring, aansluiting and bord properties', () => {
    const r = edsToProject(J())
    expect(get(r, 'e5')).toMatchObject({
        type: 'kring',
        label: 'A',
        info: 'C6.5 2P XVB Cca 3G2,5',
        p: {polen: 2, amp: 6.5, curve: 'C', kabel: 'XVB Cca 3G2,5', kortsl: '3', tekst: 'Domotica', bescherming: 'automatisch'},
    })
    expect(get(r, 'e13')).toMatchObject({label: '', p: {polen: 2, amp: undefined, bescherming: 'geen'}})
    expect(get(r, 'e1')).toMatchObject({
        label: 'Aansluiting net',
        p: {teller: true, polen: 4, amp: 40, bescherming: 'differentieel', delta: 300, diffType: 'A', kabel: '4x16', kortsl: '3'},
    })
    expect(get(r, 'e2')).toMatchObject({type: 'bord', label: 'Verdeelbord', p: {geaard: true}})
})
test('aansluiting fallbacks', () => {
    const r = edsToProject({data: [row(1, 0, 'Aansluiting', {bescherming: 'iets', met_teller: false}), row(2, 0, 'Aansluiting')]})
    expect(get(r, 'e1').p).toMatchObject({teller: false, bescherming: 'geen', polen: 2})
    expect(r.een[0].tree[1].p.teller).toBe(true)
    const k = edsToProject({data: [row(1, 0, 'Kring')]})
    expect(k.een[0].tree[0].p).toMatchObject({polen: 2, bescherming: 'automatisch', kabel: '', tekst: ''})
})
test('footer from owner lines and info', () => {
    expect(edsToProject(J()).footer).toEqual({
        eigenaar: 'Jan Peeters',
        straat: 'Dorpstraat',
        nr: '12A',
        postcode: '9000',
        gemeente: 'Gent',
        stelsel: '230V',
    })
    expect(edsToProject({data: []}).footer).toEqual({})
    expect(edsToProject({data: [], properties: {owner: 'Alleen naam'}}).footer).toEqual({eigenaar: 'Alleen naam'})
})
test('only the eendraadschema is imported: the situatieschema is ignored', () => {
    const r = edsToProject(J())
    expect(r.sit).toBeUndefined()
    expect(Object.keys(r).sort()).toEqual(['een', 'footer', 'stats'])
})
test('importEds decodes and converts; imported schema verifies without errors', () => {
    const r = importEds(enc(J()))
    expect(r.stats.circuits).toBe(2)
    const p = {...baseProject(), ...r, footer: {...baseProject().footer, ...r.footer}, custom: []}
    expect(
        verify(p)
            .filter((i) => i.level === 'error')
            .map((i) => i.msg),
    ).toEqual([])
})
test('socket symbol follows is_geaard / is_kinderveilig / is_halfwaterdicht', () => {
    const k = (o) => socketKey({type: 'Contactdoos', ...o})
    expect(k({is_geaard: true, is_kinderveilig: true})).toBe('stopcontact_pekid')
    expect(k({is_geaard: true, is_kinderveilig: false})).toBe('stopcontact')
    expect(k({is_geaard: false, is_kinderveilig: true})).toBe('stopcontact_kid')
    expect(k({is_geaard: false, is_kinderveilig: false})).toBe('stopcontact_alg')
    // waterproof is not part of the symbol: it is the property p.h of the socket (see below)
    expect(k({is_geaard: true, is_halfwaterdicht: true})).toBe('stopcontact')
    expect(k({is_geaard: true, is_kinderveilig: true, is_halfwaterdicht: true})).toBe('stopcontact_pekid')
    // options missing: earthed, no child protection (like the eendraadschema)
    expect(k({})).toBe('stopcontact')
})
test('imported earthed + child-safe sockets use the matching symbol and keep their count', () => {
    const sock = (id, o) => row(id, 5, 'Contactdoos', {is_geaard: true, is_kinderveilig: true, is_halfwaterdicht: false, ...o})
    const j = {
        data: [
            row(1, 0, 'Aansluiting'),
            row(2, 1, 'Bord', {is_geaard: true}),
            row(5, 2, 'Kring', {naam: 'A'}),
            sock(20, {aantal: '1'}),
            sock(21, {aantal: '2'}),
            sock(22, {aantal: '3'}),
            sock(23, {is_kinderveilig: false, aantal: '2'}),
            sock(24, {is_geaard: false, is_kinderveilig: false}),
        ],
    }
    const r = edsToProject(j)
    expect(get(r, 'e20')).toMatchObject({type: 'stopcontact_pekid', p: {aantal: 1}})
    expect(get(r, 'e21')).toMatchObject({type: 'stopcontact_pekid', p: {aantal: 2}})
    expect(get(r, 'e22')).toMatchObject({type: 'stopcontact_pekid', p: {aantal: 3}})
    expect(get(r, 'e23')).toMatchObject({type: 'stopcontact', p: {aantal: 2}})
    expect(get(r, 'e24')).toMatchObject({type: 'stopcontact_alg'})
    expect(r.stats.unknown).toEqual([])
})
test('the three socket variants of a real export (earth + child, child only, none) import as three different symbols', () => {
    const o = {aantal: '1', is_halfwaterdicht: false, is_meerfasig: false, heeft_ingebouwde_schakelaar: false, in_verdeelbord: false}
    const r = edsToProject({
        data: [
            row(1, 0, 'Aansluiting'),
            row(2, 1, 'Bord', {is_geaard: true}),
            row(3, 2, 'Kring', {naam: 'A'}),
            row(6, 3, 'Contactdoos', {...o, is_geaard: true, is_kinderveilig: true}),
            row(7, 3, 'Contactdoos', {...o, is_geaard: false, is_kinderveilig: true}),
            row(8, 3, 'Contactdoos', {...o, is_geaard: false, is_kinderveilig: false}),
        ],
    })
    expect(['e6', 'e7', 'e8'].map((id) => get(r, id).type)).toEqual(['stopcontact_pekid', 'stopcontact_kid', 'stopcontact_alg'])
})
test('lamp symbol follows type_lamp, emergency light and wall lamp', () => {
    const k = (o) => lampKey({type: 'Lichtpunt', ...o})
    expect(k({type_lamp: 'standaard'})).toBe('lichtpunt')
    expect(k({})).toBe('lichtpunt')
    expect(k({type_lamp: 'TL', aantal_buizen_indien_TL: '2'})).toBe('tl')
    expect(k({type_lamp: 'spot'})).toBe('spot')
    expect(k({type_lamp: 'led'})).toBe('led')
    expect(k({type_lamp: 'standaard', is_wandlamp: true})).toBe('wandlamp')
    expect(k({type_lamp: 'standaard', type_noodverlichting: 'Centraal'})).toBe('noodlicht')
    expect(k({type_lamp: 'standaard', type_noodverlichting: 'Decentraal', is_wandlamp: true})).toBe('noodlicht')
    expect(k({type_lamp: 'standaard', type_noodverlichting: 'Geen'})).toBe('lichtpunt')
    // no symbol for a wall-mounted spot: the shape of the fitting wins
    expect(k({type_lamp: 'spot', is_wandlamp: true})).toBe('spot')
})
test('switch symbol follows type_schakelaar', () => {
    const k = (t, o) => switchKey({type: 'Schakelaars', type_schakelaar: t, ...o})
    expect(k('enkelpolig')).toBe('schakelaar')
    expect(k('')).toBe('schakelaar')
    expect(k('dubbelpolig')).toBe('schakelaar2')
    expect(k('driepolig')).toBe('schakelaar3')
    expect(k('wissel_enkel')).toBe('wissel')
    expect(k('wissel_dubbel')).toBe('wissel2')
    expect(k('dubbelaansteking')).toBe('omschakelaar')
    expect(k('kruis_enkel')).toBe('kruis')
    expect(k('dimschakelaar')).toBe('dimmer')
    expect(k('rolluikschakelaar')).toBe('rolluik')
    expect(k('bewegingsschakelaar')).toBe('beweging')
    expect(k('dubbelpolig', {heeft_verklikkerlampje: true})).toBe('verklikker')
    expect(k('wissel_enkel', {heeft_verklikkerlampje: true})).toBe('wissel')
    expect(k('schemerschakelaar')).toBeNull()
})
test('a switch variant without a symbol imports as a simple switch and is reported', () => {
    const r = edsToProject({data: [row(1, 0, 'Aansluiting'), row(2, 1, 'Bord'), row(3, 2, 'Kring', {naam: 'A'}), row(4, 3, 'Schakelaars', {type_schakelaar: 'schemerschakelaar'})]})
    expect(get(r, 'e4').type).toBe('schakelaar')
    expect(r.stats.unknown).toEqual(['Schakelaars: schemerschakelaar'])
})
test('imported lights and switches use their own symbols', () => {
    const r = edsToProject({
        data: [
            row(1, 0, 'Aansluiting'),
            row(2, 1, 'Bord'),
            row(3, 2, 'Kring', {naam: 'A'}),
            row(4, 3, 'Schakelaars', {type_schakelaar: 'wissel_enkel'}),
            row(5, 4, 'Lichtpunt', {type_lamp: 'TL'}),
            row(6, 3, 'Schakelaars', {type_schakelaar: 'rolluikschakelaar'}),
            row(7, 3, 'Lichtpunt', {type_lamp: 'led'}),
            row(8, 3, 'Lichtpunt', {type_lamp: 'spot', aantal: '4'}),
            row(9, 3, 'Lichtpunt', {type_lamp: 'standaard', is_wandlamp: true}),
        ],
    })
    expect(['e4', 'e5', 'e6', 'e7', 'e8', 'e9'].map((id) => get(r, id).type)).toEqual(['wissel', 'tl', 'rolluik', 'led', 'spot', 'wandlamp'])
    expect(get(r, 'e8').p.aantal).toBe(4)
})

test('modulaire schakelaar symbol follows module_type', () => {
    const k = (t) => moduleKey({type: 'Modulaire schakelaar', module_type: t})
    expect(['teleruptor', 'dimmer', 'relais', 'minuterie', 'tijdschakelaar', 'iets', undefined].map(k)).toEqual([
        'teleruptor', 'dimmermodule', 'relais', 'minuterie', 'klok', 'modulaire', 'modulaire',
    ])
})

test('a Lichtcircuit with a motion switch becomes that switch with its lights as child', () => {
    const r = edsToProject({
        data: [
            row(1, 0, 'Aansluiting'),
            row(2, 1, 'Bord'),
            row(3, 2, 'Kring', {naam: 'E'}),
            row(4, 3, 'Lichtcircuit', {type_schakelaar: 'bewegingsschakelaar', aantal_lichtpunten: '2', nr: '4'}),
            row(5, 3, 'Lichtcircuit', {}),
        ],
    })
    expect(get(r, 'e4')).toMatchObject({type: 'beweging', p: {nr: '4'}, children: [{id: 'e4l', type: 'lichtpunt', p: {aantal: 2}}]})
    expect(get(r, 'e5')).toMatchObject({type: 'lichtcircuit', children: []})
    expect(r.stats.nodes).toBe(6)
})

test('details of inverter, solar panels and battery become one line each; Droogkast has its own symbol', () => {
    const r = edsToProject({
        data: [
            row(1, 0, 'Aansluiting'),
            row(2, 1, 'Bord'),
            row(3, 2, 'Kring', {naam: 'PV'}),
            row(4, 3, 'Omvormer', {details: 'Merk: Huawei |Type: SUN2000|S/N: HV1|Pmax: 6.6 kW '}),
            row(5, 4, 'Zonnepaneel', {aantal: '15', details: 'Merk: Viessman\nPmax: 400 Wp'}),
            row(6, 4, 'Batterij', {details: ''}),
            row(7, 3, 'Droogkast'),
        ],
    })
    expect(get(r, 'e4').p.details).toBe('Merk: Huawei\nType: SUN2000\nS/N: HV1\nPmax: 6.6 kW')
    expect(get(r, 'e5')).toMatchObject({type: 'zonnepanelen', p: {aantal: 15, details: 'Merk: Viessman\nPmax: 400 Wp'}})
    expect(get(r, 'e6').p.details).toBe('')
    expect(get(r, 'e7').type).toBe('droogkast')
})

test('an EV charger whose text holds a | keeps it as details, a plain address stays the name', () => {
    const r = edsToProject({
        data: [
            row(1, 0, 'Aansluiting'),
            row(2, 1, 'Bord'),
            row(3, 2, 'Kring', {naam: 'L'}),
            row(4, 3, 'EV lader', {adres: 'EVW C8R W | SN: 6220020754'}),
            row(5, 3, 'Motor', {adres: 'Garagepoort'}),
        ],
    })
    expect(get(r, 'e4')).toMatchObject({type: 'laadpaal', label: '', p: {details: 'EVW C8R W\nSN: 6220020754'}})
    expect(get(r, 'e5')).toMatchObject({label: 'Garagepoort', p: {details: ''}})
})
test('a waterproof socket of the eendraadschema becomes a normal socket with the property h', () => {
    const sock = (id, o) => row(id, 5, 'Contactdoos', {is_geaard: true, is_kinderveilig: false, aantal: '1', ...o})
    const r = edsToProject({
        data: [
            row(1, 0, 'Aansluiting'),
            row(2, 1, 'Bord', {is_geaard: true}),
            row(5, 2, 'Kring', {naam: 'A'}),
            sock(30, {is_halfwaterdicht: true}),
            sock(31, {is_halfwaterdicht: false}),
            sock(32, {is_halfwaterdicht: true, is_kinderveilig: true}),
        ],
    })
    expect(get(r, 'e30')).toMatchObject({type: 'stopcontact', p: {h: true}})
    expect(get(r, 'e31').p.h).toBeUndefined()
    expect(get(r, 'e32')).toMatchObject({type: 'stopcontact_pekid', p: {h: true}}) // the 'h' is no longer lost next to child protection
    expect(r.stats.unknown).toEqual([])
})

// ---- export ----
const el = (id, type, children = [], o = {}) => ({id, type, label: '', info: '', children, p: {aantal: 1, nr: '', details: ''}, ...o})
const proj = (tree, footer = {}) => ({footer, een: [{id: 'e1', name: 'Blad 1', tree}], sit: [], custom: []})
const aansl = (kids) =>
    el('a', 'aansluiting', [el('b', 'bord', kids, {label: 'Verdeelbord', p: {geaard: true}})], {
        label: 'Aansluiting net',
        p: {teller: true, polen: 4, amp: 40, bescherming: 'differentieel', delta: 300, diffType: 'A', kabel: '4x16', kortsl: '3'},
    })
const kring = (label, kids, p = {}) => el('k' + label, 'kring', kids, {label, p: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', kortsl: '3', tekst: 'Keuken', bescherming: 'automatisch', ...p}})
test('encodeEds writes the EDS header and decodes again, also for large files', () => {
    // incompressible text, so that the encoded file is large
    let s0 = 1
    const j = {data: [], a: Array.from({length: 200000}, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[(s0 = (s0 * 48271) % 2147483647) % 36]).join('')}
    const s = encodeEds(j)
    expect(s.startsWith('EDS0040000')).toBe(true)
    expect(decodeEds(s)).toEqual(j)
})
test('export writes the rows like the online tool: parent ids, depth, same top level keys', () => {
    const {document: j, stats} = projectToEds(proj([aansl([kring('A', [el('s', 'stopcontact', [], {label: 'Keuken', p: {aantal: 2, nr: '1', details: ''}})])])]))
    expect(Object.keys(j).sort()).toEqual(
        ['active', 'curid', 'currentView', 'data', 'id', 'idToOrdinalMap', 'length', 'mode', 'moving_id', 'print_table', 'properties', 'sitplan', 'sitplanjson', 'sitplanview'].sort(),
    )
    expect(j.data.map((r) => [r.id, r.parent, r.indent, r.props.type])).toEqual([
        [1, 0, 0, 'Aansluiting'],
        [2, 1, 1, 'Bord'],
        [3, 2, 2, 'Kring'],
        [4, 3, 3, 'Contactdoos'],
    ])
    expect(j.id).toEqual([1, 2, 3, 4])
    expect(j.active).toEqual([true, true, true, true])
    expect(j.length).toBe(4)
    expect(j.curid).toBe(5)
    expect(j.data[2].props).toMatchObject({naam: 'A', amperage: '16', aantal_polen: '2', curve_automaat: 'B', type_kabel: 'XVB Cca 3G2,5', tekst: 'Keuken', kabel_locatie: 'N/A'})
    expect(j.data[3].props).toMatchObject({adres: 'Keuken', aantal: '2', nr: '1', is_geaard: true, is_kinderveilig: false})
    expect(stats).toEqual({nodes: 4, circuits: 1, approximated: []})
})
test('export then import gives the same schema', () => {
    const tree = [
        aansl([
            kring('A', [el('l', 'tl', [], {label: '36W', p: {aantal: 3, nr: '', details: ''}}), el('w', 'wissel'), el('r', 'rolluik'), el('m', 'teleruptor'), el('d', 'drukknop', [el('bl', 'bel')])], {plaatsing: 'inwand', inbuis: true}),
            kring('B', [el('z', 'zonnepanelen', [], {p: {aantal: 15, nr: '', details: 'Merk: X\nType: Y'}}), el('o', 'omvormer', [], {label: 'Huawei', p: {aantal: 1, nr: '', details: 'Pmax: 6 kW'}})], {amp: 6.5, curve: 'C'}),
        ]),
    ]
    const back = importEds(exportEds(proj(tree)).text)
    const f = flatten(back.een[0].tree)
    expect(f.map((n) => n.type)).toEqual(['aansluiting', 'bord', 'kring', 'tl', 'wissel', 'rolluik', 'teleruptor', 'drukknop', 'bel', 'kring', 'zonnepanelen', 'omvormer'])
    expect(f.find((n) => n.type === 'kring')).toMatchObject({label: 'A', p: {polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5', plaatsing: 'inwand', inbuis: true, tekst: 'Keuken'}})
    expect(f.find((n) => n.type === 'tl')).toMatchObject({label: '36W', p: {aantal: 3}})
    expect(f.find((n) => n.type === 'zonnepanelen').p).toMatchObject({aantal: 15, details: 'Merk: X\nType: Y'})
    expect(f.find((n) => n.type === 'omvormer')).toMatchObject({label: 'Huawei', p: {details: 'Pmax: 6 kW'}})
    expect(f.find((n) => n.type === 'aansluiting')).toMatchObject({label: 'Aansluiting net', p: {teller: true, polen: 4, amp: 40, bescherming: 'differentieel', delta: 300, diffType: 'A', kabel: '4x16'}})
})
test('every symbol that has an EDS type comes back as the same symbol', () => {
    const keys = [
        'stopcontact', 'stopcontact_alg', 'stopcontact_kid', 'stopcontact_pekid', 'lichtpunt', 'tl', 'spot', 'led', 'wandlamp', 'noodlicht',
        'schakelaar', 'schakelaar2', 'schakelaar3', 'verklikker', 'wissel', 'wissel2', 'omschakelaar', 'kruis', 'dimmer', 'rolluik', 'beweging',
        'drukknop', 'teleruptor', 'dimmermodule', 'relais', 'minuterie', 'klok', 'modulaire', 'motor', 'bel', 'domotica', 'trafo', 'airco', 'ventilatie',
        'microgolf', 'oven', 'kookplaat', 'laadpaal', 'vaatwas', 'droogkast', 'wasmachine', 'zonnepanelen', 'omvormer', 'batterij', 'vrij', 'subbord',
    ]
    const back = importEds(exportEds(proj([aansl([kring('A', keys.map((k, i) => el('n' + i, k)))])])).text)
    const k = flatten(back.een[0].tree).find((n) => n.type === 'kring')
    expect(k.children.map((n) => n.type)).toEqual(keys)
    keys.forEach((x) => expect(edsTypeOf(x)).toBeTruthy())
})
test('double and triple sockets are one socket with a count; waterproof and count survive', () => {
    const back = importEds(exportEds(proj([aansl([kring('A', [el('s2', 'stopcontact2'), el('s3', 'stopcontact3'), el('s', 'stopcontact', [], {p: {aantal: 4, nr: '', details: '', h: true}})])])])).text)
    const [a, b, c] = flatten(back.een[0].tree).filter((n) => n.type === 'stopcontact')
    expect([a.p.aantal, b.p.aantal, c.p.aantal, c.p.h]).toEqual([2, 3, 4, true])
})
test('meter, main switch, differential and fuse are part of the Aansluiting: they disappear and their children move up', () => {
    const t = [el('a', 'aansluiting', [el('t', 'teller', [el('h', 'hoofdschakelaar', [el('d', 'diff', [el('b', 'bord', [kring('A', [])])])])])], {p: {teller: true}})]
    const {document: j, stats} = projectToEds(proj(t))
    expect(j.data.map((r) => [r.parent, r.props.type])).toEqual([[0, 'Aansluiting'], [1, 'Bord'], [2, 'Kring']])
    expect(stats.approximated).toEqual([])
})
test('symbols without an EDS equivalent become a free consumer and are reported', () => {
    const t = [aansl([kring('A', [el('c', 'custom:z', [], {p: {aantal: 1, nr: '', details: 'SN: 1'}}), el('z', 'zoemer', [], {label: 'Gong'}), el('k', 'koelkast')])])]
    const {document: j, stats} = projectToEds(proj(t), {'custom:z': 'Zelf', koelkast: 'Koelkast'})
    const kids = j.data.filter((r) => r.parent === 3).map((r) => [r.props.type, r.props.tekst])
    expect(kids).toEqual([['Verbruiker', 'Zelf | SN: 1'], ['Verbruiker', 'Gong'], ['Verbruiker', 'Koelkast']])
    expect(stats.approximated).toEqual(['Zelf', 'zoemer', 'Koelkast'])
})
test('details of elements without a details field follow the text and are split again on import', () => {
    const back = importEds(exportEds(proj([aansl([kring('A', [el('m', 'motor', [], {p: {aantal: 1, nr: '', details: 'EVW C8R W\nSN: 62'}})])])])).text)
    expect(flatten(back.een[0].tree).find((n) => n.type === 'motor')).toMatchObject({label: '', p: {details: 'EVW C8R W\nSN: 62'}})
})
test('all pages are written one after the other; footer becomes owner and info', () => {
    const p = {...proj([aansl([])], {titel: 'Villa', eigenaar: 'Jan Peeters', straat: 'Dorpstraat', nr: '12A', postcode: '9000', gemeente: 'Gent', stelsel: '230V'}), een: [{id: 'a', tree: [aansl([])]}, {id: 'b', tree: [aansl([])]}]}
    const {document: j} = projectToEds(p)
    expect(j.data.filter((r) => r.parent === 0)).toHaveLength(2)
    expect(j.properties).toMatchObject({owner: 'Jan Peeters<br>Dorpstraat 12A<br>9000 Gent', info: '230V', filename: 'Villa.eds'})
    // the footer survives an export followed by an import
    expect(importEds(exportEds(p).text).footer).toEqual({eigenaar: 'Jan Peeters', straat: 'Dorpstraat', nr: '12A', postcode: '9000', gemeente: 'Gent', stelsel: '230V'})
    expect(projectToEds(proj([])).document.properties.owner).toBe('')
})
test('kring: cable placement, conduit (never with a luchtleiding) and protection', () => {
    const k = (p) => projectToEds(proj([aansl([kring('A', [], p)])])).document.data[2].props
    expect(k({plaatsing: 'opwand', inbuis: true})).toMatchObject({kabel_locatie: 'Op wand', kabel_is_in_buis: true})
    expect(k({plaatsing: 'luchtleiding', inbuis: true})).toMatchObject({kabel_locatie: 'Luchtleiding', kabel_is_in_buis: false})
    expect(k({plaatsing: '', bescherming: 'geen'})).toMatchObject({kabel_locatie: 'N/A', bescherming: 'geen'})
})

// ---- differential circuits ----
const dk = (id, parent, o = {}) =>
    row(id, parent, 'Kring', {naam: 'ZB', bescherming: 'differentieel', amperage: '40', aantal_polen: '4', differentieel_delta_amperage: '30', type_differentieel: 'A', type_kabel: 'XVB Cca 3G6', kortsluitvermogen: '3', ...o})
const DJ = (o) => ({data: [row(1, 0, 'Aansluiting'), row(2, 1, 'Bord'), dk(3, 2, o), row(4, 3, 'Bord', {naam: 'Hoofdbord'}), row(5, 4, 'Kring', {naam: 'U', amperage: '16'}), row(6, 5, 'Contactdoos')]})
test('a differential circuit that feeds a board is imported as a Differentieel with its specs and the board under it as a sub board', () => {
    const r = edsToProject(DJ())
    expect(get(r, 'e3')).toMatchObject({type: 'diff', label: 'ZB', info: '4P 40A 30mA type A', p: {kabel: 'XVB Cca 3G6', kortsl: '3'}})
    // the specs stay properties: the diagram writes them on separate lines
    expect(get(r, 'e3').p).toMatchObject({polen: 4, amp: 40, delta: 30, diffType: 'A', curve: ''})
    expect(get(r, 'e4').type).toBe('subbord')
    expect(get(r, 'e4').label).toBe('Hoofdbord')
    // the circuits of that board stay circuits, under the sub board
    expect(get(r, 'e5').type).toBe('kring')
    expect(r.een[0].tree[0].children[0].children[0].id).toBe('e3')
})
test('a differentieelautomaat names its breaker in the specs', () => {
    const r = edsToProject(DJ({bescherming: 'differentieelautomaat', amperage: '40', aantal_polen: '2', curve_automaat: 'C'}))
    expect(get(r, 'e3')).toMatchObject({type: 'diff', info: '2P C40 30mA type A', p: {polen: 2, amp: 40, curve: 'C', delta: 30, diffType: 'A'}})
})
test('a differential circuit with elements under it is a Differentieel too; an empty one stays a Kring', () => {
    const j = {data: [row(1, 0, 'Aansluiting'), row(2, 1, 'Bord'), dk(3, 2), row(4, 3, 'Contactdoos'), dk(5, 2, {naam: 'Leeg'})]}
    const r = edsToProject(j)
    expect(get(r, 'e3')).toMatchObject({type: 'diff', label: 'ZB', info: '4P 40A 30mA type A'})
    expect(get(r, 'e4').type).toBe('stopcontact')
    // an empty differentieel would not be drawn at all
    expect(get(r, 'e5')).toMatchObject({type: 'kring', p: {bescherming: 'differentieel', amp: 40}})
})
test('differentials under a circuit, under a differentieel and a differential in the main line import without hierarchy errors', () => {
    const j = {
        data: [
            row(1, 0, 'Aansluiting'),
            row(2, 1, 'Bord'),
            row(3, 2, 'Kring', {naam: 'AC', amperage: '25', aantal_polen: '4'}),
            dk(4, 3, {naam: ''}),
            row(5, 4, 'Bord', {naam: 'Veranda'}),
            dk(6, 5, {naam: 'D2'}),
            dk(7, 6, {naam: 'D3'}),
            // an element hangs under a circuit, also behind a differential
            row(8, 7, 'Kring', {naam: 'K'}),
            row(10, 8, 'Contactdoos'),
            row(9, 6, 'Bord', {naam: 'Sub'}),
        ],
    }
    const r = edsToProject(j)
    expect(['e4', 'e6', 'e7'].map((id) => get(r, id).type)).toEqual(['diff', 'diff', 'diff'])
    expect(get(r, 'e5').type).toBe('subbord')
    expect(get(r, 'e9').type).toBe('subbord')
    // (other rules, like the earthing, are not the point here)
    expect(verify({...baseProject(), ...r, custom: []}).filter((i) => i.rule === 'hierarchy').map((i) => i.msg)).toEqual([])
    // a differential directly under the aansluiting is the main line: the board under it stays the main board
    const m = edsToProject({data: [row(1, 0, 'Aansluiting'), dk(2, 1), row(3, 2, 'Bord', {naam: 'Hoofd'}), row(4, 3, 'Kring', {naam: 'A'})]})
    expect(get(m, 'e2').type).toBe('diff')
    expect(get(m, 'e3').type).toBe('bord')
})
test('a Differentieel that feeds boards is exported as a differential circuit and comes back unchanged; other differentials stay in the Aansluiting', () => {
    const imp = importEds(enc(DJ())),
        back = importEds(exportEds({...proj([]), een: imp.een}).text)
    const d = flatten(back.een[0].tree).find((n) => n.type === 'diff')
    expect(d).toMatchObject({label: 'ZB', info: '4P 40A 30mA type A'})
    const {document: j} = projectToEds(proj(importEds(enc(DJ({bescherming: 'differentieelautomaat', aantal_polen: '2', curve_automaat: 'C'}))).een[0].tree))
    expect(j.data[2].props).toMatchObject({type: 'Kring', naam: 'ZB', bescherming: 'differentieelautomaat', aantal_polen: '2', amperage: '40', curve_automaat: 'C', differentieel_delta_amperage: '30', type_differentieel: 'A'})
    expect(j.data[3]).toMatchObject({parent: 3, props: {type: 'Bord', naam: 'Hoofdbord'}})
    // a differentieel in the main line (circuits under it) disappears, as before
    const main = [el('a', 'aansluiting', [el('b', 'bord', [el('d', 'diff', [kring('A', [])], {info: '30mA'})])])]
    expect(projectToEds(proj(main)).document.data.map((r) => r.props.type)).toEqual(['Aansluiting', 'Bord', 'Kring'])
})
test('export: differentials under a circuit, with elements under them, or in a chain are circuits of the EDS; the main line is not', () => {
    const d3 = el('d3', 'diff', [el('s', 'stopcontact')], {label: 'D3', p: {polen: 2, amp: 20, delta: 30, diffType: 'A'}})
    const d2 = el('d2', 'diff', [d3], {label: 'D2', p: {polen: 2, amp: 40, curve: 'C', delta: 30, diffType: 'A'}})
    const t = [aansl([kring('A', [el('x', 'subbord', [d2])])])]
    const {document: j} = projectToEds(proj(t))
    expect(j.data.map((r) => [r.parent, r.props.type, r.props.naam || ''])).toEqual([
        [0, 'Aansluiting', ''],
        [1, 'Bord', ''],
        [2, 'Kring', 'A'],
        [3, 'Bord', ''],
        [4, 'Kring', 'D2'],
        [5, 'Kring', 'D3'],
        [6, 'Contactdoos', ''],
    ])
    expect(j.data[4].props).toMatchObject({bescherming: 'differentieelautomaat', curve_automaat: 'C', amperage: '40'})
    expect(j.data[5].props).toMatchObject({bescherming: 'differentieel', amperage: '20'})
    const back = importEds(exportEds(proj(t)).text)
    expect(flatten(back.een[0].tree).map((n) => n.type)).toEqual(['aansluiting', 'bord', 'kring', 'subbord', 'diff', 'diff', 'stopcontact'])
})
test('the default labels of the connection and the board are not written as a name, whatever language they were made in', () => {
    const french = el('a', 'aansluiting', [el('b', 'bord', [], {label: 'Tableau de distribution', p: {geaard: true}})], {label: 'Raccordement au réseau', p: {teller: true}})
    const rows = projectToEds(proj([french])).document.data
    expect(rows[0].props.naam).toBe('')
    expect(rows[1].props.naam).toBe('')
    const named = el('a', 'aansluiting', [el('b', 'bord', [], {label: 'Garage', p: {}})], {label: 'Hoofdaansluiting', p: {}})
    expect(projectToEds(proj([named])).document.data.map((row) => row.props.naam)).toEqual(['Hoofdaansluiting', 'Garage'])
})
test('an import gives the connection, the board and the page the default names of the active language; errors are translated too', () => {
    setLanguage('en')
    const imported = edsToProject({data: [row(1, 0, 'Aansluiting'), row(2, 1, 'Bord')]})
    expect(imported.een[0].name).toBe('Sheet 1')
    expect(get(imported, 'e1').label).toBe('Grid connection')
    expect(get(imported, 'e2').label).toBe('Distribution board')
    expect(() => decodeEds('nonsense')).toThrow('This is not a valid .eds file.')
    setLanguage('fr')
    expect(() => decodeEds('nonsense')).toThrow('Ce fichier .eds n’est pas valide.')
})
