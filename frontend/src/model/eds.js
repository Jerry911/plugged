// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Import of files (.eds = "EDS004" header + base64(zlib(JSON))).
// Lights (type_lamp, is_wandlamp, type_noodverlichting) and switches (type_schakelaar, heeft_verklikkerlampje) choose their symbol from their options.
// Only the eendraadschema (circuits, elements) and the owner/address footer are imported; the situatieschema (sitplanjson) is ignored.
import pako from 'pako'
import {circuitInfo, detailLines, isDiffCircuit, placementOf} from './boardLayout.js'
import {newId} from './tree.js'
import {allTranslations, t} from '../i18n/translate.js'

// EDS type -> symbol key of the library
const EDS_TYPE_TO_SYMBOL = {
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
export const KNOWN_EDS_TYPES = Object.keys(EDS_TYPE_TO_SYMBOL)
// A Contactdoos is one EDS type but several symbols in the library: the symbol follows its options (is_geaard, is_kinderveilig,
// is_halfwaterdicht, as p.h). The number of sockets is NOT part of the symbol key (stopcontact2/3 would multiply it): it stays in p.aantal.
// Missing options default like the eendraadschema does: earthed, no child protection.
// Waterproof (is_halfwaterdicht) is not part of the symbol key: it becomes the property p.h of the socket, which draws the small 'h' next to any socket.
export const socketKey = (options = {}) => {
    const earthed = options.is_geaard !== false,
        childSafe = options.is_kinderveilig === true
    if (earthed && childSafe) return 'stopcontact_pekid'
    if (childSafe) return 'stopcontact_kid'
    return earthed ? 'stopcontact' : 'stopcontact_alg'
}
// A Lichtpunt is one EDS type but several symbols: the symbol follows type_lamp (TL / spot / led / standaard), then the emergency option and the
// wall-lamp option (is_wandlamp). The shape of the fitting (TL, spot, led) wins over the extras, because there is no symbol for e.g. 'wall-mounted led'.
// The number of tubes of a TL (aantal_buizen_indien_TL) is not part of the symbol.
export const lampKey = (options = {}) => {
    const lampType = String(options.type_lamp || '').toLowerCase()
    if (lampType === 'tl') return 'tl'
    if (lampType === 'spot') return 'spot'
    if (lampType === 'led') return 'led'
    if (['centraal', 'decentraal'].includes(String(options.type_noodverlichting || '').toLowerCase())) return 'noodlicht'
    return options.is_wandlamp === true ? 'wandlamp' : 'lichtpunt'
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
export const switchKey = (options = {}) => {
    const switchType = String(options.type_schakelaar || '').toLowerCase(),
        match = SWITCHES.find(([pattern]) => pattern.test(switchType))
    const key = match ? match[1] : null
    // one symbol has the signal lamp: it replaces the plain single/double pole switch
    const hasSignalLamp = options.heeft_verklikkerlampje === true || options.heeft_signalisatielampje === true
    if ((key === 'schakelaar' || key === 'schakelaar2') && hasSignalLamp) return 'verklikker'
    return key
}
// A Modulaire schakelaar follows module_type; the time switch is the existing 'klok' symbol. Unknown module types stay the generic 'modulaire'.
export const moduleKey = (options = {}) => {
    const moduleType = String(options.module_type || '').toLowerCase()
    if (/telerupt/.test(moduleType)) return 'teleruptor'
    if (/dim/.test(moduleType)) return 'dimmermodule'
    if (/relais/.test(moduleType)) return 'relais'
    if (/minuterie|trap/.test(moduleType)) return 'minuterie'
    if (/tijd|klok/.test(moduleType)) return 'klok'
    return 'modulaire'
}
// a number written in the file ('2,5', 16, '') or undefined
const toNumber = (value) => {
    const number = parseFloat(String(value ?? '').replace(',', '.'))
    return Number.isFinite(number) ? number : undefined
}
export function decodeEds(text) {
    const content = String(text).trim()
    if (!content.startsWith('EDS')) throw new Error(t('eds.notAnEdsFile'))
    try {
        const binary = atob(content.slice(10))
        return JSON.parse(
            pako.inflate(
                Uint8Array.from(binary, (character) => character.charCodeAt(0)),
                {to: 'string'},
            ),
        )
    } catch {
        throw new Error(t('eds.unreadable'))
    }
}
// The default labels of a new connection and board, in any language: they are not written to the EDS as a name.
const isDefaultLabel = (key, label) => allTranslations(key).includes(label)

// One row of the EDS (props = its options) as an element of the tree (without its children).
function rowToNode(row) {
    const options = row.props,
        type =
            options.type === 'Contactdoos'
                ? socketKey(options)
                : options.type === 'Lichtpunt'
                  ? lampKey(options)
                  : options.type === 'Schakelaars'
                    ? switchKey(options) || 'schakelaar'
                    : options.type === 'Lichtcircuit'
                      ? (options.type_schakelaar && switchKey(options)) || 'lichtcircuit'
                      : options.type === 'Modulaire schakelaar'
                        ? moduleKey(options)
                        : EDS_TYPE_TO_SYMBOL[options.type] || 'vrij',
        node = {id: 'e' + row.id, type, label: '', info: '', children: []}
    if (type === 'kring') {
        node.label = options.naam || ''
        node.p = {
            polen: toNumber(options.aantal_polen) || 2,
            amp: toNumber(options.amperage),
            curve: options.curve_automaat || '',
            kabel: options.type_kabel || '',
            // Plaatsing of the cable: ondergronds / luchtleiding / in wand / op wand, optionally in a conduit
            plaatsing: placementOf(options.kabel_locatie),
            inbuis: options.kabel_is_in_buis === true || /^(true|1|ja)$/i.test(String(options.kabel_is_in_buis ?? '')),
            kortsl: options.kortsluitvermogen || '',
            tekst: options.tekst || '',
            bescherming: options.bescherming || 'automatisch',
            nr: options.nr || '',
        }
        node.info = circuitInfo(node.p)
    } else if (type === 'aansluiting') {
        node.label = t('board.connectionLabel')
        node.p = {
            teller: options.met_teller !== false,
            polen: toNumber(options.aantal_polen) || 2,
            amp: toNumber(options.amperage),
            bescherming: ['differentieel', 'automatisch'].includes(options.bescherming) ? options.bescherming : 'geen',
            delta: toNumber(options.differentieel_delta_amperage),
            diffType: options.type_differentieel || '',
            kabel: options.type_kabel_na_teller || '',
            kortsl: options.kortsluitvermogen || '',
        }
    } else if (type === 'bord') {
        node.label = options.naam || t('board.boardLabel')
        node.p = {geaard: !!options.is_geaard, nr: options.nr || ''}
    } else {
        node.label = options.tekst || options.adres || (type === 'vrij' ? options.type : '')
        // Brand, type, serial number, Pmax, Umax, ... (inverter, solar panels, battery): the eendraadschema separates the entries with '|',
        // here they become one line each (shown under the symbol and editable as lines in the properties).
        // An element without such details but with a '|' or new line in its text (an EV charger: 'EVW C8R W | SN: 6220020754') keeps that as details.
        let details = detailLines(options.details)
        if (!details.length && /[|\n]/.test(node.label)) {
            details = detailLines(node.label)
            node.label = ''
        }
        node.p = {aantal: toNumber(options.aantal ?? options.aantal_schakelaars) || 1, nr: options.nr || '', details: details.join('\n')}
        if (options.type === 'Contactdoos' && options.is_halfwaterdicht === true) node.p.h = true
    }
    // A Lichtcircuit is a switch with its lights in one element (aantal_lichtpunten): with a known switch type it becomes that switch
    // with the lights as a child, so the switch has its own symbol and still operates its lights.
    if (options.type === 'Lichtcircuit' && type !== 'lichtcircuit')
        node.children.push({
            id: node.id + 'l',
            type: 'lichtpunt',
            label: '',
            info: '',
            children: [],
            p: {aantal: toNumber(options.aantal_lichtpunten) || 1, nr: '', details: ''},
        })
    return node
}
const countNodes = (nodes) => nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0)
// the types whose elements stay in the main line: a board under a differentieel there is the main board, not a sub board
const MAIN_LINE_TYPES = ['aansluiting', 'teller', 'hoofdschakelaar']

/** The decoded EDS document as {een: [one page], footer, stats: {nodes, circuits, unknown}}. */
export function edsToProject(document) {
    const rows = (document.data || []).filter((row) => row && row.props && row.props.type),
        nodeOfRow = new Map(),
        tree = []
    rows.forEach((row) => nodeOfRow.set(row.id, rowToNode(row)))
    rows.forEach((row) => {
        const node = nodeOfRow.get(row.id),
            parent = nodeOfRow.get(row.parent)
        if (parent) parent.children.push(node)
        else if (!row.parent) tree.push(node)
    })
    // A differential circuit of the EDS (a Kring with protection 'differentieel' or 'differentieelautomaat', with something under it) is a Differentieel:
    // name, specs (info and properties) and cable stay, and a board under it becomes a sub board (unless the differential sits in the main line,
    // directly under the aansluiting, meter or main switch: then the board under it is the main board).
    const optionsOfNode = new Map(rows.map((row) => [nodeOfRow.get(row.id), row.props])),
        convertDifferentials = (node, parent) => {
            node.children.forEach((child) => convertDifferentials(child, node))
            const options = optionsOfNode.get(node)
            if (node.type !== 'kring' || !['differentieel', 'differentieelautomaat'].includes(node.p.bescherming) || !node.children.length) return
            const circuit = node.p,
                isAutomatic = options.bescherming === 'differentieelautomaat',
                breaker = isAutomatic && circuit.curve && circuit.amp ? circuit.curve + circuit.amp : circuit.amp ? circuit.amp + 'A' : '',
                sensitivity = toNumber(options.differentieel_delta_amperage)
            node.type = 'diff'
            node.info = [circuit.polen + 'P', breaker, sensitivity ? sensitivity + 'mA' : '', options.type_differentieel ? 'type ' + options.type_differentieel : '']
                .filter(Boolean)
                .join(' ')
            // the specs are kept as properties: the diagram writes them on separate lines, like the differentieel of the aansluiting
            node.p = {
                polen: circuit.polen,
                amp: circuit.amp,
                curve: isAutomatic ? circuit.curve : '',
                delta: sensitivity,
                diffType: options.type_differentieel || '',
                kabel: circuit.kabel,
                plaatsing: circuit.plaatsing,
                inbuis: circuit.inbuis,
                kortsl: circuit.kortsl,
                tekst: circuit.tekst,
                nr: circuit.nr,
            }
            if (!MAIN_LINE_TYPES.includes(parent?.type)) node.children.forEach((child) => child.type === 'bord' && (child.type = 'subbord'))
        }
    tree.forEach((node) => convertDifferentials(node, null))
    // a board below anything but the main line is a sub board
    const MAIN_LINE_WITH_DIFFERENTIAL = [...MAIN_LINE_TYPES, 'diff'],
        markSubBoards = (node, ancestors) => {
            if (node.type === 'bord' && ancestors.some((ancestor) => !MAIN_LINE_WITH_DIFFERENTIAL.includes(ancestor.type))) node.type = 'subbord'
            node.children.forEach((child) => markSubBoards(child, [...ancestors, node]))
        }
    tree.forEach((node) => markSubBoards(node, []))
    const properties = document.properties || {},
        ownerLines = String(properties.owner || '')
            .split(/<br\s*\/?>/i)
            .map((line) => line.trim())
            .filter(Boolean),
        footer = {}
    if (ownerLines[0]) footer.eigenaar = ownerLines[0]
    const street = /^(.*?)\s+(\d+\S*)$/.exec(ownerLines[1] || ''),
        town = /^(\d{4})\s+(.+)$/.exec(ownerLines[2] || '')
    if (street) {
        footer.straat = street[1]
        footer.nr = street[2]
    }
    if (town) {
        footer.postcode = town[1]
        footer.gemeente = town[2]
    }
    if (properties.info) footer.stelsel = properties.info
    // switches whose variant has no symbol (yet) are imported as a simple switch: say so
    const approximated = rows
            .filter((row) => row.props.type === 'Schakelaars' && !switchKey(row.props))
            .map((row) => `Schakelaars: ${row.props.type_schakelaar}`),
        unknown = [...new Set([...rows.map((row) => row.props.type).filter((type) => !EDS_TYPE_TO_SYMBOL[type]), ...approximated])]
    return {
        een: [{id: newId(), name: t('pages.sheetName', {number: 1}), tree}],
        footer,
        stats: {nodes: countNodes(tree), circuits: rows.filter((row) => row.props.type === 'Kring').length, unknown},
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
const MERGED_TYPES = new Set(['teller', 'hoofdschakelaar', 'diff', 'zekering', 'leeg'])
const SYMBOL_TO_EDS_TYPE = Object.fromEntries(Object.entries(EDS_TYPE_TO_SYMBOL).map(([edsType, key]) => [key, edsType]))
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
const asText = (value, fallback = '') => (value === undefined || value === null || value === '' ? fallback : String(value))

/** The EDS type of a symbol key (null = no equivalent). */
export const edsTypeOf = (key) =>
    key in SOCKETS
        ? 'Contactdoos'
        : key in LAMPS
          ? 'Lichtpunt'
          : key in SWITCHES_OUT
            ? 'Schakelaars'
            : key in MODULES_OUT
              ? 'Modulaire schakelaar'
              : key === 'subbord'
                ? 'Bord'
                : SYMBOL_TO_EDS_TYPE[key] || null
const CABLE_LOCATIONS = {ondergronds: 'Ondergronds', luchtleiding: 'Luchtleiding', inwand: 'In wand', opwand: 'Op wand'}

// The options (props) of the EDS row of an element. `symbolNames` = key -> name, for the free consumers that replace unknown symbols.
function edsOptionsOf(node, symbolNames) {
    const properties = node.p || {},
        key = node.type,
        edsType = edsTypeOf(key),
        label = node.label || '',
        details = detailLines(properties.details),
        common = {nr: asText(properties.nr), autonr: 'auto', autoKringNaam: 'auto'}
    if (edsType === 'Kring')
        return {
            ...common,
            type: edsType,
            aantal_polen: asText(properties.polen, '2'),
            bescherming: properties.bescherming || 'automatisch',
            amperage: asText(properties.amp),
            type_kabel: asText(properties.kabel),
            differentieel_delta_amperage: '300',
            tekst: asText(properties.tekst),
            kabel_locatie: CABLE_LOCATIONS[properties.plaatsing] || 'N/A',
            type_differentieel: 'A',
            curve_automaat: asText(properties.curve),
            kabel_is_in_buis: !!properties.inbuis && properties.plaatsing !== 'luchtleiding',
            differentieel_is_selectief: false,
            kortsluitvermogen: asText(properties.kortsl),
            huishoudelijk: true,
            fase: '',
            normaalGesloten: false,
            sturing: '',
            adres: '',
            newPage: false,
            kabel_is_aanwezig: true,
            naam: label,
        }
    if (edsType === 'Aansluiting')
        return {
            ...common,
            type: edsType,
            met_teller: properties.teller !== false,
            aantal_polen: properties.polen ?? 2,
            bescherming: properties.bescherming || 'geen',
            amperage: properties.amp ?? '',
            type_kabel_na_teller: asText(properties.kabel),
            differentieel_delta_amperage: properties.delta ?? 300,
            adres: '',
            type_differentieel: asText(properties.diffType, 'A'),
            curve_automaat: 'C',
            differentieel_is_selectief: false,
            kortsluitvermogen: asText(properties.kortsl),
            naam: isDefaultLabel('board.connectionLabel', label) ? '' : label,
            type_kabel_voor_teller: '',
            huishoudelijk: true,
            fase: '',
            normaalGesloten: false,
            newPage: false,
            kabel_locatie: 'N/A',
            kabel_is_in_buis: false,
            details: details.join('|'),
        }
    if (edsType === 'Bord')
        return {...common, type: edsType, is_geaard: properties.geaard !== false, naam: isDefaultLabel('board.boardLabel', label) ? '' : label, adres: ''}
    // the free text: where the EDS has no field for the details they follow the text, separated by '|' (the import splits them again)
    const freeText = HAS_DETAILS.has(edsType) ? label : [label, ...details].filter(Boolean).join(' | '),
        options = {...common, type: edsType || 'Verbruiker'},
        count = Math.max(1, Math.round(Number(properties.aantal)) || 1)
    if (!edsType) {
        // no EDS equivalent: a free consumer named after the symbol
        return {...options, tekst: [label || symbolNames[key] || key, ...details].join(' | '), ...VERBRUIKER, adres: ''}
    }
    if (HAS_TEKST.has(edsType)) Object.assign(options, {tekst: freeText, adres: ''})
    else options.adres = freeText
    if (edsType === 'Verbruiker') Object.assign(options, VERBRUIKER)
    if (COUNTED.has(edsType)) options.aantal = String(SOCKETS[key]?.aantal && count < SOCKETS[key].aantal ? SOCKETS[key].aantal : count)
    if (edsType === 'Contactdoos')
        Object.assign(options, {
            is_geaard: SOCKETS[key].is_geaard,
            is_kinderveilig: SOCKETS[key].is_kinderveilig,
            aantal_fases_indien_meerfasig: '3',
            heeft_ingebouwde_schakelaar: false,
            is_halfwaterdicht: !!properties.h,
            is_meerfasig: false,
            heeft_nul_indien_meerfasig: false,
            in_verdeelbord: false,
        })
    if (edsType === 'Lichtpunt')
        Object.assign(
            options,
            {aantal_buizen_indien_TL: '1', type_noodverlichting: 'Geen', is_wandlamp: false, is_halfwaterdicht: !!properties.h, heeft_ingebouwde_schakelaar: false},
            LAMPS[key],
        )
    if (edsType === 'Schakelaars' || key === 'lichtcircuit')
        Object.assign(options, {
            aantal_schakelaars: String(count),
            type_schakelaar: SWITCHES_OUT[key] || 'enkelpolig',
            heeft_signalisatielampje: false,
            is_halfwaterdicht: !!properties.h,
            vertraagde_opening: false,
            heeft_verklikkerlampje: key === 'verklikker',
            is_trekschakelaar: false,
            normaalGesloten: false,
            sturing: '',
            in_verdeelbord: false,
        })
    if (edsType === 'Lichtcircuit') options.aantal_lichtpunten = String(count)
    if (edsType === 'Drukknop')
        Object.assign(options, {aantal_knoppen_per_armatuur: '1', type_knop: 'standaard', is_afgeschermd: false, is_halfwaterdicht: false, heeft_verklikkerlampje: false})
    if (edsType === 'Modulaire schakelaar') options.module_type = MODULES_OUT[key]
    if (edsType === 'Transformator') options.voltage = '230V/24V'
    if (edsType === 'Warmtepomp/airco') options.warmtefunctie = 'Verwarmend en koelend'
    if (edsType === 'Ventilator') options.ventilatortype = 'ventilator'
    if (edsType === 'Kookfornuis') Object.assign(options, {aantal_fases_indien_meerfasig: '3', is_meerfasig: false, heeft_nul_indien_meerfasig: false})
    if (edsType === 'Omvormer') Object.assign(options, {inkring: false, micro: false, type_ingang: 'AC', type_uitgang: 'DC', tekst: ''})
    if (edsType === 'Zonnepaneel') options.symbool = 'driehoek'
    if (edsType === 'Batterij') options.symbool = 'standaard'
    if (HAS_DETAILS.has(edsType)) options.details = details.join('|')
    return options
}
// {eigenaar, straat, nr, postcode, gemeente} of the footer as the owner of the EDS (the lines are separated by <br>)
const ownerOf = (footer = {}) =>
    [footer.eigenaar, [footer.straat, footer.nr].filter(Boolean).join(' '), [footer.postcode, footer.gemeente].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join('<br>')

// A differentieel that is a circuit of its own (isDiffCircuit) is a circuit of the EDS: a Kring with protection 'differentieel', or
// 'differentieelautomaat' when its specs name a breaker curve, e.g. 'C40'. Its specs come from its properties, else from the info ('2P C40 30mA type A').
// Any other differentieel (one that groups circuits, or sits in the main line) is part of the Aansluiting (MERGED_TYPES).
const differentialAsEdsCircuit = (node) => {
    const info = node.info || '',
        curveMatch = /\b([BCDK])\s*(\d{1,3})\b/i.exec(info),
        pick = (pattern) => (pattern.exec(info) || [])[1],
        properties = node.p || {},
        curve = properties.curve || (curveMatch ? curveMatch[1].toUpperCase() : '')
    return {
        circuit: {
            ...node,
            type: 'kring',
            p: {
                ...properties,
                polen: properties.polen || pick(/(\d)\s*P\b/i) || 2,
                amp: properties.amp || (curveMatch ? curveMatch[2] : pick(/(\d{1,3})\s*A\b/i)),
                curve,
                bescherming: curve ? 'differentieelautomaat' : 'differentieel',
            },
        },
        sensitivity: String(properties.delta || pick(/(\d+)\s*mA/i) || '30'),
        type: properties.diffType || pick(/type\s*(\w+)/i) || 'A',
    }
}

/** The project as an EDS document: {document, stats: {nodes, circuits, approximated: names of the symbols written as a free consumer}}. */
export function projectToEds(project, symbolNames = {}) {
    const rows = [],
        approximated = new Set(),
        walk = (node, parentId, indent) => {
            const differential = isDiffCircuit(node) && differentialAsEdsCircuit(node)
            if (MERGED_TYPES.has(node.type) && !differential) return node.children.forEach((child) => walk(child, parentId, indent))
            const id = rows.length + 1
            if (!differential && !edsTypeOf(node.type)) approximated.add(symbolNames[node.type] || node.type)
            rows.push({
                id,
                parent: parentId,
                indent,
                collapsed: false,
                props: differential
                    ? {
                          ...edsOptionsOf(differential.circuit, symbolNames),
                          differentieel_delta_amperage: differential.sensitivity,
                          type_differentieel: differential.type,
                      }
                    : edsOptionsOf(node, symbolNames),
                sourcelist: null,
            })
            node.children.forEach((child) => walk(child, id, indent + 1))
        }
    project.een.forEach((page) => page.tree.forEach((node) => walk(node, 0, 0)))
    const footer = project.footer || {}
    return {
        document: {
            moving_id: null,
            sitplanview: null,
            currentView: '',
            idToOrdinalMap: {},
            length: rows.length,
            data: rows,
            active: rows.map(() => true),
            id: rows.map((row) => row.id),
            print_table: {
                height: 1148,
                maxwidth: 1983,
                displaypage: 0,
                orientation: 'landscape',
                enableAutopage: true,
                printPageMode: 'all',
                printPageRange: '',
                pages: [{height: 1148, start: 0, stop: 1983, info: footer.stelsel || ''}],
                pagemarkers: {markers: []},
                modevertical: 'alles',
                starty: 0,
                stopy: 1148,
                papersize: 'A4',
            },
            properties: {
                filename: (footer.titel || 'eendraadschema') + '.eds',
                owner: ownerOf(footer),
                installer: '',
                control: '',
                dpi: 300,
                orientation: 'landscape',
                info: footer.stelsel || '',
                currentView: null,
                legacySchakelaars: false,
            },
            curid: rows.length + 1,
            mode: 'edit',
            sitplan: null,
            sitplanjson: {numPages: 1, activePage: 1, defaults: {fontsize: 11, scale: 0.7, rotate: 0}, elements: []},
        },
        stats: {nodes: rows.length, circuits: rows.filter((row) => row.props.type === 'Kring').length, approximated: [...approximated]},
    }
}

/** "EDS004" + "0000" + base64(zlib(JSON)), the format that decodeEds reads (and the online tool opens). */
export function encodeEds(document) {
    const compressed = pako.deflate(JSON.stringify(document))
    let binary = ''
    for (let offset = 0; offset < compressed.length; offset += 0x8000)
        binary += String.fromCharCode.apply(null, compressed.subarray(offset, offset + 0x8000))
    return 'EDS0040000' + btoa(binary)
}

/** The project as the text of an .eds file, with the stats of projectToEds. */
export const exportEds = (project, symbolNames) => {
    const result = projectToEds(project, symbolNames)
    return {text: encodeEds(result.document), stats: result.stats}
}
