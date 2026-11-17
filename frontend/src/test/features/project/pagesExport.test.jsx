// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Export of all pages as a zip: CSV files (one per page) and PNG images (one per sheet).
import {render} from '@testing-library/react'
import {strFromU8, unzipSync} from 'fflate'
import {
    oneWireRows,
    pagesCsvFiles,
    pagesCsvZip,
    pagesZipName,
    pngSize,
    safeFileName,
    sheetFileNames,
    sheetsPngZip,
    situationRows,
    standaloneSvg,
} from '../../../features/project/pagesExport.js'
import {AllSheets} from '../../../features/project/pdfExport.jsx'
import {sheetPlan} from '../../../model/boardLayout.js'
import {setLanguage, t} from '../../../i18n/translate.js'
import {baseProject, node} from '../../utils.jsx'

vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))

const BOM = '\ufeff'
const house = () => ({
    ...baseProject(),
    footer: {titel: 'Villa Zon', schaal: '1:50'},
    een: [
        {
            id: 'e1',
            name: 'Hoofd',
            tree: [
                node('M', 'aansluiting', [
                    node('B', 'bord', [
                        node('A', 'kring', [node('S', 'stopcontact', [], {label: 'Keuken; links'}), node('L', 'lichtpunt')], {
                            label: 'A',
                            info: 'B16 2P XVB Cca 3G2,5',
                            p: {bescherming: 'automatisch', polen: 2, amp: 16, curve: 'B', kabel: 'XVB Cca 3G2,5'},
                        }),
                        node('D', 'kring', [node('W', 'wasmachine')], {label: 'D', p: {bescherming: 'differentieel', polen: 2, amp: 25, delta: 30, diffType: 'A', kabel: 'XVB Cca 3G2,5'}}),
                    ]),
                ]),
            ],
        },
    ],
    sit: [
        {
            id: 's1',
            name: 'Gelijkvloers',
            walls: [{id: 'w1', x1: 40, y1: 40, x2: 140, y2: 40}],
            items: [
                {id: 'i1', kind: 'sym', node: 'S', x: 50, y: 60, r: 90, s: 7},
                {id: 'i2', kind: 'sym', node: 'L', x: 80, y: 60, r: 0, s: 7, mark: 'Eigen'},
                {id: 'i3', kind: 'door', x: 60, y: 40, r: 0, w: 10},
                {id: 'i4', kind: 'text', x: 70, y: 100, r: 0, s: 4, txt: 'Keuken "oost"'},
            ],
        },
        {id: 's2', name: 'Verdieping/zolder', walls: [], items: []},
    ],
})

describe('CSV', () => {
    afterEach(() => setLanguage('nl'))
    test('an eendraadschema page: a header, then every element in tree order with its level, marking, element and properties', () => {
        const rows = oneWireRows(house(), house().een[0])
        expect(rows[0]).toEqual(['level', 'marking', 'element', 'label', 'protection', 'poles', 'current', 'curve', 'sensitivity', 'diffType', 'cable', 'text', 'info'].map((column) => t('pagesExport.oneWire.' + column)))
        const byLevel = rows.slice(1).map((row) => [row[0], row[1], row[3]])
        expect(byLevel).toEqual([
            [1, '', 'M'],
            [2, '', 'B'],
            [3, 'A', ''], // a circuit: its letter is the marking
            [4, 'A1', 'Keuken; links'],
            [4, 'A2', 'L'],
            [3, 'D', ''],
            [4, 'D1', 'W'],
        ])
        const circuitA = rows[3],
            circuitD = rows[6]
        expect(circuitA.slice(4, 11)).toEqual([t('oneWire.protections.automatisch'), 2, 16, 'B', '', '', 'XVB Cca 3G2,5'])
        expect(circuitD.slice(4, 11)).toEqual([t('oneWire.protections.differentieel'), 2, 25, '', 30, 'A', 'XVB Cca 3G2,5'])
        expect(rows[4][2]).toMatch(/stopcontact/i) // the element is the name of its symbol
    })
    test('a situatieschema page: walls with their real length at the scale, then the symbols, doors and texts', () => {
        const rows = situationRows(house(), house().sit[0])
        expect(rows[0][0]).toBe(t('pagesExport.situation.kind'))
        const [wall, socket, light, door, text] = rows.slice(1)
        expect(wall).toEqual([t('pagesExport.kinds.wall'), '', '', '40', '40', '140', '40', '5', '', '', '']) // 100 mm at 1:50 = 5 m
        expect(socket.slice(0, 5)).toEqual([t('pagesExport.kinds.sym'), expect.stringMatching(/stopcontact/i), 'A1', '50', '60'])
        expect(socket[8]).toBe('90')
        expect(socket[10]).toBe('Keuken; links') // the label of its element
        expect(light[2]).toBe('Eigen') // a marking typed on the plan wins
        expect(door[0]).toBe(t('pagesExport.kinds.door'))
        expect(door[9]).toBe('10')
        expect(text).toEqual([t('pagesExport.kinds.text'), '', '', '70', '100', '', '', '', '0', '4', 'Keuken "oost"'])
    })
    test('numbers use the decimal separator of the language', () => {
        const project = {...house(), sit: [{id: 's', name: 'P', walls: [{id: 'w', x1: 0, y1: 0, x2: 70, y2: 0}], items: []}]}
        expect(situationRows(project, project.sit[0])[1][7]).toBe('3,5')
        setLanguage('en')
        expect(situationRows(project, project.sit[0])[1][7]).toBe('3.5')
        expect(situationRows(project, project.sit[0])[0][0]).toBe('Kind')
    })
    test('one file per page, numbered in the order of the pages, as CSV for Excel: byte order mark, ";", quotes where needed', () => {
        const files = pagesCsvFiles(house())
        expect(Object.keys(files)).toEqual([
            `01 ${t('pagesExport.oneWireFile')} - Hoofd.csv`,
            `02 ${t('pagesExport.situationFile')} - Gelijkvloers.csv`,
            `03 ${t('pagesExport.situationFile')} - Verdieping-zolder.csv`, // no "/" in a file name
        ])
        const first = files[Object.keys(files)[0]]
        expect(first.startsWith(BOM)).toBe(true)
        expect(first.split('\r\n')[0]).toBe(BOM + oneWireRows(house(), house().een[0])[0].join(';'))
        expect(first).toContain('"Keuken; links"')
        expect(files[Object.keys(files)[1]]).toContain('"Keuken ""oost"""')
        // an empty page still has its header row
        expect(files[Object.keys(files)[2]].trim().split('\r\n')).toHaveLength(1)
    })
    test('the zip holds exactly those files', () => {
        const unzipped = unzipSync(pagesCsvZip(house())),
            files = pagesCsvFiles(house())
        expect(Object.keys(unzipped)).toEqual(Object.keys(files))
        for (const [name, text] of Object.entries(files)) {
            expect([...unzipped[name].subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // the byte order mark, in UTF-8
            expect(BOM + strFromU8(unzipped[name])).toBe(text.startsWith(BOM) ? text : BOM + text)
        }
    })
    test('the names follow the language', () => {
        setLanguage('fr')
        expect(Object.keys(pagesCsvFiles(house()))[1]).toBe('02 Plan de position - Gelijkvloers.csv')
    })
})

describe('PNG', () => {
    test('one file per sheet, in the order of the PDF; a page that takes several sheets is numbered (1), (2)', () => {
        const many = Array.from({length: 30}, (_, index) => node('K' + index, 'kring', [node('S' + index, 'stopcontact')], {label: 'K' + index, p: {polen: 2, amp: 16, curve: 'B'}}))
        const project = {...house(), een: [{id: 'e1', name: 'Groot', tree: [node('M', 'aansluiting', [node('B', 'bord', many)])]}]}
        const sheets = sheetPlan(project).filter((sheet) => sheet.kind === 'een').length
        expect(sheets).toBeGreaterThan(1)
        const names = sheetFileNames(project)
        expect(names).toHaveLength(sheetPlan(project).length)
        expect(names[0]).toBe(`01 ${t('pagesExport.oneWireFile')} - Groot (1).png`)
        expect(names[1]).toBe(`02 ${t('pagesExport.oneWireFile')} - Groot (2).png`)
        expect(names.at(-1)).toBe(`${String(names.length).padStart(2, '0')} ${t('pagesExport.situationFile')} - Verdieping-zolder.png`)
    })
    test('every rendered sheet is turned into a picture and zipped under its name', async () => {
        const {container} = render(<AllSheets project={house()} />),
            drawn = []
        const zip = await sheetsPngZip(house(), container, async (svg) => {
            drawn.push(svg)
            return new Uint8Array([0x89, 0x50, 0x4e, 0x47, drawn.length])
        })
        const unzipped = unzipSync(zip)
        expect(drawn).toHaveLength(container.querySelectorAll('svg.sheet').length)
        expect(Object.keys(unzipped)).toEqual(sheetFileNames(house()))
        expect([...unzipped[sheetFileNames(house())[2]]]).toEqual([0x89, 0x50, 0x4e, 0x47, 3])
    })
    test('a standalone copy of a sheet: its own size in pixels, and the styles of the stylesheets written on its elements', () => {
        const style = document.createElement('style')
        style.textContent = '.click-area { fill: transparent }'
        document.head.appendChild(style)
        try {
            const {container} = render(<AllSheets project={house()} />),
                svg = container.querySelector('svg.sheet')
            // an element that only a stylesheet makes transparent (as the click areas of the kader in the editor)
            const area = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
            area.setAttribute('class', 'click-area')
            svg.appendChild(area)
            // jsdom does not compute SVG properties such as fill from a stylesheet: what a browser computes is given here
            const computed = window.getComputedStyle
            vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
                const real = computed(element)
                return {getPropertyValue: (name) => (name === 'fill' && element.getAttribute('class') === 'click-area' ? 'transparent' : real.getPropertyValue(name))}
            })
            const copy = new DOMParser().parseFromString(standaloneSvg(svg), 'image/svg+xml').documentElement
            expect(copy.getAttribute('width')).toBe(String(pngSize().width))
            expect(copy.getAttribute('height')).toBe(String(pngSize().height))
            expect(copy.getAttribute('viewBox')).toBe('0 0 297 210')
            expect(copy.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
            // the click areas of the kader are transparent on the screen: also in the picture (without the style they would be black)
            const cell = copy.querySelector('.click-area')
            expect(cell).not.toBeNull()
            expect(cell.getAttribute('style')).toMatch(/fill:\s*transparent/)
            // the sheet itself is left untouched
            expect(area.getAttribute('style')).toBeNull()
            expect(svg.getAttribute('width')).toBeNull()
        } finally {
            style.remove()
            vi.restoreAllMocks()
        }
    })
    test('A4 landscape at 150 dpi', () => {
        expect(pngSize()).toEqual({width: 1754, height: 1240})
        expect(pngSize(300)).toEqual({width: 3508, height: 2480})
    })
})

test('file names: the title of the kader, and nothing a file system refuses', () => {
    expect(pagesZipName(house(), 'csv')).toBe('Villa Zon-csv.zip')
    expect(pagesZipName({...house(), footer: {}}, 'png')).toBe('schema-png.zip')
    expect(safeFileName('a/b\\c:d*e?"f"<g>|h')).toBe('a-b-c-d-e-f-g-h')
    expect(safeFileName('   ')).toBe('-')
})
