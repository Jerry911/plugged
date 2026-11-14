// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Simplified verification of an eendraadschema of a household installation against the AREI, Boek 1 (version 07, 15/09/2026); every
// message names the part it comes from. Limits live in LIMITS so they are easy to adjust. NOT a substitute for the inspection by an
// accredited body: what the drawing does not show (power of an appliance, which room a circuit feeds, the length of a cable) is not checked.
// The messages are in the active language (translations: verify.rules.*).
import {symbolName, typeOf} from '../symbols/symbolLibrary.js'
import {t} from '../i18n/translate.js'
import {flatten} from './tree.js'
import {circuitMarks, nodeName, unplacedNodes} from './project.js'
import {sheetPlan} from './boardLayout.js'
import {EARTH_LIMIT, EARTH_LIMIT_WITH_MEASURES, measuredValue} from './measurements.js'
import {appliesTo, formatDate, parseInstallationDate} from './installationDate.js'

// AREI 6.5.8.1, 1: sockets and lighting behind 30 mA, at most 8 circuits per 30 mA differential and, above 30 Ω, the other circuits behind
// 100 mA, for work started on site from 01/06/2023; 6.5.8.1, 2: IPXX-D sockets from 01/03/2025; 7.22.1: charging stations from 01/11/2022
export const SINCE_2023 = '2023-06-01'
// Book 1 applies to installations started from 01/06/2020; older ones fall under part 8 (the old AREI)
export const BOOK_1_SINCE = '2020-06-01'

// AREI 4.4.1.4 table 4.11 (household installations): section (mm²) -> the largest breaker (cable) or fuse (fuse) that may protect it
const BREAKER_FOR_SECTION = {0.5: 4, 0.75: 6, 1: 10, 1.5: 16, 2.5: 20, 4: 25, 6: 40, 10: 63, 16: 80, 25: 100},
    FUSE_FOR_SECTION = {0.5: 2, 0.75: 4, 1: 6, 1.5: 10, 2.5: 16, 4: 20, 6: 32, 10: 50, 16: 63, 25: 80}
export const LIMITS = {
    maxSockets: 8, // AREI 5.3.5.2 b: sockets per final circuit (a fixed appliance or a group of lights under one switch counts as one)
    maxLights: 8, // a guideline for a circuit with only lights, not an AREI requirement
    maxDifferentialMilliamps: 30, // AREI 2.6.4: high sensitivity, at most 30 mA
    mainDifferentialMilliamps: 300, // AREI 4.2.4.3 b: at the origin of the installation
    circuitsPerDifferential: 8, // AREI 4.2.4.3 b: final circuits per differential of at most 30 mA
    socketsPerDifferentialHighEarth: 16, // AREI 4.2.4.3 b: when the earth resistance is above 30 Ω
    otherCircuitsMilliampsHighEarth: 100, // AREI 4.2.4.3 b: the other circuits, when the earth resistance is above 30 Ω
    minSection: 1.5, // AREI 5.2.1.2 table 5.1: without sockets
    mainDifferentialMinAmps: 40, // AREI 5.3.5.3 a: the differential at the origin
    minBreakingCapacity: 3, // kA, AREI 5.3.3.1 e: breakers and fuses of a household installation
    minSectionWithSockets: 2.5, // AREI 5.2.1.2
    cable: BREAKER_FOR_SECTION,
    fuse: FUSE_FOR_SECTION,
}
// A socket is any symbol with socket properties (`sock` in the catalog, also a user's own symbol): {pe: earth contact, kid: child-safe,
// n: outlets in one box}. A double, triple, ... socket is one box, so it counts as one socket.
const socketOf = (project, node) => typeOf(project, node.type)?.sock || null
const LIGHT_TYPES = new Set(['lichtpunt', 'wandlamp', 'tl', 'spot', 'led', 'noodlicht', 'lichtcircuit']),
    SWITCH_TYPES = new Set(['schakelaar', 'schakelaar2', 'schakelaar3', 'verklikker', 'wissel', 'wissel2', 'omschakelaar', 'kruis', 'dimmer', 'beweging'])
// a rolluik switch controls a motor, not a light: it is a control element but not a switch (no 'operates no light' warning)
const CONTROL_TYPES = new Set([...SWITCH_TYPES, 'rolluik', 'drukknop', 'aftakdoos'])
// appliances that belong on a circuit of their own: by name in AREI 5.2.1.2 (and 7.22.3 for a charging station) ...
const DEDICATED_TYPES = new Set(['kookplaat', 'oven', 'wasmachine', 'droogkast', 'vaatwas', 'laadpaal'])
// ... and when their power is 2600 W or more (AREI 5.2.1.2), which the drawing does not tell: a warning, not an error
const DEDICATED_BY_POWER_TYPES = new Set(['boiler', 'airco', 'verwarming', 'microgolf'])
// circuits that go behind a differential of at most 30 mA (AREI 4.2.4.3 b): sockets, lighting, washing machine, dryer, dishwasher
const NEEDS_SENSITIVE_TYPES = new Set(['wasmachine', 'droogkast', 'vaatwas'])
const EV_TYPE = 'laadpaal'
// Protective devices and boards: what hangs behind them belongs to THAT circuit, not to the feeder circuit above it.
const BOUNDARY_TYPES = new Set(['kring', 'diff', 'bord', 'subbord', 'zekering'])
// the elements a circuit feeds itself: everything below it, but not what hangs behind a nested breaker, differential or (sub)board.
// A feeder circuit (e.g. one that only feeds a sub board) therefore has no consumers of its own; they are counted on the last circuit.
const ownElementsOf = (nodes) => nodes.flatMap((node) => (BOUNDARY_TYPES.has(node.type) ? [] : [node, ...ownElementsOf(node.children)]))
// the footer fields that must be filled in: the address of the installation, the voltage and kind of current, the version and its
// date (AREI 3.1.2), and who it is for and who drew it
export const REQUIRED_FOOTER_FIELDS = ['straat', 'postcode', 'gemeente', 'eigenaar', 'tekenaar', 'stelsel', 'rev', 'datum']
const PV_TYPES = new Set(['zonnepanelen', 'omvormer'])
// single conductors with basic insulation only (VOB, H07V-U/R/K, ...): not underground (AREI 5.2.9.2), not in a wall without conduit (5.2.9.10)
// (anywhere in the text: a circuit without properties writes its breaker first, e.g. 'B32 VOB 3x6')
const SINGLE_CONDUCTOR = /(?:^|\s)(VOB|VOBST|VOBSt|VOBs|H0[57]V(?![A-Z]{2})|VTB)\b/i
// how a cable designation tells its type (letters, e.g. XVB, EXVB, H07V-K) and its number of conductors (3G2,5, 4x16)
const cableTypeOf = (text = '') => text.split(/\s+/).find((token) => /^[A-Z][A-Z0-9-]*[A-Z]/.test(token) && !/^[BCDK]\d+$/.test(token)) || null
const hasConductorCount = (text = '') => /\d\s*[GgxX×]\s*\d/.test(text)
const polesOf = (node) => Number(node.p?.polen) || Number(/\b(\d)\s*P\b/i.exec(node.info || '')?.[1]) || null
const ratingOf = (node) => Number(node.p?.amp) || parseSpecs(node.info).amp
const listed = (names) => (names.length > 6 ? names.slice(0, 6).join(', ') + ', …' : names.join(', '))
const LEVEL_ORDER = {error: 0, warn: 1, info: 2}

/** The rating (A), cable section (mm²) and sensitivity (mA) written in a specs text such as 'B16 2,5mm² 30mA' or 'XVB 3G2,5' or '4x16'. */
export const parseSpecs = (info = '') => {
    const rating = /(?:\b[BCDK]\s*(\d{1,3})\b)|(?:\b(\d{1,3})\s*A\b)/i.exec(info),
        section = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(info) || /\dG(\d+(?:[.,]\d+)?)/i.exec(info) || /\b\d\s*[x×]\s*(\d+(?:[.,]\d+)?)\b/i.exec(info),
        sensitivity = /(\d+)\s*mA/i.exec(info)
    return {
        amp: rating ? +(rating[1] || rating[2]) : null,
        mm2: section ? parseFloat(section[1].replace(',', '.')) : null,
        mA: sensitivity ? +sensitivity[1] : null,
    }
}

// the sensitivity in mA of a differential: a separate differential element, a circuit or the connection protected by one (null: none)
const isDifferentialProtection = (node) => ['differentieel', 'differentieelautomaat'].includes(node.p?.bescherming)
const differentialSensitivity = (node) => {
    if (node.type === 'diff') return Number(node.p?.delta) || parseSpecs(node.info).mA
    if ((node.type === 'kring' || node.type === 'aansluiting') && isDifferentialProtection(node)) return Number(node.p?.delta) || parseSpecs(node.info).mA
    return null
}
const differentialType = (node) => (node.p?.diffType || /type\s*([A-Z]+)\b/i.exec(node.info || '')?.[1] || '').toUpperCase()
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

/**
 * What a circuit feeds, counted as AREI 5.3.5.2 b counts it: every socket (single or multiple) is one, and so is a fixed appliance or a
 * group of lights operated by one switch; a light without a switch counts on its own. Does not look behind a nested breaker,
 * differential or (sub)board. `isSocket(node)` tells the sockets (verify passes the symbol's socket properties). Answers {sockets, fixed}.
 */
export const circuitPoints = (nodes, isSocket) => {
    const points = {sockets: 0, fixed: 0}
    const hasLight = (node) => node.children.some((child) => !BOUNDARY_TYPES.has(child.type) && (LIGHT_TYPES.has(child.type) || hasLight(child)))
    const visit = (list, underSwitch) =>
        list.forEach((node) => {
            if (BOUNDARY_TYPES.has(node.type)) return
            if (isSocket(node)) points.sockets++
            else if (SWITCH_TYPES.has(node.type)) {
                if (!underSwitch && hasLight(node)) points.fixed++
            } else if (LIGHT_TYPES.has(node.type)) {
                if (!underSwitch) points.fixed++
            } else if (!CONTROL_TYPES.has(node.type)) points.fixed++
            visit(node.children, underSwitch || SWITCH_TYPES.has(node.type))
        })
    visit(nodes, false)
    return points
}

/**
 * The first protective devices below a node (through meters, boards, ... and a main fuse, which protects against overcurrent only): the
 * protection at the origin of the installation.
 */
const firstProtection = (nodes) =>
    nodes.flatMap((node) => (PROTECTIVE_TYPES.has(node.type) && node.type !== 'zekering' ? [node] : firstProtection(node.children)))

/** The final circuits behind a differential: the circuits (and differentials feeding consumers directly) with no circuit below them. */
const finalCircuits = (node) =>
    node.children.flatMap((child) => {
        if (child.type === 'kring') {
            const deeper = finalCircuits(child)
            return deeper.length ? deeper : [child]
        }
        if (child.type === 'diff' && child.children.length && !flatten(child.children).some((n) => n.type === 'kring')) return [child]
        return finalCircuits(child)
    })

/**
 * Every rule of Controleer, grouped as on the Controleregels page (Account): {group, rules: [{id, level, article}]}. `level` is the usual
 * level of its issues, `article` the part of the AREI it comes from ('' when it is not an AREI requirement). An empty schema is always
 * reported and is not in the list. The names are in the translations (verify.catalog.rules.<id>).
 */
export const RULE_CATALOG = [
    {
        group: 'structure',
        rules: [
            {id: 'tree.noConnection', level: 'error', article: ''},
            {id: 'earth', level: 'error', article: '5.4'},
            {id: 'hierarchy', level: 'error', article: ''},
            {id: 'connection.empty', level: 'error', article: ''},
            {id: 'bord.empty', level: 'warn', article: ''},
            {id: 'diff.empty', level: 'warn', article: ''},
            {id: 'kring.empty', level: 'warn', article: ''},
            {id: 'symbol.empty', level: 'warn', article: ''},
            {id: 'switch.empty', level: 'warn', article: ''},
            {id: 'kring.duplicate', level: 'warn', article: ''},
            {id: 'kring.specs', level: 'warn', article: '3.1.2.2 a'},
            {id: 'install.oldArei', level: 'info', article: '8.2'},
        ],
    },
    {
        group: 'differentials',
        rules: [
            {id: 'main.diff', level: 'error', article: '4.2.4.3 b'},
            {id: 'main.rating', level: 'error', article: '5.3.5.3 a'},
            {id: 'kring.noDiff', level: 'error', article: '4.2.4.3 b'},
            // sockets and lighting from 01/06/2023, washing machine, dryer and dishwasher always: only part of the rule has a date
            {id: 'kring.sensitive', level: 'error', article: '4.2.4.3 b', since: SINCE_2023, partial: true},
            {id: 'diff.circuits', level: 'error', article: '4.2.4.3 b', since: SINCE_2023},
            {id: 'diff.type', level: 'error', article: '5.3.5.3 a'},
            {id: 'diff.poles', level: 'error', article: '5.3.5.3 c'},
            {id: 'diff.sens', level: 'warn', article: '3.1.2.2 a'},
        ],
    },
    {
        group: 'earth',
        rules: [
            {id: 'measure.earth', level: 'error', article: '5.4.1, 4.2.4.3 b'},
            {id: 'diff.highEarth', level: 'error', article: '4.2.4.3 b'},
            {id: 'kring.highEarth', level: 'error', article: '4.2.4.3 b', since: SINCE_2023},
        ],
    },
    {
        group: 'circuits',
        rules: [
            {id: 'kring.stop', level: 'error', article: '5.3.5.2 b'},
            {id: 'kring.dedicated', level: 'error', article: '5.2.1.2'},
            {id: 'lighting.circuits', level: 'info', article: '5.3.5.2 b'},
            {id: 'kring.light', level: 'info', article: ''},
        ],
    },
    {
        group: 'cables',
        rules: [
            {id: 'kring.cable', level: 'error', article: '4.4.1.4'},
            {id: 'kring.section', level: 'error', article: '5.2.1.2'},
            {id: 'kring.breaking', level: 'error', article: '5.3.3.1 e'},
            {id: 'cable.placement', level: 'error', article: '5.2.9.2, 5.2.9.10'},
        ],
    },
    {
        group: 'sockets',
        rules: [
            {id: 'socket.earth', level: 'warn', article: '5.3.5.2 b'},
            {id: 'socket.childSafe', level: 'info', article: '5.3.5.2 a', since: '2025-03-01'},
        ],
    },
    {
        group: 'special',
        rules: [
            {id: 'ev.differential', level: 'error', article: '7.22.4.1', since: '2022-11-01'},
            {id: 'ev.socket', level: 'error', article: '7.22.3', since: '2022-11-01'},
            {id: 'ev.dc', level: 'info', article: '7.22.4.1', since: '2022-11-01'},
            {id: 'pv', level: 'info', article: '7.112.2'},
            {id: 'spd', level: 'info', article: '4.5'},
        ],
    },
    {
        group: 'documents',
        rules: [
            {id: 'footer', level: 'warn', article: '3.1.2'},
            {id: 'docs.letter', level: 'warn', article: '3.1.2.1 a'},
            {id: 'docs.cableType', level: 'warn', article: '3.1.2.2 a'},
            {id: 'docs.conductors', level: 'warn', article: '3.1.2.2 a'},
            {id: 'docs.placement', level: 'warn', article: '3.1.2.2 a'},
            {id: 'docs.diffType', level: 'warn', article: '3.1.2.2 a'},
        ],
    },
    {
        group: 'plan',
        rules: [{id: 'plan.unplaced', level: 'warn', article: ''}],
    },
]
export const RULE_IDS = RULE_CATALOG.flatMap((group) => group.rules.map((rule) => rule.id))
// the rules that apply as a whole only from a date (a partial one handles its date itself)
const RULE_SINCE = Object.fromEntries(RULE_CATALOG.flatMap((group) => group.rules.filter((rule) => rule.since && !rule.partial).map((rule) => [rule.id, rule.since])))

/**
 * The rules (catalog entries) that do not apply to this project because its installation started before their date (Kaderinfo →
 * Installatie); a partial rule is listed too, only part of it is left out.
 */
export const rulesNotApplicable = (project) => {
    const period = parseInstallationDate(project?.footer?.installatiedatum)
    return RULE_CATALOG.flatMap((group) => group.rules).filter((rule) => rule.since && appliesTo(rule.since, period) === 'no')
}

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
 * `disabled`: the rule ids the user switched off (Account → Controleregels); their issues are left out.
 */
export function verify(project, {disabled} = {}) {
    const off = new Set(disabled || []),
        // when the work on site started: a rule with a date is left out for an older installation, and gets a note when only a year or
        // month is known that runs across its date
        period = parseInstallationDate(project.footer?.installatiedatum),
        uncertain = (since) => ' ' + t('verify.sinceUncertain', {date: formatDate(since), given: project.footer?.installatiedatum?.trim()})
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
        if (off.has(rule)) return
        const applies = appliesTo(RULE_SINCE[rule], period)
        if (applies === 'no') return
        if (applies === 'maybe') msg += uncertain(RULE_SINCE[rule])
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
    // the measured earth resistance (Kaderinfo → Metingen) changes what the circuits need (AREI 4.2.4.3 b)
    const earth = measuredValue(project.footer?.aardingsweerstand),
        highEarth = earth != null && earth > EARTH_LIMIT
    const elementName = (element) => element.label || symbolName(typeOf(project, element.type)),
        isSocket = (node) => !!socketOf(project, node),
        pointsOf = (nodes) => circuitPoints(nodes, isSocket)
    let lightingCircuits = 0
    // what the AREI asks to be on the schema (3.1.2) and the sockets, gathered over the whole tree and reported once per kind
    const missing = {letter: [], cableType: [], conductors: [], placement: [], diffType: []},
        firstMissing = {},
        note = (kind, page, node, name) => {
            if (!missing[kind].includes(name)) missing[kind].push(name)
            if (!firstMissing[kind]) firstMissing[kind] = {page, node}
        }
    const unearthedSockets = [],
        notChildSafeSockets = []
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
            if (node.type === 'aansluiting' && node.children.length) checkMainDifferential(page, node, name)
            if (node.type === 'bord' && !node.children.some((child) => ['kring', 'diff', 'zekering', 'bord'].includes(child.type)))
                add('warn', 'bord.empty', message('boardEmpty', {name}), page, node)
            if (node.type === 'diff') checkDifferential(page, node, ancestors, name)
            if (differentialSensitivity(node) != null || node.type === 'diff' || isDifferentialProtection(node)) checkDifferentialDevice(page, node, name)
            if (node.type === 'aansluiting') checkBreakingCapacity(page, node, name)
            // sockets drawn without earth contact (AREI 5.3.5.2 b) and single sockets not drawn as child-safe (IPXX-D, 5.3.5.2 a); the
            // multiple socket symbols have no child-safe variant, so only single ones are asked
            const sock = socketOf(project, node)
            if (sock) {
                const circuit = [...ancestors].reverse().find((ancestor) => ancestor.type === 'kring'),
                    where = circuit?.label || name
                if (!sock.pe) unearthedSockets.push({page, node, where})
                if (!sock.kid && (Number(sock.n) || 1) === 1) notChildSafeSockets.push({page, node, where})
            }
            // a fuse with the section it protects in its text: the fuse column of AREI table 4.11
            if (node.type === 'zekering') {
                const {amp, mm2} = parseSpecs(node.info)
                if (amp != null && LIMITS.fuse[mm2] && amp > LIMITS.fuse[mm2])
                    add('error', 'kring.cable', message('fuseTooLarge', {name, amp, mm2, max: LIMITS.fuse[mm2]}), page, node)
            }
            if (node.type === 'kring') checkCircuit(page, node, parent, ancestors, name, descendants)
            if (SWITCH_TYPES.has(node.type) && !descendants.some((descendant) => LIGHT_TYPES.has(descendant.type)))
                add('warn', 'switch.empty', message('switchWithoutLight', {name}), page, node)
            walk(page, node.children, node, [...ancestors, node])
        })
    // AREI 4.2.4.3 b: a differential of at most 300 mA at the origin of the installation (on the connection, or the first protection
    // after it in the main board), so the whole installation is behind it
    const checkMainDifferential = (page, node, name) => {
        if (isDifferentialProtection(node)) {
            const mA = differentialSensitivity(node)
            if (ratingOf(node) != null && ratingOf(node) < LIMITS.mainDifferentialMinAmps)
                add('error', 'main.rating', message('mainDifferentialRating', {name, amp: ratingOf(node), min: LIMITS.mainDifferentialMinAmps}), page, node)
            if (mA != null && mA > LIMITS.mainDifferentialMilliamps)
                add('error', 'main.diff', message('mainDifferentialTooHigh', {name, mA, max: LIMITS.mainDifferentialMilliamps}), page, node)
            return
        }
        const first = firstProtection(node.children)
        if (!first.length) return
        // AREI 5.3.5.3 a: the differential at the origin is rated at least 40 A
        first
            .filter((protection) => protection.type === 'diff' && ratingOf(protection) != null && ratingOf(protection) < LIMITS.mainDifferentialMinAmps)
            .forEach((protection) =>
                add('error', 'main.rating', message('mainDifferentialRating', {name: elementName(protection), amp: ratingOf(protection), min: LIMITS.mainDifferentialMinAmps}), page, protection),
            )
        const unprotected = first.filter((protection) => differentialSensitivity(protection) == null && protection.type !== 'diff')
        if (unprotected.length) add('error', 'main.diff', message('mainDifferentialMissing', {name, max: LIMITS.mainDifferentialMilliamps, first: elementName(unprotected[0])}), page, node)
        else {
            const tooHigh = first.find((protection) => (differentialSensitivity(protection) ?? 0) > LIMITS.mainDifferentialMilliamps)
            if (tooHigh)
                add('error', 'main.diff', message('mainDifferentialTooHigh', {name: elementName(tooHigh), mA: differentialSensitivity(tooHigh), max: LIMITS.mainDifferentialMilliamps}), page, tooHigh)
        }
    }
    // AREI 5.3.5.3: a differential of a household installation is at least type A (not AC) and breaks all active conductors (not one
    // pole); the schema states its type (3.1.2.2 a)
    const checkDifferentialDevice = (page, node, name) => {
        const type = differentialType(node)
        if (type === 'AC') add('error', 'diff.type', message('differentialTypeAC', {name}), page, node)
        else if (!type) note('diffType', page, node, name)
        if (polesOf(node) === 1) add('error', 'diff.poles', message('differentialOnePole', {name}), page, node)
    }
    // AREI 5.3.3.1 e: breakers and fuses of a household installation break at least 3000 A (3 kA)
    const checkBreakingCapacity = (page, node, name) => {
        const kA = parseFloat(String(node.p?.kortsl ?? '').replace(',', '.'))
        if (Number.isFinite(kA) && kA > 0 && kA < LIMITS.minBreakingCapacity)
            add('error', 'kring.breaking', message('breakingCapacity', {name, kA, min: LIMITS.minBreakingCapacity}), page, node)
    }
    // the cable of a circuit: on the schema with its type, number of conductors and installation method (AREI 3.1.2.2 a); single
    // conductors are not allowed in the ground (5.2.9.2) nor in a wall without conduit (5.2.9.10)
    const checkCable = (page, node, name) => {
        const cable = node.p?.kabel ?? node.info ?? '',
            placement = node.p?.plaatsing || ''
        if (!cableTypeOf(cable)) note('cableType', page, node, name)
        if (!hasConductorCount(cable)) note('conductors', page, node, name)
        if (!placement) note('placement', page, node, name)
        if (SINGLE_CONDUCTOR.test(cable) && placement === 'ondergronds')
            add('error', 'cable.placement', message('singleConductorUnderground', {name, cable: cableTypeOf(cable)}), page, node)
        else if (SINGLE_CONDUCTOR.test(cable) && placement === 'inwand' && !node.p?.inbuis)
            add('error', 'cable.placement', message('singleConductorInWall', {name, cable: cableTypeOf(cable)}), page, node)
    }
    // a separate differential: its sensitivity, at most 8 final circuits behind one of at most 30 mA, and with an earth resistance above
    // 30 Ω at most 16 sockets (a fixed appliance or a group of lights counts as one) behind it (AREI 4.2.4.3 b)
    const checkDifferential = (page, node, ancestors, name) => {
        const mA = differentialSensitivity(node)
        if (!node.children.length) add('warn', 'diff.empty', message('differentialEmpty', {name}), page, node)
        if (mA == null) add('warn', 'diff.sens', message('differentialSensitivity', {name}), page, node)
        // a differential that feeds consumers itself (without a circuit under it) is a circuit for the 30 mA rule
        if (!node.children.some((child) => child.type === 'kring' || child.type === 'bord')) checkSensitiveNeed(page, node, ancestors, name)
        if (mA == null || mA > LIMITS.maxDifferentialMilliamps) return
        const circuits = finalCircuits(node)
        if (circuits.length > LIMITS.circuitsPerDifferential)
            add('error', 'diff.circuits', message('differentialCircuits', {name, count: circuits.length, max: LIMITS.circuitsPerDifferential}), page, node)
        if (highEarth) {
            const behind = [node, ...flatten(node.children).filter((child) => child.type === 'kring')].reduce((sum, circuit) => {
                    const {sockets, fixed} = pointsOf(circuit.children)
                    return sum + sockets + fixed
                }, 0)
            if (behind > LIMITS.socketsPerDifferentialHighEarth)
                add('error', 'diff.highEarth', message('differentialHighEarth', {name, count: behind, max: LIMITS.socketsPerDifferentialHighEarth, value: earth, limit: EARTH_LIMIT}), page, node)
        }
    }
    // what the differentials above a circuit (and its own) give: is one of at most 30 mA, and the most sensitive one
    const protectionOf = (ancestors, node) => {
        const chain = [...ancestors, node].filter((element) => differentialSensitivity(element) != null)
        const sensitive = [...chain].reverse().find((element) => differentialSensitivity(element) <= LIMITS.maxDifferentialMilliamps)
        return {chain, sensitive, minimum: chain.length ? Math.min(...chain.map(differentialSensitivity)) : null}
    }
    // AREI 4.2.4.3 b: sockets, lighting, washing machine, dryer and dishwasher go behind a differential of at most 30 mA; with an earth
    // resistance above 30 Ω every other circuit behind one of at most 100 mA
    const checkSensitiveNeed = (page, node, ancestors, name) => {
        const own = ownElementsOf(node.children),
            {chain, sensitive, minimum} = protectionOf(ancestors, node)
        if (!chain.length) return // no differential at all: kring.noDiff / main.diff
        // sockets and lighting only for work started from 01/06/2023 (6.5.8.1, 1); washing machine, dryer and dishwasher always
        const socketsAndLighting = appliesTo(SINCE_2023, period),
            needs =
                own.find((element) => NEEDS_SENSITIVE_TYPES.has(element.type)) ||
                (socketsAndLighting !== 'no' && own.find((element) => isSocket(element) || LIGHT_TYPES.has(element.type)))
        if (needs && !sensitive)
            add(
                'error',
                'kring.sensitive',
                message('circuitNeedsSensitive', {name, element: elementName(needs), mA: minimum, max: LIMITS.maxDifferentialMilliamps}) +
                    (socketsAndLighting === 'maybe' && !NEEDS_SENSITIVE_TYPES.has(needs.type) ? uncertain(SINCE_2023) : ''),
                page,
                node,
            )
        else if (!needs && highEarth && !sensitive && minimum > LIMITS.otherCircuitsMilliampsHighEarth)
            add('error', 'kring.highEarth', message('circuitHighEarth', {name, mA: minimum, max: LIMITS.otherCircuitsMilliampsHighEarth, value: earth, limit: EARTH_LIMIT}), page, node)
    }
    // AREI 7.22: a charging station on a circuit of its own, protected individually by a differential of at most 30 mA that also trips on a
    // DC fault current (type B, or type A with DC detection in the charging station), and not connected through a socket
    const checkCharger = (page, node, ancestors, name, own) => {
        const charger = own.find((element) => element.type === EV_TYPE)
        if (!charger) return
        const behindSocket = (nodes, socket) => nodes.some((child) => !BOUNDARY_TYPES.has(child.type) && ((child.type === EV_TYPE && socket) || behindSocket(child.children, socket || isSocket(child))))
        if (behindSocket(node.children, false)) add('error', 'ev.socket', message('chargerViaSocket', {name, element: elementName(charger)}), page, node)
        const {sensitive} = protectionOf(ancestors, node)
        const individual = sensitive && (sensitive === node || finalCircuits(sensitive).length === 1)
        if (!individual) add('error', 'ev.differential', message('chargerDifferential', {name, element: elementName(charger), max: LIMITS.maxDifferentialMilliamps}), page, node)
        else if (differentialType(sensitive) !== 'B')
            add('info', 'ev.dc', message('chargerDcFault', {name, type: differentialType(sensitive) || '?'}), page, node)
    }
    const checkCircuit = (page, node, parent, ancestors, name, descendants) => {
        const unprotected = node.p?.bescherming === 'geen',
            countOf = (element) => Number(element.p?.aantal) || 1,
            {amp, mm2} = parseSpecs(node.info),
            ownElements = ownElementsOf(node.children), // only what this circuit feeds itself, not what hangs behind a nested breaker/differential/sub board
            consumers = ownElements.filter((element) => !CONTROL_TYPES.has(element.type)),
            {sockets, fixed} = pointsOf(node.children), // a multiple socket (stopcontact2/3, Aantal, an own symbol) counts as one
            lights = ownElements.filter((element) => LIGHT_TYPES.has(element.type)).reduce((sum, element) => sum + countOf(element), 0),
            dedicated = consumers.filter((element) => DEDICATED_TYPES.has(element.type)),
            byPower = consumers.filter((element) => DEDICATED_BY_POWER_TYPES.has(element.type)),
            noDifferential = parent?.type === 'bord' && !ancestors.some((ancestor) => differentialSensitivity(ancestor) != null || ancestor.type === 'diff' || isDifferentialProtection(ancestor)) && !isDifferentialProtection(node)
        if (noDifferential) add('error', 'kring.noDiff', message('circuitWithoutDifferential', {name}), page, node)
        else checkSensitiveNeed(page, node, ancestors, name)
        if (!descendants.length) add('warn', 'kring.empty', message('circuitEmpty', {name}), page, node)
        if (!unprotected && (amp == null || mm2 == null)) add('warn', 'kring.specs', message('circuitSpecsMissing', {name}), page, node)
        else if (!unprotected && LIMITS.cable[mm2] && amp > LIMITS.cable[mm2])
            add('error', 'kring.cable', message('circuitCableTooSmall', {name, amp, mm2, max: LIMITS.cable[mm2]}), page, node)
        // AREI 5.2.1.2: at least 2.5 mm², 1.5 mm² only for a circuit without sockets
        if (mm2 != null && sockets && mm2 < LIMITS.minSectionWithSockets)
            add('error', 'kring.section', message('socketSection', {name, mm2, min: LIMITS.minSectionWithSockets}), page, node)
        else if (mm2 != null && mm2 < LIMITS.minSection) add('error', 'kring.section', message('minSection', {name, mm2, min: LIMITS.minSection}), page, node)
        // AREI 5.3.5.2 b: at most 8 sockets per final circuit, a fixed appliance or a group of lights under one switch counting as one
        if (sockets && sockets + fixed > LIMITS.maxSockets)
            add(
                'error',
                'kring.stop',
                fixed ? message('tooManyPoints', {name, count: sockets + fixed, sockets, fixed, max: LIMITS.maxSockets}) : message('tooManySockets', {name, count: sockets, max: LIMITS.maxSockets}),
                page,
                node,
            )
        if (!sockets && lights > LIMITS.maxLights) add('info', 'kring.light', message('tooManyLights', {name, count: lights, max: LIMITS.maxLights}), page, node)
        if (lights) lightingCircuits++
        if (dedicated.length && consumers.length > 1) add('error', 'kring.dedicated', message('dedicatedCircuit', {name, element: elementName(dedicated[0])}), page, node)
        else if (byPower.length && consumers.length > 1) add('warn', 'kring.dedicated', message('dedicatedByPower', {name, element: elementName(byPower[0])}), page, node)
        checkCharger(page, node, ancestors, name, ownElements)
        // AREI 3.1.2.1 a: every circuit is marked with a capital letter
        if (!/^[A-Z]+\d*$/.test((node.label || '').trim())) note('letter', page, node, name)
        if (!unprotected) checkBreakingCapacity(page, node, name)
        checkCable(page, node, name)
        if (circuitNameCount[(node.label || '').trim().toLowerCase()] > 1) add('warn', 'kring.duplicate', message('duplicateCircuitName', {name}), page, node)
    }
    project.een.forEach((page) => walk(page, page.tree, null))
    const missingFields = REQUIRED_FOOTER_FIELDS.filter((key) => !(project.footer?.[key] || '').trim())
    if (missingFields.length)
        add('warn', 'footer', message('footerIncomplete', {fields: missingFields.map((key) => t('verify.footerFields.' + key)).join(', ')}))
    // an installation started before Book 1 applied: these are the rules of Book 1, the old AREI (part 8) may ask less
    if (appliesTo(BOOK_1_SINCE, period) === 'no') add('info', 'install.oldArei', message('oldInstallation', {date: project.footer.installatiedatum.trim()}))
    // what the schema must show (AREI 3.1.2), once per kind with the circuits it concerns
    Object.entries(missing).forEach(([kind, names]) => {
        if (names.length) add('warn', 'docs.' + kind, message('docs.' + kind, {names: listed(names), count: names.length}), firstMissing[kind].page, firstMissing[kind].node)
    })
    // sockets: an earth contact (AREI 5.3.5.2 b); IPXX-D, child-safe shutters, for new sockets since 01/03/2025 (5.3.5.2 a, 6.5.8.1)
    const circuitsOf = (sockets) => listed([...new Set(sockets.map((socket) => socket.where))])
    if (unearthedSockets.length)
        add('warn', 'socket.earth', message('socketsWithoutEarth', {count: unearthedSockets.length, circuits: circuitsOf(unearthedSockets)}), unearthedSockets[0].page, unearthedSockets[0].node)
    if (notChildSafeSockets.length)
        add('info', 'socket.childSafe', message('socketsNotChildSafe', {count: notChildSafeSockets.length, circuits: circuitsOf(notChildSafeSockets)}), notChildSafeSockets[0].page, notChildSafeSockets[0].node)
    // AREI 7.112: what a household PV installation needs that the drawing does not show
    if (allNodes.some((node) => PV_TYPES.has(node.type))) add('info', 'pv', message('photovoltaic'))
    // AREI 5.3.5.2 b: at least two lighting circuits in a home with more than two rooms (the drawing does not tell how many rooms)
    if (lightingCircuits === 1) add('info', 'lighting.circuits', message('lightingCircuits'))
    // the measured earth resistance (Kaderinfo → Metingen): lower than 100 Ω (AREI 5.4.1); above 30 Ω at least two differentials of at
    // most 30 mA right after the main differential (AREI 4.2.4.3 b)
    if (earth == null) add('info', 'measure.earth', message('earthNotMeasured'))
    else if (earth >= EARTH_LIMIT_WITH_MEASURES) add('error', 'measure.earth', message('earthTooHigh', {value: earth, max: EARTH_LIMIT_WITH_MEASURES}))
    else if (earth > EARTH_LIMIT) {
        const sensitive = project.een.reduce((count, page) => count + sensitiveDifferentialsAtOrigin(page.tree), 0)
        if (sensitive < 2) add('warn', 'measure.earth', message('earthHigh', {value: earth, limit: EARTH_LIMIT, max: EARTH_LIMIT_WITH_MEASURES, count: sensitive}))
    }
    const unplaced = unplacedNodes(project),
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
