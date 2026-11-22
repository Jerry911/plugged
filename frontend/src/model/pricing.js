// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// A price list for the offertes (stored by the server, see backend pricing/PriceListService; edited under Account › Prijzen): what the
// user pays for his articles and how a drawing turns into articles.
//   articles: [{id, code, name, group, unit ('st' | 'm'), price (purchase price excl. VAT), minutes (labour per piece or metre),
//              cable (for a cable: its designation, e.g. "XVB 3G2,5"), protection (for a protective device: kind + "2P B16")}]
//   symbols:  {<symbol type, or type|h for the waterproof one>: {places, parts: [{article, qty}]}}: the articles one element is made of
//             (e.g. a socket: the mechanism and its centre plate). places: how many places of a cover frame it takes (0: none, such as a
//             light point or an appliance; a double socket takes 2).
//   frames:   {h: {1: article, 2: ..., 5: ...}, v: {...}, box: article}: the cover frame for that many places side by side (h) or one
//             above the other (v), and the flush box, one per place. Elements combined on the situatieschema share one frame.
//   labour:   {hourly}, margin (% on the purchase price of the material), vat (21, 6 or 0 = verlegd), validDays, company: {...}.
// The standard price list (newPriceList) has the usual articles without prices: the user fills in what he pays.
import {t} from '../i18n/translate.js'

export const PRICE_LIST_FORMAT = 1
export const ARTICLE_GROUPS = ['mechanism', 'plate', 'frame', 'box', 'point', 'cable', 'protection', 'board', 'other']
export const PROTECTION_KINDS = ['hoofdschakelaar', 'differentieel', 'differentieelautomaat', 'automatisch', 'zekering']
export const MAX_FRAME_PLACES = 5
export const VAT_RATES = [21, 6, 0]

let counter = 0
/** A new id for an article. */
export const newArticleId = () => 'a' + Date.now().toString(36) + (counter++).toString(36)

// the standard articles: [id, group, unit, minutes, extra]
const STANDARD_ARTICLES = [
    ['socket', 'mechanism', 'st', 15],
    ['socketHydro', 'mechanism', 'st', 20],
    ['switch', 'mechanism', 'st', 15],
    ['switch2p', 'mechanism', 'st', 15],
    ['twoWay', 'mechanism', 'st', 15],
    ['twoWayDouble', 'mechanism', 'st', 20],
    ['cross', 'mechanism', 'st', 20],
    ['push', 'mechanism', 'st', 15],
    ['dimmer', 'mechanism', 'st', 20],
    ['motion', 'mechanism', 'st', 20],
    ['data', 'mechanism', 'st', 20],
    ['coax', 'mechanism', 'st', 15],
    ['plateSocket', 'plate', 'st', 0],
    ['rocker', 'plate', 'st', 0],
    ['rockerDouble', 'plate', 'st', 0],
    ['plateData', 'plate', 'st', 0],
    ['frame1', 'frame', 'st', 2],
    ['frame2h', 'frame', 'st', 3],
    ['frame3h', 'frame', 'st', 3],
    ['frame4h', 'frame', 'st', 4],
    ['frame2v', 'frame', 'st', 3],
    ['frame3v', 'frame', 'st', 3],
    ['frame4v', 'frame', 'st', 4],
    ['box', 'box', 'st', 10],
    ['lightPoint', 'point', 'st', 20],
    ['appliancePoint', 'point', 'st', 25],
    ['smokeDetector', 'point', 'st', 15],
    ['chargingStation', 'point', 'st', 120],
    ['xvb3g15', 'cable', 'm', 1, {cable: 'XVB 3G1,5'}],
    ['xvb3g25', 'cable', 'm', 1, {cable: 'XVB 3G2,5'}],
    ['xvb5g25', 'cable', 'm', 1.5, {cable: 'XVB 5G2,5'}],
    ['xvb5g6', 'cable', 'm', 2, {cable: 'XVB 5G6'}],
    ['xvb5g10', 'cable', 'm', 2, {cable: 'XVB 5G10'}],
    ['vob15', 'cable', 'm', 0.5, {cable: 'VOB 1,5'}],
    ['vob25', 'cable', 'm', 0.5, {cable: 'VOB 2,5'}],
    ['breakerB16', 'protection', 'st', 10, {protection: {kind: 'automatisch', match: '2P B16'}}],
    ['breakerB20', 'protection', 'st', 10, {protection: {kind: 'automatisch', match: '2P B20'}}],
    ['breakerC32_4p', 'protection', 'st', 15, {protection: {kind: 'automatisch', match: '4P C32'}}],
    ['diff300', 'protection', 'st', 15, {protection: {kind: 'differentieel', match: '2P 40A 300mA'}}],
    ['diff30', 'protection', 'st', 15, {protection: {kind: 'differentieel', match: '2P 40A 30mA'}}],
    ['diff300_4p', 'protection', 'st', 20, {protection: {kind: 'differentieel', match: '4P 40A 300mA'}}],
    ['mainSwitch', 'protection', 'st', 15, {protection: {kind: 'hoofdschakelaar', match: ''}}],
    ['board', 'board', 'st', 120],
    ['subBoard', 'board', 'st', 90],
]

// the standard articles of the symbols of the library: [symbol type, places, [[article, qty], ...]]
const STANDARD_SYMBOLS = [
    ['stopcontact', 1, [['socket', 1], ['plateSocket', 1]]],
    ['stopcontact_alg', 1, [['socket', 1], ['plateSocket', 1]]],
    ['stopcontact_kid', 1, [['socket', 1], ['plateSocket', 1]]],
    ['stopcontact_pekid', 1, [['socket', 1], ['plateSocket', 1]]],
    ['stopcontact|h', 1, [['socketHydro', 1]]],
    ['stopcontact_pekid|h', 1, [['socketHydro', 1]]],
    ['stopcontact2', 2, [['socket', 2], ['plateSocket', 2]]],
    ['stopcontact3', 3, [['socket', 3], ['plateSocket', 3]]],
    ['schakelaar', 1, [['switch', 1], ['rocker', 1]]],
    ['schakelaar2', 1, [['switch2p', 1], ['rocker', 1]]],
    ['wissel', 1, [['twoWay', 1], ['rocker', 1]]],
    ['wissel2', 1, [['twoWayDouble', 1], ['rockerDouble', 1]]],
    ['kruis', 1, [['cross', 1], ['rocker', 1]]],
    ['drukknop', 1, [['push', 1], ['rocker', 1]]],
    ['dimmer', 1, [['dimmer', 1]]],
    ['beweging', 1, [['motion', 1]]],
    ['data', 1, [['data', 1], ['plateData', 1]]],
    ['tv', 1, [['coax', 1], ['plateData', 1]]],
    ['lichtpunt', 0, [['lightPoint', 1]]],
    ['wandlamp', 0, [['lightPoint', 1]]],
    ['spot', 0, [['lightPoint', 1]]],
    ['tl', 0, [['lightPoint', 1]]],
    ['rookmelder', 0, [['smokeDetector', 1]]],
    ['kookplaat', 0, [['appliancePoint', 1]]],
    ['oven', 0, [['appliancePoint', 1]]],
    ['wasmachine', 0, [['appliancePoint', 1]]],
    ['droogkast', 0, [['appliancePoint', 1]]],
    ['vaatwas', 0, [['appliancePoint', 1]]],
    ['boiler', 0, [['appliancePoint', 1]]],
    ['microgolf', 0, [['appliancePoint', 1]]],
    ['verwarming', 0, [['appliancePoint', 1]]],
    ['airco', 0, [['appliancePoint', 1]]],
    ['ventilatie', 0, [['appliancePoint', 1]]],
    ['laadpaal', 0, [['chargingStation', 1]]],
    ['bord', 0, [['board', 1]]],
    ['subbord', 0, [['subBoard', 1]]],
]

/** The standard price list in the current language: the usual articles and how the usual symbols are made of them, without prices. */
export function newPriceList() {
    const articles = STANDARD_ARTICLES.map(([id, group, unit, minutes, extra]) => ({id, code: '', name: t('pricing.standard.' + id), group, unit, price: null, minutes, ...extra}))
    return {
        format: PRICE_LIST_FORMAT,
        articles,
        symbols: Object.fromEntries(STANDARD_SYMBOLS.map(([type, places, parts]) => [type, {places, parts: parts.map(([article, qty]) => ({article, qty}))}])),
        frames: {h: {1: 'frame1', 2: 'frame2h', 3: 'frame3h', 4: 'frame4h'}, v: {1: 'frame1', 2: 'frame2v', 3: 'frame3v', 4: 'frame4v'}, box: 'box'},
        labour: {hourly: null},
        margin: 0,
        vat: 21,
        validDays: 30,
        company: {},
    }
}

/** A price list as stored, completed with what an older or partial one lacks. */
export function normalizePriceList(document) {
    const list = document && typeof document === 'object' ? document : {}
    return {
        format: PRICE_LIST_FORMAT,
        articles: Array.isArray(list.articles) ? list.articles.filter((article) => article && article.id) : [],
        symbols: list.symbols && typeof list.symbols === 'object' ? list.symbols : {},
        frames: {h: {...list.frames?.h}, v: {...list.frames?.v}, box: list.frames?.box || ''},
        labour: {hourly: list.labour?.hourly ?? null},
        margin: Number(list.margin) || 0,
        vat: VAT_RATES.includes(Number(list.vat)) ? Number(list.vat) : 21,
        validDays: Number(list.validDays) > 0 ? Number(list.validDays) : 30,
        company: list.company && typeof list.company === 'object' ? list.company : {},
    }
}

/** A number typed by the user ("12,50" or "12.50"), or null when it is empty or not a number. */
export const amountOf = (value) => {
    if (value == null || value === '') return null
    const number = typeof value === 'number' ? value : parseFloat(String(value).replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(number) ? number : null
}

/** A cable designation in one form, to compare: "XVB-F2 3G2.5 mm²" and "xvb 3g2,5" are both "XVB3G2,5" (the F2 is the fire class). */
export const cableKey = (designation) =>
    String(designation || '')
        .toUpperCase()
        .replace(/MM²|MM2/g, '')
        .replace(/-F2\b|-CCA\b|\bCCA\b|\bF2\b/g, '')
        .replace(/\./g, ',')
        .replace(/[×X](?=\d)/g, 'X')
        .replace(/\s+/g, '')

/** The specs of a protective device in a text such as "2P B16", "4P 40A 300mA type A" or "2P 40A 30mA A 6kA". */
export function protectionSpecs(text) {
    const value = String(text || ''),
        specs = {}
    const poles = /(\d)\s*P\b/i.exec(value)
    if (poles) specs.poles = poles[1]
    const curve = /\b([BCDK])\s*(\d{1,3})\b/i.exec(value)
    if (curve) {
        specs.curve = curve[1].toUpperCase()
        specs.amp = curve[2]
    }
    const amp = /\b(\d{1,3})\s*A\b(?!C)/i.exec(value.replace(/\d+\s*mA/gi, ''))
    if (amp && !specs.amp) specs.amp = amp[1]
    const delta = /(\d{1,4})\s*mA\b/i.exec(value)
    if (delta) specs.delta = delta[1]
    const type = /type\s*(AC|A|B|F)\b/i.exec(value) || /mA\s+(AC|A|B|F)\b/i.exec(value)
    if (type) specs.diffType = type[1].toUpperCase()
    const kA = /(\d+(?:[.,]\d+)?)\s*kA\b/i.exec(value)
    if (kA) specs.kA = kA[1].replace(',', '.')
    return specs
}

/** Does the protective device of the materiaallijst (a row of billOfMaterials().protection) match the article: its kind and every spec it names. */
export function protectionMatches(article, device) {
    if (!article.protection || article.protection.kind !== device.kind) return false
    const specs = protectionSpecs(article.protection.match)
    const same = (key) => specs[key] == null || String(device[key] ?? '').toUpperCase().replace(',', '.') === String(specs[key]).toUpperCase()
    return ['poles', 'curve', 'amp', 'delta', 'diffType', 'kA'].every(same)
}
