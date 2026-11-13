// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Simplified verification of an eendraadschema against common AREI/RGIE requirements.
// Guideline checks only (limits live in LIMITS so they are easy to adjust); NOT a substitute for an inspection by an accredited body.
// The messages are in the active language (translations: verify.rules.*).
import {symbolName, typeOf} from '../symbols/symbolLibrary.js'
import {t} from '../i18n/translate.js'
import {flatten} from './tree.js'
import {circuitMarks, nodeName, placeableNodes} from './project.js'
import {sheetPlan} from './boardLayout.js'
import {EARTH_LIMIT, EARTH_LIMIT_WITH_MEASURES, measuredValue} from './measurements.js'

// cable: mm² -> max protective rating (A)
export const LIMITS = {maxSockets: 8, maxLights: 8, maxDifferentialMilliamps: 30, cable: {1.5: 16, 2.5: 20, 4: 25, 6: 32, 10: 50, 16: 63}}
const SOCKET_TYPES = new Set(['stopcontact', 'stopcontact_alg', 'stopcontact_kid', 'stopcontact_pekid', 'stopcontact2', 'stopcontact3']),
    LIGHT_TYPES = new Set(['lichtpunt', 'wandlamp', 'tl', 'spot', 'led', 'noodlicht', 'lichtcircuit']),
    SWITCH_TYPES = new Set(['schakelaar', 'schakelaar2', 'schakelaar3', 'verklikker', 'wissel', 'wissel2', 'omschakelaar', 'kruis', 'dimmer', 'beweging'])
// a rolluik switch controls a motor, not a light: it is a control element but not a switch (no 'operates no light' warning)
const CONTROL_TYPES = new Set([...SWITCH_TYPES, 'rolluik', 'drukknop', 'aftakdoos'])
// appliances that belong on a circuit of their own
const DEDICATED_TYPES = new Set(['kookplaat', 'oven', 'wasmachine', 'droogkast', 'vaatwas', 'boiler', 'airco', 'laadpaal'])
// Protective devices and boards: what hangs behind them belongs to THAT circuit, not to the feeder circuit above it.
const BOUNDARY_TYPES = new Set(['kring', 'diff', 'bord', 'subbord', 'zekering'])
// the elements a circuit feeds itself: everything below it, but not what hangs behind a nested breaker, differential or (sub)board.
// A feeder circuit (e.g. one that only feeds a sub board) therefore has no consumers of its own; they are counted on the last circuit.
const ownElementsOf = (nodes) => nodes.flatMap((node) => (BOUNDARY_TYPES.has(node.type) ? [] : [node, ...ownElementsOf(node.children)]))
// the footer fields that must be filled in
export const REQUIRED_FOOTER_FIELDS = ['gemeente', 'eigenaar', 'tekenaar', 'datum']
const LEVEL_ORDER = {error: 0, warn: 1, info: 2}

/** The rating (A), cable section (mm²) and sensitivity (mA) written in a specs text such as 'B16 2,5mm² 30mA'. */
export const parseSpecs = (info = '') => {
    const rating = /(?:\b[BCDK]\s*(\d{1,3})\b)|(?:\b(\d{1,3})\s*A\b)/i.exec(info),
        section = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(info) || /\dG(\d+(?:[.,]\d+)?)/i.exec(info),
        sensitivity = /(\d+)\s*mA/i.exec(info)
    return {
        amp: rating ? +(rating[1] || rating[2]) : null,
        mm2: section ? parseFloat(section[1].replace(',', '.')) : null,
        mA: sensitivity ? +sensitivity[1] : null,
    }
}

// the differentials of a circuit (or separate differential elements) and their sensitivity in mA (null: not a differential)
const differentialSensitivity = (node) => {
    if (node.type === 'diff') return parseSpecs(node.info).mA
    if (node.type === 'kring' && ['differentieel', 'differentieelautomaat'].includes(node.p?.bescherming)) return Number(node.p?.delta) || parseSpecs(node.info).mA
    return null
}
const PROTECTIVE_TYPES = new Set(['kring', 'diff', 'zekering'])
/**
 * How many differentials of at most 30 mA sit right after the main differential: in the tree, with no other circuit, fuse or sensitive
 * differential between them and the connection (only boards, meters, ... and the main differential itself when it is drawn as an element).
 */
export const sensitiveDifferentialsAtOrigin = (nodes) =>
    (nodes || []).reduce((count, node) => {
        if (PROTECTIVE_TYPES.has(node.type)) {
            const mA = differentialSensitivity(node)
            if (mA != null && mA <= 30) return count + 1
            // a separate main differential (e.g. 300 mA): the ones right after it count
            if (node.type === 'diff' && mA != null) return count + sensitiveDifferentialsAtOrigin(node.children)
            return count
        }
        return count + sensitiveDifferentialsAtOrigin(node.children)
    }, 0)

/** The number of issues per level. */
export const summarize = (issues) => ({
    error: issues.filter((issue) => issue.level === 'error').length,
    warn: issues.filter((issue) => issue.level === 'warn').length,
    info: issues.filter((issue) => issue.level === 'info').length,
})

const message = (rule, params) => t('verify.rules.' + rule, params)
const quoted = (text) => `'${text}'`

/**
 * The issues of a project: [{id, level: 'error' | 'warn' | 'info', rule, msg, mark, nodeId, page, sheet, pageName}], errors first.
 * `mark` is the circuit + point as drawn (e.g. 'F6'), `page` the index of the eendraadschema page, `sheet` the printed sheet.
 */
export function verify(project) {
    const issues = [],
        marks = circuitMarks(project)
    // The sheet an element is DRAWN on (a page of the project is laid out over one or more printed sheets, 'Blad 2/6'), worked out
    // once and only when there is something to report. Elements of the head/bus (aansluiting, bord, earth) sit on the first sheet of their page.
    let sheets
    const sheetOf = (page, node) => {
        if (!sheets) {
            sheets = {byNode: new Map(), first: new Map(), count: new Map()}
            try {
                sheetPlan(project, true)
                    .filter((sheet) => sheet.kind === 'een')
                    .forEach((sheet) => {
                        if (sheet.slice.first) sheets.first.set(sheet.page, sheet)
                        sheets.count.set(sheet.page, (sheets.count.get(sheet.page) || 0) + 1)
                        sheet.board.circuits
                            .slice(sheet.slice.from, sheet.slice.to)
                            .forEach((circuit) => flatten([circuit.node]).forEach((drawn) => sheets.byNode.set(drawn.id, sheet)))
                    })
            } catch {
                // layout not possible: fall back on the name of the page
            }
        }
        const sheet = sheets.byNode.get(node.id) || sheets.first.get(page)
        return sheet && {...sheet, multi: sheets.count.get(page) > 1}
    }
    const add = (level, rule, msg, page, node) => {
        const sheet = page && node ? sheetOf(page, node) : null
        issues.push({
            id: rule + ':' + (node ? node.id : 'g' + issues.length),
            level,
            rule,
            msg,
            mark: node ? marks.get(node.id) : undefined,
            nodeId: node?.id,
            page: page ? project.een.indexOf(page) : null,
            sheet: sheet ? sheet.number : undefined,
            pageName: sheet && sheet.multi ? t('sheet.pageOf', {number: sheet.number, total: sheet.total}) : page?.name,
        })
    }
    const sortedIssues = () =>
        issues
            .map((issue, index) => [issue, index])
            .sort((a, b) => LEVEL_ORDER[a[0].level] - LEVEL_ORDER[b[0].level] || a[1] - b[1])
            .map(([issue]) => issue)
    const allNodes = project.een.flatMap((page) => flatten(page.tree))
    if (!allNodes.length) {
        add('error', 'tree.empty', message('treeEmpty'))
        return sortedIssues()
    }
    if (!allNodes.some((node) => node.type === 'aansluiting')) add('error', 'tree.noConnection', message('noConnection'))
    if (!allNodes.some((node) => node.type === 'aarding' || (node.type === 'bord' && node.p?.geaard))) add('error', 'earth', message('noEarth'))
    if (!allNodes.some((node) => node.type === 'overspanning')) add('info', 'spd', message('noSurgeProtection'))
    const circuitNameCount = {}
    allNodes
        .filter((node) => node.type === 'kring')
        .forEach((node) => {
            const key = (node.label || '').trim().toLowerCase()
            if (key) circuitNameCount[key] = (circuitNameCount[key] || 0) + 1
        })
    const walk = (page, nodes, parent, ancestors = []) =>
        nodes.forEach((node) => {
            const symbolType = typeOf(project, node.type),
                typeName = symbolName(symbolType),
                descendants = flatten(node.children),
                name = node.label || typeName
            if (node.type === 'leeg')
                add('warn', 'symbol.empty', parent ? message('emptySymbolUnder', {parent: parent.label}) : message('emptySymbol'), page, node)
            else if (parent ? !symbolType.parents.includes(parent.type) : symbolType.parents.length)
                add(
                    'error',
                    'hierarchy',
                    parent
                        ? message('notAllowedUnder', {name, type: typeName, parent: parent.label, parentType: symbolName(typeOf(project, parent.type))})
                        : message('cannotStandAlone', {
                              name,
                              type: typeName,
                              parents: symbolType.parents.map((key) => symbolName(typeOf(project, key))).join(t('verify.or')),
                          }),
                    page,
                    node,
                )
            if (node.type === 'aansluiting' && !node.children.length) add('error', 'connection.empty', message('connectionEmpty', {name}), page, node)
            if (node.type === 'bord' && !node.children.some((child) => ['kring', 'diff', 'zekering', 'bord'].includes(child.type)))
                add('warn', 'bord.empty', message('boardEmpty', {name}), page, node)
            if (node.type === 'diff') {
                const {mA} = parseSpecs(node.info)
                if (!node.children.length) add('warn', 'diff.empty', message('differentialEmpty', {name}), page, node)
                if (mA == null) add('warn', 'diff.sens', message('differentialSensitivity', {name}), page, node)
                else if (mA > LIMITS.maxDifferentialMilliamps && descendants.some((descendant) => SOCKET_TYPES.has(descendant.type)))
                    add('error', 'diff.stop', message('differentialSockets', {name, mA, max: LIMITS.maxDifferentialMilliamps}), page, node)
            }
            if (node.type === 'kring') checkCircuit(page, node, parent, ancestors, name, descendants)
            if (SWITCH_TYPES.has(node.type) && !descendants.some((descendant) => LIGHT_TYPES.has(descendant.type)))
                add('warn', 'switch.empty', message('switchWithoutLight', {name}), page, node)
            walk(page, node.children, node, [...ancestors, node])
        })
    const checkCircuit = (page, node, parent, ancestors, name, descendants) => {
        const unprotected = node.p?.bescherming === 'geen',
            countOf = (element) => Number(element.p?.aantal) || 1,
            {amp, mm2} = parseSpecs(node.info),
            ownElements = ownElementsOf(node.children), // only what this circuit feeds itself, not what hangs behind a nested breaker/differential/sub board
            consumers = ownElements.filter((element) => !CONTROL_TYPES.has(element.type)),
            sockets = ownElements.filter((element) => SOCKET_TYPES.has(element.type)).length, // a double or triple socket (aantal, stopcontact2/3) counts as one
            lights = ownElements.filter((element) => LIGHT_TYPES.has(element.type)).reduce((sum, element) => sum + countOf(element), 0),
            dedicated = consumers.filter((element) => DEDICATED_TYPES.has(element.type))
        if (parent?.type === 'bord' && !ancestors.some((ancestor) => ancestor.type === 'diff' || ancestor.p?.bescherming === 'differentieel'))
            add('error', 'kring.noDiff', message('circuitWithoutDifferential', {name}), page, node)
        if (!descendants.length) add('warn', 'kring.empty', message('circuitEmpty', {name}), page, node)
        if (!unprotected && (amp == null || mm2 == null)) add('warn', 'kring.specs', message('circuitSpecsMissing', {name}), page, node)
        else if (!unprotected && LIMITS.cable[mm2] && amp > LIMITS.cable[mm2])
            add('warn', 'kring.cable', message('circuitCableTooSmall', {name, amp, mm2, max: LIMITS.cable[mm2]}), page, node)
        if (sockets > LIMITS.maxSockets) add('warn', 'kring.stop', message('tooManySockets', {name, count: sockets, max: LIMITS.maxSockets}), page, node)
        if (lights > LIMITS.maxLights) add('warn', 'kring.light', message('tooManyLights', {name, count: lights, max: LIMITS.maxLights}), page, node)
        if (dedicated.length && consumers.length > 1) add('warn', 'kring.dedicated', message('dedicatedCircuit', {name, element: dedicated[0].label}), page, node)
        if (circuitNameCount[(node.label || '').trim().toLowerCase()] > 1) add('warn', 'kring.duplicate', message('duplicateCircuitName', {name}), page, node)
    }
    project.een.forEach((page) => walk(page, page.tree, null))
    const missingFields = REQUIRED_FOOTER_FIELDS.filter((key) => !(project.footer?.[key] || '').trim())
    if (missingFields.length)
        add('warn', 'footer', message('footerIncomplete', {fields: missingFields.map((key) => t('verify.footerFields.' + key)).join(', ')}))
    // the measured earth resistance (Kaderinfo → Metingen): at most 30 Ω; up to 100 Ω only with at least two differentials of at most
    // 30 mA right after the main differential
    const earth = measuredValue(project.footer?.aardingsweerstand)
    if (earth == null) add('info', 'measure.earth', message('earthNotMeasured'))
    else if (earth > EARTH_LIMIT_WITH_MEASURES) add('error', 'measure.earth', message('earthTooHigh', {value: earth, max: EARTH_LIMIT_WITH_MEASURES}))
    else if (earth > EARTH_LIMIT) {
        const sensitive = project.een.reduce((count, page) => count + sensitiveDifferentialsAtOrigin(page.tree), 0)
        if (sensitive < 2) add('warn', 'measure.earth', message('earthHigh', {value: earth, limit: EARTH_LIMIT, max: EARTH_LIMIT_WITH_MEASURES, count: sensitive}))
    }
    const placed = new Set(
        project.sit
            .flatMap((page) => page.items)
            .filter((item) => item.kind === 'sym')
            .map((item) => item.node),
    )
    const hidden = new Set(project.hidden || []),
        unplaced = placeableNodes(project).filter((node) => !placed.has(node.id) && !hidden.has(node.id)),
        pageOf = (node) => project.een.find((page) => flatten(page.tree).includes(node))
    if (unplaced.length > 8)
        add(
            'warn',
            'plan.unplaced',
            message('manyUnplaced', {
                count: unplaced.length,
                examples: unplaced
                    .slice(0, 3)
                    .map((node) => quoted(nodeName(project, node)))
                    .join(', '),
            }),
            pageOf(unplaced[0]),
            unplaced[0],
        )
    else unplaced.forEach((node) => add('warn', 'plan.unplaced', message('unplaced', {name: nodeName(project, node)}), pageOf(node), node))
    return sortedIssues()
}
