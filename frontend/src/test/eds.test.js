// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import pako from 'pako'
import {decodeEds, edsToProject, importEds, KNOWN, lampKey, moduleKey, socketKey, switchKey} from '../eds.jsx'
import {flat} from '../util.jsx'
import {verify} from '../rules.jsx'
import {base} from './utils.jsx'

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
const get = (r, id) => flat(r.een[0].tree).find((n) => n.id === id)
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
    expect(flat(t).map((n) => n.id)).toEqual(['e1', 'e2', 'e5', 'e7', 'e8', 'e10', 'e11', 'e12', 'e9', 'e13'])
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
    expect(KNOWN).toContain('Contactdoos')
    expect(KNOWN).toContain('Warmtepomp/airco')
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
    const p = {...base(), ...r, footer: {...base().footer, ...r.footer}, custom: []}
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
    expect(k({is_geaard: true, is_halfwaterdicht: true})).toBe('stopcontact_h')
    // no symbol for waterproof + child protection: earth + child protection wins
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
