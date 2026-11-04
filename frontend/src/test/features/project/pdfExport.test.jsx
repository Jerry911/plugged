// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {render} from '@testing-library/react'
import {AllSheets, makePdf} from '../../../features/project/pdfExport.jsx'
import {defaultTree} from '../../../model/boardLayout.js'
import {t} from '../../../i18n/translate.js'
import {baseProject as base, node} from '../../utils.jsx'

// the page numbers of the rendered sheets, in order
const pageNumbers = (container) => [...container.querySelectorAll('svg.sheet .sheet-number')].map((text) => text.textContent)

const docs = []
const add = vi.fn(),
    save = vi.fn(),
    s2p = vi.fn(async () => {})
vi.mock('jspdf', () => ({
    jsPDF: class {
        constructor(o) {
            this.o = o
            docs.push(this)
            this.addPage = add
            this.save = save
        }
    },
}))
vi.mock('svg2pdf.js', () => ({svg2pdf: (...a) => s2p(...a)}))
const P = () => {
    const p = base()
    p.een = [
        {id: 'e1', name: 'A', tree: [node('x', 'bord')]},
        {id: 'e2', name: 'B', tree: []},
    ]
    return p
}
test('AllSheets renders one sheet per page with global numbering', () => {
    const {container} = render(<AllSheets project={P()} />)
    expect(container.querySelectorAll('svg.sheet')).toHaveLength(3)
    expect(pageNumbers(container).at(-1)).toBe(t('sheet.pageOf', {number: 3, total: 3}))
})
test('makePdf adds pages, renders each svg and saves', async () => {
    const p = P(),
        {container} = render(<AllSheets project={p} />)
    await makePdf(p, container)
    expect(s2p).toHaveBeenCalledTimes(3)
    expect(s2p.mock.calls[0][2]).toEqual({x: 0, y: 0, width: 297, height: 210})
    expect(add).toHaveBeenCalledTimes(2)
    expect(docs[0].o).toMatchObject({orientation: 'landscape', format: 'a4'})
    expect(save).toHaveBeenCalledWith('T.pdf')
})
test('default file name', async () => {
    const p = P()
    p.footer = {}
    const {container} = render(<AllSheets project={p} />)
    await makePdf(p, container)
    expect(save).toHaveBeenLastCalledWith('schema.pdf')
})

test('wide boards are exported on several sheets with continuous numbering', () => {
    const p = P()
    p.een[0].tree = defaultTree()
    p.een[0].tree[0].children[0].children = Array.from({length: 40}, (_, i) =>
        node('K' + i, 'kring', [node('s' + i, 'stopcontact')], {p: {polen: 2, amp: 16, curve: 'B', kabel: 'x', kortsl: 3}}),
    )
    const {container} = render(<AllSheets project={p} />)
    const n = container.querySelectorAll('svg.sheet').length
    expect(n).toBeGreaterThan(4)
    expect(pageNumbers(container)).toEqual(Array.from({length: n}, (_, i) => t('sheet.pageOf', {number: i + 1, total: n})))
})
