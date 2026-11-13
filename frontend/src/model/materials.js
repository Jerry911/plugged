// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The bill of materials (materiaallijst) of a project, counted from the eendraadschema of every page:
//   - protection: main breaker / main differential of the connection, the breakers, differentials and RCBOs of the circuits, and the separate
//     differential and fuse elements, grouped by everything that makes them a different article (kind, poles, rating, curve, sensitivity,
//     type, breaking capacity);
//   - cables: every cable designation with the circuits that use it (the length is not in the drawing: a column to fill in);
//   - elements: the consumers, switches, sockets, ... by symbol, with their count (Aantal of the element), and how many socket outlets that is;
//   - boards: distribution boards, sub boards, home automation.
// Only the eendraadschema counts: the situatieschema shows the same elements once more.
import {flatten} from './tree.js'
import {parseSpecs} from './rules.js'
import {symbolName, typeOf} from '../symbols/symbolLibrary.js'
import {t} from '../i18n/translate.js'

const BOARD_TYPES = new Set(['bord', 'subbord', 'domotica'])
// separate protective elements in the tree: their specs are in their text (e.g. "2P 40A 30mA type A")
const PROTECTION_ELEMENTS = {diff: 'differentieel', zekering: 'zekering', hoofdschakelaar: 'hoofdschakelaar'}
const KIND_ORDER = ['hoofdschakelaar', 'differentieel', 'differentieelautomaat', 'automatisch', 'zekering']

const countOf = (node) => Math.max(1, Math.round(Number(node.p?.aantal) || 1))
const clean = (value) => (value == null ? '' : String(value).trim())
const numberOrNull = (value) => {
    const number = parseFloat(String(value ?? '').replace(',', '.'))
    return Number.isFinite(number) ? number : null
}

/** One protective device as an article: what tells two articles apart, and how it reads (e.g. "Automaat 2P B16 3 kA"). */
const protectionArticle = ({kind, poles, amp, curve, delta, diffType, kA}) => {
    const parts = [t('materials.kinds.' + kind)]
    if (poles) parts.push(poles + 'P')
    if (curve && amp) parts.push(curve + amp)
    else if (amp) parts.push(amp + 'A')
    if (delta) parts.push(delta + 'mA')
    if (diffType) parts.push(t('materials.diffType', {type: diffType}))
    if (kA) parts.push(kA + ' kA')
    return {key: [kind, poles, amp, curve, delta, diffType, kA].join('|'), description: parts.join(' '), kind, poles, amp, curve, delta, diffType, kA}
}

/** The protective device of a circuit or connection (null for a circuit without protection). */
const protectionOf = (node) => {
    const p = node.p || {}
    if (!p.bescherming) {
        // an older drawing without properties: a circuit is a breaker with its specs in its text (e.g. "B16 2,5mm²"), a connection is unknown
        if (node.type !== 'kring') return null
        const {amp} = parseSpecs(node.info || ''),
            curve = /\b([BCDK])\s*\d{1,3}\b/i.exec(node.info || '')?.[1]?.toUpperCase() || ''
        return protectionArticle({kind: 'automatisch', poles: '', amp: amp ?? '', curve, delta: '', diffType: '', kA: ''})
    }
    const kind = p.bescherming === 'differentieel' ? 'differentieel' : p.bescherming === 'differentieelautomaat' ? 'differentieelautomaat' : p.bescherming === 'geen' ? null : 'automatisch'
    if (!kind) return null
    const differential = kind !== 'automatisch'
    return protectionArticle({
        kind: node.type === 'aansluiting' && kind === 'automatisch' ? 'hoofdschakelaar' : kind,
        poles: clean(p.polen),
        amp: clean(p.amp),
        curve: kind === 'differentieel' ? '' : clean(p.curve).toUpperCase(),
        delta: differential ? clean(p.delta) : '',
        diffType: differential ? clean(p.diffType) : '',
        kA: clean(p.kortsl),
    })
}

/** A separate differential, fuse or main switch element: kind from its type, specs from its text. */
const elementProtectionOf = (node) => {
    const {amp, mA} = parseSpecs(node.info || ''),
        poles = /(\d)\s*P\b/i.exec(node.info || '')?.[1] || '',
        diffType = /type\s*([A-Z]{1,2})\b/i.exec(node.info || '')?.[1]?.toUpperCase() || ''
    return protectionArticle({kind: PROTECTION_ELEMENTS[node.type], poles, amp: amp ?? '', curve: '', delta: mA ?? '', diffType, kA: ''})
}

/**
 * The bill of materials: {protection: [{description, kind, poles, amp, curve, delta, diffType, kA, count, marks}], cables: [{cable, count,
 * marks}], elements: [{type, name, count, outlets}], boards: [{type, name, count}], outlets: total socket outlets, circuits: number of circuits}.
 * `marks` are the circuit letters that use the article (e.g. "A, B, C"). Sorted: protection by kind, the rest by count.
 */
export function billOfMaterials(project) {
    const protection = new Map(),
        cables = new Map(),
        elements = new Map(),
        boards = new Map()
    let outlets = 0,
        circuits = 0
    const addTo = (map, key, create, mark, amount = 1) => {
        const row = map.get(key) || {...create(), count: 0, marks: []}
        row.count += amount
        if (mark && !row.marks.includes(mark)) row.marks.push(mark)
        map.set(key, row)
    }
    for (const page of project.een || []) {
        for (const node of flatten(page.tree)) {
            const mark = node.type === 'kring' ? clean(node.label) : ''
            if (node.type === 'kring' || node.type === 'aansluiting') {
                if (node.type === 'kring') circuits++
                const article = protectionOf(node)
                if (article) addTo(protection, article.key, () => article, mark)
                const cable = clean(node.p?.kabel)
                if (cable) addTo(cables, cable.toLowerCase(), () => ({cable}), mark || t('materials.connection'))
                continue
            }
            if (PROTECTION_ELEMENTS[node.type]) {
                const article = elementProtectionOf(node)
                addTo(protection, article.key, () => article, '', countOf(node))
                continue
            }
            const symbolType = typeOf(project, node.type),
                name = symbolName(symbolType)
            if (BOARD_TYPES.has(node.type)) {
                addTo(boards, node.type, () => ({type: node.type, name}))
                continue
            }
            if (!node.type) continue
            const waterproof = !!node.p?.h,
                key = node.type + (waterproof ? '|h' : ''),
                count = countOf(node),
                perBox = symbolType.sock ? Number(symbolType.sock.n) || 1 : 0
            outlets += count * perBox
            addTo(elements, key, () => ({type: node.type, name: name + (waterproof ? ' (' + t('materials.waterproof') + ')' : ''), outlets: 0}), '', count)
            elements.get(key).outlets += count * perBox
        }
    }
    const byCount = (a, b) => b.count - a.count || String(a.name || a.cable || '').localeCompare(String(b.name || b.cable || ''))
    const finish = (rows) => rows.map((row) => ({...row, marks: row.marks.join(', ')}))
    return {
        protection: finish(
            [...protection.values()].sort(
                (a, b) =>
                    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
                    (numberOrNull(b.amp) ?? 0) - (numberOrNull(a.amp) ?? 0) ||
                    a.description.localeCompare(b.description),
            ),
        ),
        cables: finish([...cables.values()].sort(byCount)),
        elements: finish([...elements.values()].sort(byCount)),
        boards: finish([...boards.values()].sort(byCount)),
        outlets,
        circuits,
    }
}
