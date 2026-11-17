// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// Export of all sheets as a zip: SVG drawings or PNG images, one per sheet.
import {render} from '@testing-library/react'
import {strFromU8, unzipSync} from 'fflate'
import {pagesZipName, pngSize, safeFileName, sheetFileNames, sheetsPngZip, sheetsSvgZip, sheetToSvg, standaloneSvg, zipFiles} from '../../../features/project/pagesExport.js'
import {AllSheets} from '../../../features/project/pdfExport.jsx'
import {sheetPlan} from '../../../model/boardLayout.js'
import {setLanguage, t} from '../../../i18n/translate.js'
import {baseProject, node} from '../../utils.jsx'

vi.mock('jspdf', () => ({jsPDF: class {}}))
vi.mock('svg2pdf.js', () => ({svg2pdf: async () => {}}))

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

describe('SVG', () => {
    test('a sheet as an SVG file of its own: XML, A4 landscape in millimetres, the same drawing', () => {
        const {container} = render(<AllSheets project={house()} />),
            svg = container.querySelector('svg.sheet'),
            text = strFromU8(sheetToSvg(svg))
        expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg')).toBe(true)
        const file = new DOMParser().parseFromString(text, 'image/svg+xml')
        expect(file.querySelector('parsererror')).toBeNull()
        const root = file.documentElement
        expect(root.namespaceURI).toBe('http://www.w3.org/2000/svg')
        expect(root.getAttribute('width')).toBe('297mm')
        expect(root.getAttribute('height')).toBe('210mm')
        expect(root.getAttribute('viewBox')).toBe('0 0 297 210')
        // everything that is drawn is in it: the same elements, the texts of the sheet
        expect(root.querySelectorAll('*').length).toBe(svg.querySelectorAll('*').length)
        expect(root.textContent).toContain('Keuken; links')
        // the sheet on the page keeps its own size
        expect(svg.getAttribute('width')).toBeNull()
    })
    test('the zip holds one SVG per sheet, named and ordered as the PNG files', async () => {
        const {container} = render(<AllSheets project={house()} />),
            unzipped = unzipSync(await sheetsSvgZip(house(), container))
        expect(Object.keys(unzipped)).toEqual(sheetFileNames(house(), 'svg'))
        expect(Object.keys(unzipped)).toEqual([
            `01 ${t('pagesExport.oneWireFile')} - Hoofd.svg`,
            `02 ${t('pagesExport.situationFile')} - Gelijkvloers.svg`,
            `03 ${t('pagesExport.situationFile')} - Verdieping-zolder.svg`, // no "/" in a file name
        ])
        const sheets = container.querySelectorAll('svg.sheet')
        Object.values(unzipped).forEach((bytes, index) => {
            const root = new DOMParser().parseFromString(strFromU8(bytes), 'image/svg+xml').documentElement
            expect(root.getAttribute('width')).toBe('297mm')
            expect(root.querySelectorAll('*').length).toBe(sheets[index].querySelectorAll('*').length)
        })
    })
    test('the names follow the language', () => {
        setLanguage('fr')
        try {
            expect(sheetFileNames(house(), 'svg')[1]).toBe('02 Plan de position - Gelijkvloers.svg')
        } finally {
            setLanguage('nl')
        }
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

test('a PNG is stored as it is in the zip, an SVG is compressed', () => {
    const drawing = new TextEncoder().encode('<svg>' + 'x'.repeat(5000) + '</svg>'),
        picture = new Uint8Array(5000).fill(7)
    const zipped = zipFiles({'a.svg': drawing, 'b.png': picture})
    expect(zipped.length).toBeLessThan(5000 + 400) // the SVG (5011 bytes) shrinks to a few dozen, the PNG (5000 bytes) is stored
    expect(zipped.length).toBeGreaterThan(5000)
    expect([...unzipSync(zipped)['b.png']]).toEqual([...picture])
})

test('file names: the title of the kader, and nothing a file system refuses', () => {
    expect(pagesZipName(house(), 'svg')).toBe('Villa Zon-svg.zip')
    expect(pagesZipName({...house(), footer: {}}, 'png')).toBe('schema-png.zip')
    expect(safeFileName('a/b\\c:d*e?"f"<g>|h')).toBe('a-b-c-d-e-f-g-h')
    expect(safeFileName('   ')).toBe('-')
})
