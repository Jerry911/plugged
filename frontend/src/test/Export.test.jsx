// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {render, screen} from '@testing-library/react'
import {AllSheets, makePdf} from '../Export.jsx'
import {base, node} from './utils.jsx'

const docs = [];
const add = vi.fn(), save = vi.fn(), s2p = vi.fn(async () => {
})
vi.mock('jspdf', () => ({
    jsPDF: class {
        constructor(o) {
            this.o = o;
            docs.push(this);
            this.addPage = add;
            this.save = save
        }
    }
}))
vi.mock('svg2pdf.js', () => ({svg2pdf: (...a) => s2p(...a)}))
const P = () => {
    const p = base();
    p.een = [{id: 'e1', name: 'A', tree: [node('x', 'bord')]}, {id: 'e2', name: 'B', tree: []}];
    return p
}
test('AllSheets renders one sheet per page with global numbering', () => {
    const {container} = render(<AllSheets p={P()}/>);
    expect(container.querySelectorAll('svg.sheet')).toHaveLength(3);
    screen.getByText('Blad 3/3')
})
test('makePdf adds pages, renders each svg and saves', async () => {
    const p = P(), {container} = render(<AllSheets p={p}/>);
    await makePdf(p, container)
    expect(s2p).toHaveBeenCalledTimes(3);
    expect(s2p.mock.calls[0][2]).toEqual({x: 0, y: 0, width: 297, height: 210});
    expect(add).toHaveBeenCalledTimes(2);
    expect(docs[0].o).toMatchObject({orientation: 'landscape', format: 'a4'});
    expect(save).toHaveBeenCalledWith('T.pdf')
})
test('default file name', async () => {
    const p = P();
    p.footer = {};
    const {container} = render(<AllSheets p={p}/>);
    await makePdf(p, container);
    expect(save).toHaveBeenLastCalledWith('schema.pdf')
})
