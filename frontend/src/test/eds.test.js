// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import pako from 'pako'
import {decodeEds, edsToProject, importEds, KNOWN} from '../eds.js'
import {flat} from '../util.js'
import {verify} from '../rules.js'
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