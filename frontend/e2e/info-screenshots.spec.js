// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Makes the screenshots of the Info page (public/info/<language>/<name>.webp), in every language, from a sample house. Not a test: it
// only runs on request, against the fake backend, and is skipped otherwise:
//   INFO_SCREENSHOTS=1 npx playwright test info-screenshots
// The pictures are taken as PNG and converted to WebP (quality 82) with Python + Pillow (python3 -m pip install pillow).
import {execFileSync} from 'node:child_process'
import {mkdirSync, rmSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {test, expect, FAKE_USER} from './fixtures.js'
import {node} from './data.js'
import {PLAN_TEMPLATES, TEMPLATE_AREA, templatePages} from '../src/model/planTemplates.js'
import {translation} from '../src/i18n/translate.js'

const RUN = !!process.env.INFO_SCREENSHOTS && !process.env.E2E_REAL_BACKEND
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/info')
// the size of every picture, so the page keeps its layout while they load (src/features/info/screenshotSizes.json)
const SIZES = resolve(dirname(fileURLToPath(import.meta.url)), '../src/features/info/screenshotSizes.json')
const SIZES_SCRIPT = `
import json, os, sys
from PIL import Image
root, out = sys.argv[1], sys.argv[2]
sizes = {}
for language in sorted(os.listdir(root)):
    folder = os.path.join(root, language)
    if os.path.isdir(folder):
        sizes[language] = {name[:-5]: list(Image.open(os.path.join(folder, name)).size) for name in sorted(os.listdir(folder)) if name.endswith('.webp')}
open(out, 'w').write(json.dumps(sizes, indent=2) + chr(10))
`
const writeSizes = () => execFileSync('python3', ['-c', SIZES_SCRIPT, OUT, SIZES])
const LANGUAGES = ['nl', 'fr', 'en']

test.skip(!RUN, 'makes the screenshots of the Info page: INFO_SCREENSHOTS=1')
// one after the other, and after every test the file with the sizes is written again (not after every picture: the editor must not
// wait, it reports itself to the server every 10 s and would load the project again)
test.describe.configure({mode: 'serial'})
test.afterEach(() => writeSizes())
test.use({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1})
test.setTimeout(180_000)

// ---- the sample house ---------------------------------------------------------------------------------------------------------
// a circuit with its properties, and its info (the specs as the editor writes them, which Controleer reads)
const circuit = (id, children, p) => {
    const properties = {bescherming: 'automatisch', polen: 2, curve: 'B', plaatsing: 'inwand', kortsl: 3, ...p}
    return node(id, 'kring', children, {label: id, info: `${properties.curve}${properties.amp} ${properties.polen}P ${properties.kabel}`, p: properties})
}
const tree = () => [
    node(
        'M',
        'aansluiting',
        [
            node('T', 'teller', [
                node('B', 'bord', [
                    // a differentieel of 30 mA feeding a sub board with the circuits of the living rooms (as drawn in the editor)
                    node(
                        'H',
                        'kring',
                        [
                            node(
                                'SB',
                                'subbord',
                                [
                                    circuit('A', [node('A1', 'stopcontact_pekid'), node('A2', 'stopcontact2'), node('A3', 'stopcontact_pekid')], {
                                        amp: 20,
                                        kabel: 'XVB Cca 3G2,5',
                                    }),
                                    circuit(
                                        'B',
                                        [
                                            node('B1', 'schakelaar', [node('B2', 'lichtpunt'), node('B3', 'lichtpunt')]),
                                            node('B4', 'wissel', [node('B5', 'lichtpunt')]),
                                        ],
                                        {amp: 16, kabel: 'XVB Cca 3G1,5'},
                                    ),
                                    circuit('C', [node('C1', 'wasmachine')], {
                                        amp: 20,
                                        kabel: 'XVB Cca 3G2,5',
                                    }),
                                    circuit('D', [node('D1', 'vaatwas')], {
                                        amp: 20,
                                        kabel: 'XVB Cca 3G2,5',
                                    }),
                                ],
                                {label: 'Leefruimtes'},
                            ),
                        ],
                        {
                            label: 'H',
                            p: {
                                bescherming: 'differentieel',
                                polen: 2,
                                amp: 40,
                                delta: 30,
                                diffType: 'A',
                                kabel: 'XVB Cca 3G6',
                                plaatsing: 'inwand',
                            },
                        },
                    ),
                    circuit('E', [node('E1', 'kookplaat')], {
                        amp: 32,
                        curve: 'C',
                        kabel: 'XVB Cca 3G6',
                    }),
                    // on purpose a cable too thin for its breaker: Controleer shows an error
                    circuit('F', [node('F1', 'oven')], {
                        amp: 20,
                        kabel: 'XVB Cca 3G1,5',
                    }),
                    circuit('G', [node('G1', 'boiler')], {
                        amp: 20,
                        kabel: 'XVB Cca 3G2,5',
                    }),
                    node('E0', 'aarding'),
                ]),
            ]),
            // the main differentieel of 300 mA, on the connection
        ],
        {
            label: '',
            p: {
                teller: true,
                bescherming: 'differentieel',
                polen: 4,
                amp: 40,
                delta: 300,
                diffType: 'A',
                kabel: '4x16',
            },
        },
    ),
]
// the terraced house of the templates, with a few symbols of the eendraadschema placed in its rooms
const plan = (language) => {
    const template = PLAN_TEMPLATES.find((candidate) => candidate.id === 'terraced')
    let counter = 0
    const pages = templatePages(
        template,
        50,
        (key) => translation(key, language),
        () => 'p' + ++counter,
    )
    const ground = template.floors[0],
        left = TEMPLATE_AREA.x + (TEMPLATE_AREA.w - template.w * 20) / 2,
        top = TEMPLATE_AREA.y + (TEMPLATE_AREA.h - template.h * 20) / 2,
        room = (name) => ground.rooms.find((candidate) => candidate.name === name),
        at = (name, fx, fy) => ({
            x: left + (room(name).x + room(name).w * fx) * 20,
            y: top + (room(name).y + room(name).h * fy) * 20,
        })
    const place = (id, name, fx, fy, r = 0) => ({
        id: 'i' + id,
        kind: 'sym',
        node: id,
        ...at(name, fx, fy),
        r,
        s: 7,
    })
    const items = [
        place('A1', 'living', 0.15, 0.2),
        place('A2', 'living', 0.8, 0.2),
        place('A3', 'living', 0.15, 0.85),
        place('B2', 'living', 0.5, 0.25),
        place('B1', 'living', 0.9, 0.85),
        place('B3', 'hall', 0.5, 0.3),
        place('B4', 'hall', 0.75, 0.75),
        place('C1', 'storage', 0.5, 0.3),
        place('D1', 'kitchen', 0.2, 0.25),
        place('E1', 'kitchen', 0.55, 0.25),
        place('F1', 'kitchen', 0.85, 0.25),
        place('B5', 'kitchen', 0.5, 0.6),
        place('G1', 'storage', 0.5, 0.75),
        place('T', 'hall', 0.3, 0.85),
        place('B', 'hall', 0.7, 0.85),
        place('SB', 'living', 0.5, 0.85),
    ]
    return pages.map((page, index) => ({
        id: 's' + (index + 1),
        ...page,
        items: index === 0 ? [...page.items, ...items] : page.items,
    }))
}
// moves a drawing to the right, out from under the tool rail on the left of the sheet
const shiftRight = (dx, pages) =>
    pages.map((page) => {
        const move = (point) => (point && Number.isFinite(point.x) ? {...point, x: point.x + dx} : point)
        return {
            ...page,
            items: page.items.map(move),
            wires: page.wires.map((wire) => ({...wire, a: move(wire.a), b: move(wire.b), points: wire.points.map(move)})),
            boxes: page.boxes.map((box) => ({...box, x1: box.x1 + dx, x2: box.x2 + dx})),
        }
    })
// the bedradingsschema: the control and the power circuit of a fan with a contactor (start / stop, emergency stop, thermal relay)
const wiringSymbol = (id, type, x, y, s, mark) => ({id, kind: 'sym', type, x, y, r: 0, s, ...(mark ? {mark} : {})})
const cable = (id, a, b, color, points = [], extra = {}) => ({id, a, b, points, style: 'solid', color, w: 0.35, ortho: true, ...extra})
const pin = (item, index) => ({item, pin: index})
const at = (x, y) => ({x, y})
const wiring = (language) => {
    const words = {
        nl: {name: 'Ventilator', control: 'Sturing', power: 'Vermogen'},
        fr: {name: 'Ventilateur', control: 'Commande', power: 'Puissance'},
        en: {name: 'Fan', control: 'Control', power: 'Power'},
    }[language]
    const text = (id, x, y, txt, s = 4) => ({id, kind: 'text', x, y, txt, s, r: 0})
    return shiftRight(18, [
        {
            id: 'w1',
            name: words.name,
            walls: [],
            items: [
                wiringSymbol('F1', 'zekering_s', 50, 35, 12, 'F1'),
                wiringSymbol('S0', 'noodstop', 50, 60, 12, 'S0'),
                wiringSymbol('S1', 'drukknop_nc', 50, 85, 12, 'S1'),
                wiringSymbol('S2', 'drukknop_no', 50, 110, 12, 'S2'),
                wiringSymbol('K1h', 'contact_no', 80, 110, 12, 'K1'),
                wiringSymbol('K1', 'spoel', 50, 145, 12, 'K1'),
                wiringSymbol('X1', 'klemmenstrook', 185, 30, 24, 'X1'),
                wiringSymbol('KM', 'contactor3', 182, 80, 24, 'K1'),
                wiringSymbol('F2a', 'thermisch', 170, 115, 12),
                wiringSymbol('F2b', 'thermisch', 182, 115, 12, 'F2'),
                wiringSymbol('F2c', 'thermisch', 194, 115, 12),
                wiringSymbol('M1', 'motor', 182, 160, 16, 'M1'),
                text('t1', 22, 12, words.control),
                text('t2', 145, 13, words.power),
                text('L', 44, 22, 'L', 3),
                text('N', 44, 176, 'N', 3),
            ],
            wires: [
                cable('c1', pin('F1', 1), pin('S0', 0), 'red'),
                cable('c2', pin('S0', 1), pin('S1', 0), 'red'),
                cable('c3', pin('S1', 1), pin('S2', 0), 'red'),
                cable('c4', pin('S2', 1), pin('K1', 0), 'red'),
                cable('c5', at(50, 98), pin('K1h', 0), 'red', [at(80, 98)]),
                cable('c6', pin('K1h', 1), at(50, 124), 'red', [at(80, 124)]),
                cable('c7', pin('K1', 1), at(50, 170), 'blue'),
                cable('p1', pin('X1', 4), pin('KM', 0), 'brown', [at(176, 55), at(170, 55)], {w: 0.5}),
                cable('p2', pin('X1', 5), pin('KM', 1), 'black', [], {w: 0.5}),
                cable('p3', pin('X1', 6), pin('KM', 2), 'gray', [at(188, 55), at(194, 55)], {w: 0.5}),
                cable('p4', pin('KM', 3), pin('F2a', 0), 'brown', [], {w: 0.5}),
                cable('p5', pin('KM', 4), pin('F2b', 0), 'black', [], {w: 0.5}),
                cable('p6', pin('KM', 5), pin('F2c', 0), 'gray', [], {w: 0.5}),
                cable('p7', pin('F2a', 1), pin('M1', 1), 'brown', [], {w: 0.5}),
                cable('p8', pin('F2b', 1), pin('M1', 0), 'black', [], {w: 0.5}),
                cable('p9', pin('F2c', 1), pin('M1', 2), 'gray', [], {w: 0.5}),
                cable('pe', pin('X1', 7), pin('M1', 3), 'yellowgreen', [at(215, 48), at(215, 178), at(182, 178)], {w: 0.5}),
            ],
            boxes: [
                {id: 'b1', x1: 20, y1: 15, x2: 110, y2: 182, style: 'dashdot', color: 'gray', w: 0.35},
                {id: 'b2', x1: 140, y1: 6, x2: 230, y2: 184, style: 'dashdot', color: 'gray', w: 0.35},
            ],
        },
    ])
}

const house = (language) => ({
    name: 'Woning Vermeulen',
    footer: {
        titel: 'Woning Vermeulen',
        straat: 'Kerkstraat',
        nr: '12',
        postcode: '9000',
        gemeente: 'Gent',
        eigenaar: 'Vermeulen',
        tekenaar: 'Plugged',
        stelsel: '2x230V TT',
        rev: 'A',
        datum: '2026-11-17',
        schaal: '1:50',
        installatiedatum: '2026',
    },
    een: [
        {
            id: 'e1',
            name: {nl: 'Hoofdbord', fr: 'Tableau principal', en: 'Main board'}[language],
            tree: tree(),
        },
    ],
    sit: plan(language),
    wire: wiring(language),
    custom: [],
})

// ---- the pictures -----------------------------------------------------------------------------------------------------------
const shoot = async (target, language, name) => {
    const png = resolve(OUT, language, name + '.png')
    mkdirSync(dirname(png), {recursive: true})
    await target.screenshot({path: png, animations: 'disabled'})
    execFileSync('python3', [
        '-c',
        'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], "WEBP", quality=82, method=6)',
        png,
        png.replace(/\.png$/, '.webp'),
    ])
    rmSync(png)
}
// a part of the page: the union of the boxes of `locators` (with a margin), or the top `height` pixels
const shootArea = async (page, language, name, {locators = [], height} = {}) => {
    const png = resolve(OUT, language, name + '.png')
    mkdirSync(dirname(png), {recursive: true})
    let clip = {x: 0, y: 0, width: page.viewportSize().width, height}
    if (locators.length) {
        const boxes = await Promise.all(locators.map((locator) => locator.boundingBox()))
        const x = Math.max(0, Math.min(...boxes.map((box) => box.x)) - 12),
            y = Math.max(0, Math.min(...boxes.map((box) => box.y)) - 12)
        clip = {x, y, width: Math.max(...boxes.map((box) => box.x + box.width)) + 12 - x, height: Math.max(...boxes.map((box) => box.y + box.height)) + 12 - y}
    }
    await page.screenshot({path: png, clip, animations: 'disabled'})
    execFileSync('python3', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], "WEBP", quality=82, method=6)', png, png.replace(/\.png$/, '.webp')])
    rmSync(png)
}
const json = (body) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
})
const people = [
    {id: 2, name: 'Test', surname: 'Gebruiker'},
    {id: 3, name: 'An', surname: 'Peeters'},
    {id: 4, name: 'Bram', surname: 'Janssens'},
    {id: 5, name: 'Lotte', surname: 'Maes'},
    {id: 6, name: 'Yusuf', surname: 'Demir'},
]
const member = (person, owner = false) => ({
    ...person,
    email: person.name.toLowerCase() + '@school.be',
    owner,
})
const groups = [
    {
        id: 1,
        name: '6 Elektriciteit A',
        created: '2026-09-01T08:00:00',
        educational: true,
        members: [member(people[1], true), member(people[2]), member(people[3]), member(people[4])],
    },
    {
        id: 2,
        name: 'Installateurs',
        created: '2026-03-12T08:00:00',
        educational: false,
        members: [member(people[0], true), member(people[1])],
    },
]

for (const language of LANGUAGES) {
    test(`Info screenshots (${language})`, async ({page, app, backend}) => {
        await page.addInitScript((lang) => localStorage.setItem('plugged.language', lang), language)
        await backend.seed(2, {
            ...house(language),
            footer: {...house(language).footer, titel: 'Appartement Peeters'},
        })
        await backend.seed(3, {
            ...house(language),
            footer: {...house(language).footer, titel: 'Garage'},
        })
        // a list of projects of several people, shared with groups
        await page.route('**/api/projects/summaries', (route) =>
            route.fulfill(
                json([
                    {
                        id: 1,
                        name: 'Woning Vermeulen',
                        updated: '2026-11-17T10:42:00',
                        owner: {id: 2, name: 'Test Gebruiker'},
                        groups: [{id: 2, name: 'Installateurs'}],
                        mine: true,
                        canManage: true,
                    },
                    {
                        id: 2,
                        name: 'Appartement Peeters',
                        updated: '2026-11-16T15:10:00',
                        owner: {id: 3, name: 'An Peeters'},
                        groups: [{id: 2, name: 'Installateurs'}],
                        mine: false,
                        canManage: false,
                    },
                    {
                        id: 3,
                        name: 'Garage',
                        updated: '2026-11-02T09:05:00',
                        owner: {id: 2, name: 'Test Gebruiker'},
                        groups: [],
                        mine: true,
                        canManage: true,
                    },
                ]),
            ),
        )
        await app.open(backend, house(language))

        // the eendraadschema, with a circuit selected (Eigenschappen)
        await page.locator('[data-nid="A"]').first().click()
        await expect(page.locator('#eds-props')).toBeVisible()
        await page.waitForTimeout(300)
        await shoot(page, language, 'eendraadschema')

        // Controleer
        await page.locator('#btn-verify').click()
        await expect(page.locator('#verify-panel')).toBeVisible()
        await shoot(page, language, 'controleren')
        await page.locator('#verify-close').click()

        // the situatieschema, and the choice of templates
        await app.tab('sit')
        await expect(page.locator('svg.sheet').first()).toBeVisible()
        // the tool rail on the drawing: Muur chosen with its key, the mouse on it shows its name and key
        await page.keyboard.press(await page.locator('#sit-tool-wall kbd').textContent())
        await page.locator('#sit-tool-wall').hover()
        await page.waitForTimeout(300)
        await shoot(page, language, 'situatieschema')
        await page.keyboard.press('Escape')
        await page.locator('#sit-template').click()
        await expect(page.locator('#template-dialog')).toBeVisible()
        await shoot(page.locator('#template-dialog'), language, 'sjablonen')
        await page.keyboard.press('Escape')

        // the bedradingsschema: drawing a wire, with the connection points of the symbols and the line style
        await app.tab('wire')
        await expect(page.locator('#wire-sheet')).toBeVisible()
        await page.locator('#wire-tool-wire').click()
        await page.locator('#wire-pen-color-red').click()
        // the mouse on the contact K1; measuring the point scrolls the page a little: back to the top with the mouse on the same spot
        const contact = await app.sheetPoint(98.3, 104.4),
            scrolled = await page.evaluate(() => window.scrollY)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.mouse.move(contact.x, contact.y + scrolled)
        await page.waitForTimeout(300)
        await shoot(page, language, 'bedradingsschema')
        await page.keyboard.press('Escape')

        // Project: the list of projects, the QR code, the materiaallijst, Exporteren
        await app.project()
        await page.locator('#btn-load').click()
        await expect(page.locator('#project-list')).toBeVisible()
        await shootArea(page, language, 'projecten', {locators: [page.locator('#project-menu'), page.locator('#project-list')]})
        await page.keyboard.press('Escape')
        await page.keyboard.press('Alt+q')
        await expect(page.locator('#qr-dialog svg')).toBeVisible()
        await shoot(page.locator('#qr-dialog'), language, 'qr')
        await page.keyboard.press('Escape')
        await app.project()
        await page.locator('#btn-materials').click()
        await expect(page.locator('#materials-dialog')).toBeVisible()
        await shoot(page.locator('#materials-dialog'), language, 'materiaallijst')
        await page.locator('#materials-close').click()
        await app.project()
        await page.locator('#btn-export').click()
        await expect(page.locator('#export-dialog')).toBeVisible()
        await page.locator('#export-type-png').check()
        await shoot(page.locator('#export-dialog'), language, 'exporteren')
        await page.keyboard.press('Escape')

        // Componenten: a symbol in the editor
        await app.tab('comp')
        await page.locator('#comp-item-stopcontact_pekid').evaluate((button) => (button.closest('details').open = true))
        await page.locator('#comp-item-stopcontact_pekid').click()
        await expect(page.locator('#comp-drawing')).toBeVisible()
        await shootArea(page, language, 'componenten', {height: 760})

        // Account → Controleregels
        await app.tab('account')
        await page.locator('#account-tab-rules').click()
        await page.waitForTimeout(200)
        await shoot(page, language, 'controleregels')
    })

    test(`Info screenshots of the groups (${language})`, async ({page, app, backend}) => {
        await page.addInitScript((lang) => localStorage.setItem('plugged.language', lang), language)
        // an administrator: Account → Groepen
        const admin = {...FAKE_USER, admin: true, primary: true}
        await page.route('**/api/auth/status', (route) =>
            route.fulfill(
                json({
                    setupRequired: false,
                    adminEmail: 'admin@school.be',
                    user: admin,
                }),
            ),
        )
        await page.route('**/api/admin/groups', (route) => route.fulfill(json(groups)))
        await page.route('**/api/admin/users', (route) =>
            route.fulfill(
                json(
                    people.map((person, index) => ({
                        ...member(person),
                        admin: index === 0,
                        approved: true,
                        created: '2026-09-01T08:00:00',
                        primary: index === 0,
                        lastLogin: '2026-11-17T09:0' + index + ':00',
                        loginCount: 12 + index * 7,
                        restricted: index > 1,
                        ownedGroups: index === 1 ? [1] : [],
                        lockedUntil: null,
                        mustChangePassword: false,
                    })),
                ),
            ),
        )
        await app.open(backend, house(language))
        await app.tab('account')
        await page.locator('#admin-tab-groups').click()
        await expect(page.locator('#account-page')).toContainText('6 Elektriciteit A')
        await page.waitForTimeout(200)
        await shootArea(page, language, 'groepen', {height: 520})
    })

    test(`Info screenshot of the educational mode (${language})`, async ({page, app, backend}) => {
        await page.addInitScript((lang) => localStorage.setItem('plugged.language', lang), language)
        // a teacher: 🎓 Mijn groepen
        const teacher = {
            ...FAKE_USER,
            ...member(people[1]),
            ownedGroups: [1],
            restricted: false,
        }
        await page.route('**/api/auth/status', (route) =>
            route.fulfill(
                json({
                    setupRequired: false,
                    adminEmail: 'admin@school.be',
                    user: teacher,
                }),
            ),
        )
        await page.route('**/api/groups/owned', (route) => route.fulfill(json([groups[0]])))
        await app.open(backend, house(language))
        await page.locator('#tab-teacher').click()
        await expect(page.locator('body')).toContainText('6 Elektriciteit A')
        await page.waitForTimeout(200)
        await shootArea(page, language, 'educatief', {height: 300})
    })
}
