// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Import of files exported by https://eendraadschema.goethals-jacobs.be/ (.eds = "EDS004" header + base64(zlib(JSON))).
// Lights (type_lamp, is_wandlamp, type_noodverlichting) and switches (type_schakelaar, heeft_verklikkerlampje) choose their symbol from their options.
// Only the eendraadschema (circuits, elements) and the owner/address footer are imported; the situatieschema (sitplanjson) is ignored.
import pako from 'pako'
import {infoOf} from './boardModel.jsx'
import {uid} from './util.jsx'

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
// A Contactdoos is one EDS type but several symbols in the library: the symbol follows its options (is_geaard, is_kinderveilig,
// is_halfwaterdicht). The number of sockets is NOT part of the symbol key (stopcontact2/3 would multiply it): it stays in p.aantal.
// Missing options default like the eendraadschema does: earthed, no child protection.
// There is no symbol for 'waterproof + child protection' (nor for waterproof without earth): there the earth/child options win.
export const socketKey = (q = {}) => {
    const pe = q.is_geaard !== false,
        kid = q.is_kinderveilig === true
    if (q.is_halfwaterdicht === true && pe && !kid) return 'stopcontact_h'
    if (pe && kid) return 'stopcontact_pekid'
    if (kid) return 'stopcontact_kid'
    return pe ? 'stopcontact' : 'stopcontact_alg'
}
// A Lichtpunt is one EDS type but several symbols: the symbol follows type_lamp (TL / spot / led / standaard), then the emergency option and the
// wall-lamp option (is_wandlamp). The shape of the fitting (TL, spot, led) wins over the extras, because there is no symbol for e.g. 'wall-mounted led'.
// The number of tubes of a TL (aantal_buizen_indien_TL) is not part of the symbol.
export const lampKey = (q = {}) => {
    const t = String(q.type_lamp || '').toLowerCase()
    if (t === 'tl') return 'tl'
    if (t === 'spot') return 'spot'
    if (t === 'led') return 'led'
    if (['centraal', 'decentraal'].includes(String(q.type_noodverlichting || '').toLowerCase())) return 'noodlicht'
    return q.is_wandlamp === true ? 'wandlamp' : 'lichtpunt'
}
// A Schakelaars element is one EDS type but many symbols: the symbol follows type_schakelaar. Returns null for a variant without a symbol
// (the caller falls back on the simple switch and reports it). The names are matched loosely, so 'wissel_enkel' and 'wissel' are the same.
const SWITCHES = [
    [/rolluik/, 'rolluik'],
    [/beweging|detect/, 'beweging'],
    [/dubbelaansteking|dubbele_aansteking|omschakel/, 'omschakelaar'],
    [/kruis/, 'kruis'],
    [/wissel.*dubbel|dubbel.*wissel/, 'wissel2'],
    [/wissel.*dim|dim.*wissel|schemer|minuterie|tijd|relais|teleruptor|trek/, null],
    [/wissel/, 'wissel'],
    [/dim/, 'dimmer'],
    [/drie|trippel|3/, 'schakelaar3'],
    [/dubbelpolig|tweepolig|dubbel/, 'schakelaar2'],
    [/enkel|^$/, 'schakelaar'],
]
export const switchKey = (q = {}) => {
    const t = String(q.type_schakelaar || '').toLowerCase(),
        hit = SWITCHES.find(([re]) => re.test(t))
    const k = hit ? hit[1] : null
    // one symbol has the signal lamp: it replaces the plain single/double pole switch
    if ((k === 'schakelaar' || k === 'schakelaar2') && (q.heeft_verklikkerlampje === true || q.heeft_signalisatielampje === true)) return 'verklikker'
    return k
}
// A Modulaire schakelaar follows module_type; the time switch is the existing 'klok' symbol. Unknown module types stay the generic 'modulaire'.
export const moduleKey = (q = {}) => {
    const t = String(q.module_type || '').toLowerCase()
    if (/telerupt/.test(t)) return 'teleruptor'
    if (/dim/.test(t)) return 'dimmermodule'
    if (/relais/.test(t)) return 'relais'
    if (/minuterie|trap/.test(t)) return 'minuterie'
    if (/tijd|klok/.test(t)) return 'klok'
    return 'modulaire'
}
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
        type =
            q.type === 'Contactdoos'
                ? socketKey(q)
                : q.type === 'Lichtpunt'
                  ? lampKey(q)
                  : q.type === 'Schakelaars'
                    ? switchKey(q) || 'schakelaar'
                    : q.type === 'Modulaire schakelaar'
                      ? moduleKey(q)
                    : MAP[q.type] || 'vrij',
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
    // switches whose variant has no symbol (yet) are imported as a simple switch: say so
    const approx = rows.filter((r) => r.props.type === 'Schakelaars' && !switchKey(r.props)).map((r) => `Schakelaars: ${r.props.type_schakelaar}`),
        unknown = [...new Set([...rows.map((r) => r.props.type).filter((t) => !MAP[t]), ...approx])]
    return {
        een: [{id: uid(), name: 'Blad 1', tree}],
        footer,
        stats: {nodes: count(tree), circuits: rows.filter((r) => r.props.type === 'Kring').length, unknown},
    }
}
export const importEds = (text) => edsToProject(decodeEds(text))