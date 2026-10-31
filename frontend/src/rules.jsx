// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Simplified verification of an eendraadschema against common AREI/RGIE requirements.
// Guideline checks only (limits live in LIMITS so they are easy to adjust); NOT a substitute for an inspection by an accredited body.
import {typeOf} from './symbols'
import {allNodes, flat, marksOf, nameOf} from './util.jsx'
import {sheetPlan} from './boardModel.jsx'

export const LIMITS = {maxStop: 8, maxLicht: 8, maxDiffmA: 30, cable: {1.5: 16, 2.5: 20, 4: 25, 6: 32, 10: 50, 16: 63}} // cable: mm² -> max protective rating (A)
const S = (a) => new Set(a)
const STOP = S(['stopcontact', 'stopcontact_alg', 'stopcontact_kid', 'stopcontact_pekid', 'stopcontact2', 'stopcontact3']),
    LIGHT = S(['lichtpunt', 'wandlamp', 'tl', 'spot', 'led', 'noodlicht', 'lichtcircuit']),
    SWITCH = S(['schakelaar', 'schakelaar2', 'schakelaar3', 'verklikker', 'wissel', 'wissel2', 'omschakelaar', 'kruis', 'dimmer', 'beweging'])
// a rolluik switch controls a motor, not a light: it is a control element but not a SWITCH (no 'operates no light' warning)
const CONTROL = S(['schakelaar', 'schakelaar2', 'schakelaar3', 'verklikker', 'wissel', 'wissel2', 'omschakelaar', 'kruis', 'dimmer', 'beweging', 'rolluik', 'drukknop', 'aftakdoos'])
const DEDICATED = S(['kookplaat', 'oven', 'wasmachine', 'droogkast', 'vaatwas', 'boiler', 'airco', 'laadpaal'])
// Protective devices and boards: what hangs behind them belongs to THAT circuit, not to the feeder circuit above it.
const BOUNDARY = S(['kring', 'diff', 'bord', 'subbord', 'zekering'])
// the elements a circuit feeds itself: everything below it, but not what hangs behind a nested breaker, differential or (sub)board.
// A feeder circuit (e.g. one that only feeds a sub board) therefore has no consumers of its own; they are counted on the last circuit.
const ownOf = (ns) => ns.flatMap((n) => (BOUNDARY.has(n.type) ? [] : [n, ...ownOf(n.children)]))
const REQUIRED = {titel: 'titel', gemeente: 'gemeente', eigenaar: 'eigenaar', tekenaar: 'getekend door', datum: 'datum'}
const ORDER = {error: 0, warn: 1, info: 2}
export const parseSpecs = (info = '') => {
    const r = /(?:\b[BCDK]\s*(\d{1,3})\b)|(?:\b(\d{1,3})\s*A\b)/i.exec(info),
        s = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(info) || /\dG(\d+(?:[.,]\d+)?)/i.exec(info),
        m = /(\d+)\s*mA/i.exec(info)
    return {amp: r ? +(r[1] || r[2]) : null, mm2: s ? parseFloat(s[1].replace(',', '.')) : null, mA: m ? +m[1] : null}
}
export const summarize = (is) => ({
    error: is.filter((i) => i.level === 'error').length,
    warn: is.filter((i) => i.level === 'warn').length,
    info: is.filter((i) => i.level === 'info').length,
})
export function verify(p) {
    const out = [],
        marks = marksOf(p)
    // The sheet an element is DRAWN on (a page of the project is laid out over one or more printed sheets, 'Blad 2/6'), worked out
    // once and only when there is something to report. Elements of the head/bus (aansluiting, bord, earth) sit on the first sheet of their page.
    let sheets
    const sheetOf = (pg, n) => {
        if (!sheets) {
            sheets = {byNode: new Map(), first: new Map(), count: new Map()}
            try {
                sheetPlan(p, true)
                    .filter((e) => e.kind === 'een')
                    .forEach((e) => {
                        if (e.sl.first) sheets.first.set(e.pg, e)
                        sheets.count.set(e.pg, (sheets.count.get(e.pg) || 0) + 1)
                        e.b.circuits.slice(e.sl.from, e.sl.to).forEach((c) => flat([c.n]).forEach((x) => sheets.byNode.set(x.id, e)))
                    })
            } catch (e) {
                // layout not possible: fall back on the name of the page
            }
        }
        const e = sheets.byNode.get(n.id) || sheets.first.get(pg)
        return e && {...e, multi: sheets.count.get(pg) > 1}
    }
    const add = (level, rule, msg, pg, n) => {
        const sh = pg && n ? sheetOf(pg, n) : null
        out.push({
            id: rule + ':' + (n ? n.id : 'g' + out.length),
            level,
            rule,
            msg,
            mark: n ? marks.get(n.id) : undefined, // circuit + point as drawn, e.g. 'F6'
            nodeId: n?.id,
            page: pg ? p.een.indexOf(pg) : null,
            sheet: sh ? sh.no : undefined,
            pageName: sh && sh.multi ? `Blad ${sh.no}/${sh.total}` : pg?.name,
        })
    }
    const finish = () =>
        out
            .map((o, i) => [o, i])
            .sort((a, b) => ORDER[a[0].level] - ORDER[b[0].level] || a[1] - b[1])
            .map((x) => x[0])
    const all = p.een.flatMap((g) => flat(g.tree))
    if (!all.length) {
        add('error', 'tree.empty', 'Het eendraadschema is leeg.')
        return finish()
    }
    if (!all.some((n) => n.type === 'aansluiting'))
        add('error', 'tree.noConnection', 'Er is geen aansluiting op het net (aansluiting) in het schema.')
    if (!all.some((n) => n.type === 'aarding' || (n.type === 'bord' && n.p?.geaard)))
        add('error', 'earth', 'Geen aarding (aardingspunt/aardingslus) in het schema.')
    if (!all.some((n) => n.type === 'overspanning'))
        add('info', 'spd', 'Geen overspanningsbeveiliging voorzien: ga na of die vereist of aangewezen is.')
    const names = {}
    all.filter((n) => n.type === 'kring').forEach((n) => {
        const k = (n.label || '').trim().toLowerCase()
        if (k) names[k] = (names[k] || 0) + 1
    })
    const walk = (pg, ns, parent, anc = []) =>
        ns.forEach((n) => {
            const t = typeOf(p, n.type),
                kids = flat(n.children),
                L = n.label || t.name
            if (n.type === 'leeg') add('warn', 'symbol.empty', `Leeg symbool: kies nog een type voor dit element${parent ? ` (onder '${parent.label}')` : ''}.`, pg, n)
            else if (parent ? !t.parents.includes(parent.type) : t.parents.length)
                add(
                    'error',
                    'hierarchy',
                    parent
                        ? `'${L}' (${t.name}) mag niet onder '${parent.label}' (${typeOf(p, parent.type).name}) hangen.`
                        : `'${L}' (${t.name}) kan niet los staan: het moet onder ${t.parents.map((k) => typeOf(p, k).name).join(' of ')} hangen.`,
                    pg,
                    n,
                )
            if (n.type === 'aansluiting' && !n.children.length)
                add('error', 'connection.empty', `Aansluiting '${L}' is niet verbonden met een teller of bord.`, pg, n)
            if (n.type === 'bord' && !n.children.some((c) => ['kring', 'diff', 'zekering', 'bord'].includes(c.type)))
                add('warn', 'bord.empty', `Verdeelbord '${L}' heeft geen kringen of differentiëlen.`, pg, n)
            if (n.type === 'diff') {
                const {mA} = parseSpecs(n.info)
                if (!n.children.length) add('warn', 'diff.empty', `Differentieel '${L}' beveiligt geen enkele kring.`, pg, n)
                if (mA == null) add('warn', 'diff.sens', `Differentieel '${L}': gevoeligheid (bv. 30mA) niet opgegeven.`, pg, n)
                else if (mA > LIMITS.maxDiffmA && kids.some((k) => STOP.has(k.type)))
                    add(
                        'error',
                        'diff.stop',
                        `Differentieel '${L}' (${mA} mA) beveiligt stopcontacten: maximaal ${LIMITS.maxDiffmA} mA vereist.`,
                        pg,
                        n,
                    )
            }
            if (n.type === 'kring') {
                const geen = n.p?.bescherming === 'geen',
                    w = (k) => Number(k.p?.aantal) || 1,
                    {amp, mm2} = parseSpecs(n.info),
                    mine = ownOf(n.children), // only what this circuit feeds itself, not what hangs behind a nested breaker/differential/sub board
                    cons = mine.filter((k) => !CONTROL.has(k.type)),
                    stops = mine.filter((k) => STOP.has(k.type)).length, // a double or triple socket (aantal, stopcontact2/3) counts as one
                    lamps = mine.filter((k) => LIGHT.has(k.type)).reduce((a, k) => a + w(k), 0),
                    ded = cons.filter((k) => DEDICATED.has(k.type))
                if (parent?.type === 'bord' && !anc.some((a) => a.type === 'diff' || a.p?.bescherming === 'differentieel'))
                    add('error', 'kring.noDiff', `Kring '${L}' hangt niet onder een differentieel (aardlekbeveiliging).`, pg, n)
                if (!kids.length) add('warn', 'kring.empty', `Kring '${L}' bevat geen elementen.`, pg, n)
                if (!geen && (amp == null || mm2 == null))
                    add('warn', 'kring.specs', `Kring '${L}': beveiliging en/of kabeldoorsnede ontbreekt (bv. "B16 2,5mm²").`, pg, n)
                else if (!geen && LIMITS.cable[mm2] && amp > LIMITS.cable[mm2])
                    add(
                        'warn',
                        'kring.cable',
                        `Kring '${L}': beveiliging ${amp}A is te hoog voor ${mm2} mm² (max. ${LIMITS.cable[mm2]}A).`,
                        pg,
                        n,
                    )
                if (stops > LIMITS.maxStop)
                    add('warn', 'kring.stop', `Kring '${L}' heeft ${stops} stopcontacten (richtwaarde max. ${LIMITS.maxStop}).`, pg, n)
                if (lamps > LIMITS.maxLicht)
                    add('warn', 'kring.light', `Kring '${L}' heeft ${lamps} lichtpunten (richtwaarde max. ${LIMITS.maxLicht}).`, pg, n)
                if (ded.length && cons.length > 1)
                    add('warn', 'kring.dedicated', `Kring '${L}': '${ded[0].label}' hoort op een eigen kring.`, pg, n)
                if (names[(n.label || '').trim().toLowerCase()] > 1) add('warn', 'kring.duplicate', `Meerdere kringen heten '${L}'.`, pg, n)
            }
            if (SWITCH.has(n.type) && !kids.some((k) => LIGHT.has(k.type)))
                add('warn', 'switch.empty', `Schakelaar '${L}' bedient geen lichtpunt.`, pg, n)
            walk(pg, n.children, n, [...anc, n])
        })
    p.een.forEach((g) => walk(g, g.tree, null))
    const miss = Object.keys(REQUIRED).filter((k) => !(p.footer?.[k] || '').trim())
    if (miss.length) add('warn', 'footer', `Kaderinfo onvolledig: ${miss.map((k) => REQUIRED[k]).join(', ')}.`)
    const placed = new Set(
        p.sit
            .flatMap((g) => g.items)
            .filter((i) => i.kind === 'sym')
            .map((i) => i.node),
    )
    const hid = new Set(p.hidden || []),
        un = allNodes(p).filter((n) => !placed.has(n.id) && !hid.has(n.id)),
        pgOf = (n) => p.een.find((g) => flat(g.tree).includes(n))
    if (un.length > 8)
        add(
            'warn',
            'plan.unplaced',
            `${un.length} componenten staan nog niet op het situatieschema (o.a. ${un
                .slice(0, 3)
                .map((n) => `'${nameOf(p, n)}'`)
                .join(', ')}).`,
            pgOf(un[0]),
            un[0],
        )
    else un.forEach((n) => add('warn', 'plan.unplaced', `'${nameOf(p, n)}' staat niet op het situatieschema.`, pgOf(n), n))
    return finish()
}