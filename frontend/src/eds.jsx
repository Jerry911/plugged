// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Import of files exported by https://eendraadschema.goethals-jacobs.be/ (.eds = "EDS004" header + base64(zlib(JSON))).
// Lights (type_lamp, is_wandlamp, type_noodverlichting) and switches (type_schakelaar, heeft_verklikkerlampje) choose their symbol from their options.
// Only the eendraadschema (circuits, elements) and the owner/address footer are imported; the situatieschema (sitplanjson) is ignored.
import pako from 'pako'
import {detailLines, infoOf, isDiffCircuit, plaatsingOf} from './boardModel.jsx'
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
    Droogkast: 'droogkast',
    Wasmachine: 'wasmachine',
    Ventilator: 'ventilatie',
    Verbruiker: 'vrij',
}
export const KNOWN = Object.keys(MAP)
// A Contactdoos is one EDS type but several symbols in the library: the symbol follows its options (is_geaard, is_kinderveilig,
// is_halfwaterdicht, as p.h). The number of sockets is NOT part of the symbol key (stopcontact2/3 would multiply it): it stays in p.aantal.
// Missing options default like the eendraadschema does: earthed, no child protection.
// Waterproof (is_halfwaterdicht) is not part of the symbol key: it becomes the property p.h of the socket, which draws the small 'h' next to any socket.
export const socketKey = (q = {}) => {
    const pe = q.is_geaard !== false,
        kid = q.is_kinderveilig === true
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
                    : q.type === 'Lichtcircuit'
                      ? (q.type_schakelaar && switchKey(q)) || 'lichtcircuit'
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
            // Plaatsing of the cable: ondergronds / luchtleiding / in wand / op wand, optionally in a conduit
            plaatsing: plaatsingOf(q.kabel_locatie),
            inbuis: q.kabel_is_in_buis === true || /^(true|1|ja)$/i.test(String(q.kabel_is_in_buis ?? '')),
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
        // Brand, type, serial number, Pmax, Umax, ... (inverter, solar panels, battery): the eendraadschema separates the entries with '|',
        // here they become one line each (shown under the symbol and editable as lines in the properties).
        // An element without such details but with a '|' or new line in its text (an EV charger: 'EVW C8R W | SN: 6220020754') keeps that as details.
        let det = detailLines(q.details)
        if (!det.length && /[|\n]/.test(n.label)) {
            det = detailLines(n.label)
            n.label = ''
        }
        n.p = {aantal: num(q.aantal ?? q.aantal_schakelaars) || 1, nr: q.nr || '', details: det.join('\n')}
        if (q.type === 'Contactdoos' && q.is_halfwaterdicht === true) n.p.h = true
    }
    // A Lichtcircuit is a switch with its lights in one element (aantal_lichtpunten): with a known switch type it becomes that switch
    // with the lights as a child, so the switch has its own symbol and still operates its lights.
    if (q.type === 'Lichtcircuit' && type !== 'lichtcircuit')
        n.children.push({id: n.id + 'l', type: 'lichtpunt', label: '', info: '', children: [], p: {aantal: num(q.aantal_lichtpunten) || 1, nr: '', details: ''}})
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
    // A differential circuit of the EDS (a Kring with protection 'differentieel' or 'differentieelautomaat', with something under it) is a Differentieel:
    // name, specs (info and properties) and cable stay, and a board under it becomes a sub board (unless the differential sits in the main line,
    // directly under the aansluiting, meter or main switch: then the board under it is the main board).
    const props = new Map(rows.map((r) => [by.get(r.id), r.props])),
        diffs = (n, parent) => {
            n.children.forEach((c) => diffs(c, n))
            const q = props.get(n)
            if (n.type !== 'kring' || !['differentieel', 'differentieelautomaat'].includes(n.p.bescherming) || !n.children.length) return
            const o = n.p,
                breaker = q.bescherming === 'differentieelautomaat' && o.curve && o.amp ? o.curve + o.amp : o.amp ? o.amp + 'A' : ''
            n.type = 'diff'
            n.info = [o.polen + 'P', breaker, num(q.differentieel_delta_amperage) ? num(q.differentieel_delta_amperage) + 'mA' : '', q.type_differentieel ? 'type ' + q.type_differentieel : ''].filter(Boolean).join(' ')
            // the specs are kept as properties: the diagram writes them on separate lines, like the differentieel of the aansluiting
            n.p = {polen: o.polen, amp: o.amp, curve: q.bescherming === 'differentieelautomaat' ? o.curve : '', delta: num(q.differentieel_delta_amperage), diffType: q.type_differentieel || '', kabel: o.kabel, plaatsing: o.plaatsing, inbuis: o.inbuis, kortsl: o.kortsl, tekst: o.tekst, nr: o.nr}
            if (!['aansluiting', 'teller', 'hoofdschakelaar'].includes(parent?.type)) n.children.forEach((c) => c.type === 'bord' && (c.type = 'subbord'))
        }
    tree.forEach((n) => diffs(n, null))
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
// ---- Export: the inverse of the import above. Writes the eendraadschema (all pages, one after the other) and the owner/address of the footer;
// the situatieschema is not exported. Symbols with no EDS equivalent become a 'Verbruiker' with their name as text and are reported.
const LAMPS = {
    lichtpunt: {type_lamp: 'standaard'},
    tl: {type_lamp: 'TL'},
    spot: {type_lamp: 'spot'},
    led: {type_lamp: 'led'},
    wandlamp: {type_lamp: 'standaard', is_wandlamp: true},
    noodlicht: {type_lamp: 'standaard', type_noodverlichting: 'Centraal'},
}
const SWITCHES_OUT = {
    schakelaar: 'enkelpolig',
    schakelaar2: 'dubbelpolig',
    schakelaar3: 'driepolig',
    verklikker: 'enkelpolig',
    wissel: 'wissel_enkel',
    wissel2: 'wissel_dubbel',
    omschakelaar: 'dubbelaansteking',
    kruis: 'kruis_enkel',
    dimmer: 'dimschakelaar',
    rolluik: 'rolluikschakelaar',
    beweging: 'bewegingsschakelaar',
}
const MODULES_OUT = {modulaire: '', teleruptor: 'teleruptor', dimmermodule: 'dimmer', relais: 'relais', minuterie: 'minuterie', klok: 'tijdschakelaar'}
// elements that the EDS keeps inside the Aansluiting (meter, main switch, residual-current device): they disappear, their children move up
const MERGED = new Set(['teller', 'hoofdschakelaar', 'diff', 'zekering', 'leeg'])
const BACK = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [v, k]))
const SOCKETS = {
    stopcontact: {is_geaard: true, is_kinderveilig: false},
    stopcontact2: {is_geaard: true, is_kinderveilig: false, aantal: 2},
    stopcontact3: {is_geaard: true, is_kinderveilig: false, aantal: 3},
    stopcontact_alg: {is_geaard: false, is_kinderveilig: false},
    stopcontact_kid: {is_geaard: false, is_kinderveilig: true},
    stopcontact_pekid: {is_geaard: true, is_kinderveilig: true},
}
// EDS types that have a field of their own for the details (brand, type, serial number, ...); elsewhere they follow the text after a '|'
const HAS_DETAILS = new Set(['Aansluiting', 'Omvormer', 'Zonnepaneel', 'Batterij'])
// EDS types where the free text is called 'tekst' instead of 'adres'
const HAS_TEKST = new Set(['Domotica', 'Verbruiker'])
const COUNTED = new Set(['Contactdoos', 'Drukknop', 'Lichtpunt', 'Warmtepomp/airco', 'Zonnepaneel'])
const VERBRUIKER = {horizontale_uitlijning: 'centreer', heeft_automatische_breedte: 'automatisch', breedte: '70', is_vet: false, is_cursief: false}
const str = (v, d = '') => (v === undefined || v === null || v === '' ? d : String(v))
// the EDS type of a node (null = no equivalent) and the options that go with it
export const edsTypeOf = (k) =>
    k in SOCKETS ? 'Contactdoos' : k in LAMPS ? 'Lichtpunt' : k in SWITCHES_OUT ? 'Schakelaars' : k in MODULES_OUT ? 'Modulaire schakelaar' : k === 'subbord' ? 'Bord' : BACK[k] || null
const KABEL_LOCATIE = {ondergronds: 'Ondergronds', luchtleiding: 'Luchtleiding', inwand: 'In wand', opwand: 'Op wand'}
function propsOf(n, names) {
    const q = n.p || {},
        k = n.type,
        t = edsTypeOf(k),
        lab = n.label || '',
        det = detailLines(q.details),
        base = {nr: str(q.nr), autonr: 'auto', autoKringNaam: 'auto'}
    if (t === 'Kring')
        return {
            ...base,
            type: t,
            aantal_polen: str(q.polen, '2'),
            bescherming: q.bescherming || 'automatisch',
            amperage: str(q.amp),
            type_kabel: str(q.kabel),
            differentieel_delta_amperage: '300',
            tekst: str(q.tekst),
            kabel_locatie: KABEL_LOCATIE[q.plaatsing] || 'N/A',
            type_differentieel: 'A',
            curve_automaat: str(q.curve),
            kabel_is_in_buis: !!q.inbuis && q.plaatsing !== 'luchtleiding',
            differentieel_is_selectief: false,
            kortsluitvermogen: str(q.kortsl),
            huishoudelijk: true,
            fase: '',
            normaalGesloten: false,
            sturing: '',
            adres: '',
            newPage: false,
            kabel_is_aanwezig: true,
            naam: lab,
        }
    if (t === 'Aansluiting')
        return {
            ...base,
            type: t,
            met_teller: q.teller !== false,
            aantal_polen: q.polen ?? 2,
            bescherming: q.bescherming || 'geen',
            amperage: q.amp ?? '',
            type_kabel_na_teller: str(q.kabel),
            differentieel_delta_amperage: q.delta ?? 300,
            adres: '',
            type_differentieel: str(q.diffType, 'A'),
            curve_automaat: 'C',
            differentieel_is_selectief: false,
            kortsluitvermogen: str(q.kortsl),
            naam: lab === 'Aansluiting net' ? '' : lab,
            type_kabel_voor_teller: '',
            huishoudelijk: true,
            fase: '',
            normaalGesloten: false,
            newPage: false,
            kabel_locatie: 'N/A',
            kabel_is_in_buis: false,
            details: det.join('|'),
        }
    if (t === 'Bord') return {...base, type: t, is_geaard: q.geaard !== false, naam: lab === 'Verdeelbord' ? '' : lab, adres: ''}
    // the free text: where the EDS has no field for the details they follow the text, separated by '|' (the import splits them again)
    const free = HAS_DETAILS.has(t) ? lab : [lab, ...det].filter(Boolean).join(' | '),
        o = {...base, type: t || 'Verbruiker'},
        n1 = Math.max(1, Math.round(Number(q.aantal)) || 1)
    if (!t) {
        // no EDS equivalent: a free consumer named after the symbol
        return {...o, tekst: [lab || names[k] || k, ...det].join(' | '), ...VERBRUIKER, adres: ''}
    }
    if (HAS_TEKST.has(t)) Object.assign(o, {tekst: free, adres: ''})
    else o.adres = free
    if (t === 'Verbruiker') Object.assign(o, VERBRUIKER)
    if (COUNTED.has(t)) o.aantal = String(SOCKETS[k]?.aantal && n1 < SOCKETS[k].aantal ? SOCKETS[k].aantal : n1)
    if (t === 'Contactdoos')
        Object.assign(o, {
            is_geaard: SOCKETS[k].is_geaard,
            is_kinderveilig: SOCKETS[k].is_kinderveilig,
            aantal_fases_indien_meerfasig: '3',
            heeft_ingebouwde_schakelaar: false,
            is_halfwaterdicht: !!q.h,
            is_meerfasig: false,
            heeft_nul_indien_meerfasig: false,
            in_verdeelbord: false,
        })
    if (t === 'Lichtpunt')
        Object.assign(o, {aantal_buizen_indien_TL: '1', type_noodverlichting: 'Geen', is_wandlamp: false, is_halfwaterdicht: !!q.h, heeft_ingebouwde_schakelaar: false}, LAMPS[k])
    if (t === 'Schakelaars' || k === 'lichtcircuit')
        Object.assign(o, {
            aantal_schakelaars: String(n1),
            type_schakelaar: SWITCHES_OUT[k] || 'enkelpolig',
            heeft_signalisatielampje: false,
            is_halfwaterdicht: !!q.h,
            vertraagde_opening: false,
            heeft_verklikkerlampje: k === 'verklikker',
            is_trekschakelaar: false,
            normaalGesloten: false,
            sturing: '',
            in_verdeelbord: false,
        })
    if (t === 'Lichtcircuit') o.aantal_lichtpunten = String(n1)
    if (t === 'Drukknop') Object.assign(o, {aantal_knoppen_per_armatuur: '1', type_knop: 'standaard', is_afgeschermd: false, is_halfwaterdicht: false, heeft_verklikkerlampje: false})
    if (t === 'Modulaire schakelaar') o.module_type = MODULES_OUT[k]
    if (t === 'Transformator') o.voltage = '230V/24V'
    if (t === 'Warmtepomp/airco') o.warmtefunctie = 'Verwarmend en koelend'
    if (t === 'Ventilator') o.ventilatortype = 'ventilator'
    if (t === 'Kookfornuis') Object.assign(o, {aantal_fases_indien_meerfasig: '3', is_meerfasig: false, heeft_nul_indien_meerfasig: false})
    if (t === 'Omvormer') Object.assign(o, {inkring: false, micro: false, type_ingang: 'AC', type_uitgang: 'DC', tekst: ''})
    if (t === 'Zonnepaneel') o.symbool = 'driehoek'
    if (t === 'Batterij') o.symbool = 'standaard'
    if (HAS_DETAILS.has(t)) o.details = det.join('|')
    return o
}
// {eigenaar, straat, nr, postcode, gemeente, stelsel} of the footer as the owner/info of the EDS (the lines are separated by <br>)
const ownerOf = (f = {}) =>
    [f.eigenaar, [f.straat, f.nr].filter(Boolean).join(' '), [f.postcode, f.gemeente].filter(Boolean).join(' ')].filter(Boolean).join('<br>')
// A differentieel that is a circuit of its own (isDiffCircuit) is a circuit of the EDS: a Kring with protection 'differentieel', or
// 'differentieelautomaat' when its specs name a breaker curve, e.g. 'C40'. Its specs come from its properties, else from the info ('2P C40 30mA type A').
// Any other differentieel (one that groups circuits, or sits in the main line) is part of the Aansluiting (MERGED).
const feedsBoards = isDiffCircuit
const diffCircuit = (n) => {
    const i = n.info || '',
        curve = /\b([BCDK])\s*(\d{1,3})\b/i.exec(i),
        pick = (re) => (re.exec(i) || [])[1],
        q = n.p || {},
        letter = q.curve || (curve ? curve[1].toUpperCase() : '')
    return {
        k: {...n, type: 'kring', p: {...q, polen: q.polen || pick(/(\d)\s*P\b/i) || 2, amp: q.amp || (curve ? curve[2] : pick(/(\d{1,3})\s*A\b/i)), curve: letter, bescherming: letter ? 'differentieelautomaat' : 'differentieel'}},
        delta: String(q.delta || pick(/(\d+)\s*mA/i) || '30'),
        type: q.diffType || pick(/type\s*(\w+)/i) || 'A',
    }
}
export function projectToEds(p, names = {}) {
    const rows = [],
        approx = new Set(),
        walk = (n, parent, indent) => {
            const d = feedsBoards(n) && diffCircuit(n)
            if (MERGED.has(n.type) && !d) return n.children.forEach((c) => walk(c, parent, indent))
            const id = rows.length + 1
            if (!d && !edsTypeOf(n.type)) approx.add(names[n.type] || n.type)
            rows.push({
                id,
                parent,
                indent,
                collapsed: false,
                props: d ? {...propsOf(d.k, names), differentieel_delta_amperage: d.delta, type_differentieel: d.type} : propsOf(n, names),
                sourcelist: null,
            })
            n.children.forEach((c) => walk(c, id, indent + 1))
        }
    p.een.forEach((g) => g.tree.forEach((n) => walk(n, 0, 0)))
    const f = p.footer || {}
    return {
        j: {
            moving_id: null,
            sitplanview: null,
            currentView: '',
            idToOrdinalMap: {},
            length: rows.length,
            data: rows,
            active: rows.map(() => true),
            id: rows.map((r) => r.id),
            print_table: {
                height: 1148,
                maxwidth: 1983,
                displaypage: 0,
                orientation: 'landscape',
                enableAutopage: true,
                printPageMode: 'all',
                printPageRange: '',
                pages: [{height: 1148, start: 0, stop: 1983, info: f.stelsel || ''}],
                pagemarkers: {markers: []},
                modevertical: 'alles',
                starty: 0,
                stopy: 1148,
                papersize: 'A4',
            },
            properties: {
                filename: (f.titel || 'eendraadschema') + '.eds',
                owner: ownerOf(f),
                installer: '',
                control: '',
                dpi: 300,
                orientation: 'landscape',
                info: f.stelsel || '',
                currentView: null,
                legacySchakelaars: false,
            },
            curid: rows.length + 1,
            mode: 'edit',
            sitplan: null,
            sitplanjson: {numPages: 1, activePage: 1, defaults: {fontsize: 11, scale: 0.7, rotate: 0}, elements: []},
        },
        stats: {nodes: rows.length, circuits: rows.filter((r) => r.props.type === 'Kring').length, approx: [...approx]},
    }
}
// "EDS004" + "0000" + base64(zlib(JSON)), the format that decodeEds reads (and the online tool opens)
export function encodeEds(j) {
    const z = pako.deflate(JSON.stringify(j))
    let bin = ''
    for (let i = 0; i < z.length; i += 0x8000) bin += String.fromCharCode.apply(null, z.subarray(i, i + 0x8000))
    return 'EDS0040000' + btoa(bin)
}
export const exportEds = (p, names) => {
    const r = projectToEds(p, names)
    return {text: encodeEds(r.j), stats: r.stats}
}
