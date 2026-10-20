// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Import of files exported by https://eendraadschema.goethals-jacobs.be/ (.eds = "EDS004" header + base64(zlib(JSON))).
// Only the eendraadschema (circuits, elements) and the owner/address footer are imported; the situatieschema (sitplanjson) is ignored.
import pako from 'pako'
import {infoOf} from './boardModel'
import {uid} from './util'

const MAP = {
    Aansluiting: 'aansluiting',
    Bord: 'bord',
    Kring: 'kring',
    Contactdoos: 'stopcontact',
    Lichtpunt: 'lichtpunt',
    Schakelaars: 'schakelaar',
    Drukknop: 'drukknop',
    'Modulaire schakelaar': 'modulaire',
    Motor: 'motor',
    Omvormer: 'omvormer',
    Batterij: 'batterij',
    Domotica: 'domotica',
    Lichtcircuit: 'lichtcircuit',
    'Warmtepomp/airco': 'airco',
    Zonnepaneel: 'zonnepanelen',
    Transformator: 'trafo',
    Bel: 'bel',
    Microgolfoven: 'microgolf',
    'Elektrische oven': 'oven',
    Kookfornuis: 'kookplaat',
    'EV lader': 'laadpaal',
    Vaatwasmachine: 'vaatwas',
    Droogkast: 'wasmachine',
    Wasmachine: 'wasmachine',
    Ventilator: 'ventilatie',
    Verbruiker: 'vrij',
}
export const KNOWN = Object.keys(MAP)
const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
}
export function decodeEds(text) {
    const s = String(text).trim()
    if (!s.startsWith('EDS')) throw new Error('Dit is geen geldig .eds-bestand.')
    try {
        const bin = atob(s.slice(10))
        return JSON.parse(
            pako.inflate(
                Uint8Array.from(bin, (c) => c.charCodeAt(0)),
                {to: 'string'},
            ),
        )
    } catch (e) {
        throw new Error('Het .eds-bestand kon niet gelezen worden.')
    }
}
function conv(r) {
    const q = r.props,
        type = MAP[q.type] || 'vrij',
        n = {id: 'e' + r.id, type, label: '', info: '', children: []}
    if (type === 'kring') {
        n.label = q.naam || ''
        n.p = {
            polen: num(q.aantal_polen) || 2,
            amp: num(q.amperage),
            curve: q.curve_automaat || '',
            kabel: q.type_kabel || '',
            kortsl: q.kortsluitvermogen || '',
            tekst: q.tekst || '',
            bescherming: q.bescherming || 'automatisch',
            nr: q.nr || '',
        }
        n.info = infoOf(n.p)
    } else if (type === 'aansluiting') {
        n.label = 'Aansluiting net'
        n.p = {
            teller: q.met_teller !== false,
            polen: num(q.aantal_polen) || 2,
            amp: num(q.amperage),
            bescherming: ['differentieel', 'automatisch'].includes(q.bescherming) ? q.bescherming : 'geen',
            delta: num(q.differentieel_delta_amperage),
            diffType: q.type_differentieel || '',
            kabel: q.type_kabel_na_teller || '',
            kortsl: q.kortsluitvermogen || '',
        }
    } else if (type === 'bord') {
        n.label = q.naam || 'Verdeelbord'
        n.p = {geaard: !!q.is_geaard, nr: q.nr || ''}
    } else {
        n.label = q.tekst || q.adres || (type === 'vrij' ? q.type : '')
        n.p = {aantal: num(q.aantal ?? q.aantal_schakelaars) || 1, nr: q.nr || '', details: q.details || ''}
    }
    return n
}
const count = (ns) => ns.reduce((a, n) => a + 1 + count(n.children), 0)
export function edsToProject(j) {
    const rows = (j.data || []).filter((r) => r && r.props && r.props.type),
        by = new Map(),
        tree = []
    rows.forEach((r) => by.set(r.id, conv(r)))
    rows.forEach((r) => {
        const n = by.get(r.id),
            par = by.get(r.parent)
        if (par) par.children.push(n)
        else if (!r.parent) tree.push(n)
    })
    const MAIN = ['aansluiting', 'teller', 'hoofdschakelaar', 'diff'],
        fix = (n, anc) => {
            if (n.type === 'bord' && anc.some((a) => !MAIN.includes(a.type))) n.type = 'subbord'
            n.children.forEach((c) => fix(c, [...anc, n]))
        }
    tree.forEach((n) => fix(n, []))
    const pr = j.properties || {},
        lines = String(pr.owner || '')
            .split(/<br\s*\/?>/i)
            .map((s) => s.trim())
            .filter(Boolean),
        footer = {}
    if (lines[0]) footer.eigenaar = lines[0]
    const a = /^(.*?)\s+(\d+\S*)$/.exec(lines[1] || ''),
        c = /^(\d{4})\s+(.+)$/.exec(lines[2] || '')
    if (a) {
        footer.straat = a[1]
        footer.nr = a[2]
    }
    if (c) {
        footer.postcode = c[1]
        footer.gemeente = c[2]
    }
    if (pr.info) footer.stelsel = pr.info
    const unknown = [...new Set(rows.map((r) => r.props.type).filter((t) => !MAP[t]))]
    return {
        een: [{id: uid(), name: 'Blad 1', tree}],
        footer,
        stats: {nodes: count(tree), circuits: rows.filter((r) => r.props.type === 'Kring').length, unknown},
    }
}
export const importEds = (text) => edsToProject(decodeEds(text))