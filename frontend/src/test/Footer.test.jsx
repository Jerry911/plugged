// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render, screen} from '@testing-library/react'
import {FIELDS, FooterForm, Sheet} from '../Footer.jsx'
import {base} from './utils.jsx'
test('FooterForm renders all fields and reports changes', () => {
    const setP = vi.fn(),
        p = base()
    const {container} = render(<FooterForm p={p} setP={setP} />)
    const ins = container.querySelectorAll('input')
    expect(ins).toHaveLength(FIELDS.length)
    fireEvent.change(ins[1], {target: {value: 'Kerkstraat'}})
    expect(setP).toHaveBeenCalledWith({...p, footer: {...p.footer, straat: 'Kerkstraat'}})
})
test('Sheet draws footer info, page numbers and forwards props', () => {
    const p = base()
    p.footer = {
        ...p.footer,
        straat: 'Dorp',
        nr: '5',
        postcode: '9000',
        gemeente: 'Gent',
        eigenaar: 'Jan',
        ean: '541',
        tekenaar: 'Piet',
        stelsel: '230V TT',
        dossier: 'D1',
        keurder: 'Vinçotte',
    }
    const onClick = vi.fn()
    const {container, getByText} = render(
        <Sheet p={p} page={3} total={5} name="Test" onClick={onClick}>
            <circle />
        </Sheet>,
    )
    getByText('Blad 3/5')
    getByText(/Dorp 5, 9000 Gent/)
    getByText(/Jan 541/)
    getByText(/230V TT - dossier D1 - Vinçotte/)
    getByText('Piet')
    fireEvent.click(container.querySelector('svg'))
    expect(onClick).toHaveBeenCalled()
})
test('Sheet copes with empty footer', () => {
    const {getByText} = render(<Sheet p={{footer: {}}} page={1} name="N" />)
    getByText('Blad 1/2')
})
import {FooterDialog} from '../Footer.jsx'

test('footer cells are clickable when onFooter is given and show hints for empty values', () => {
    const onFooter = vi.fn(),
        p = base()
    p.footer = {}
    const {container} = render(<Sheet p={p} page={1} name="N" onFooter={onFooter} />)
    const cells = container.querySelectorAll('.fcell')
    expect(cells).toHaveLength(7)
    cells.forEach((c) => fireEvent.click(c))
    expect(onFooter.mock.calls.map((c) => c[0])).toEqual(['titel', 'straat', 'eigenaar', 'tekenaar', 'datum', 'rev', 'dossier'])
    expect(container.textContent.match(/klik om in te vullen/g)).toHaveLength(6)
})
test('no clickable cells or hints without onFooter (export/print)', () => {
    const p = base()
    p.footer = {}
    const {container} = render(<Sheet p={p} page={1} name="N" />)
    expect(container.querySelector('.fcell')).toBeNull()
    expect(container.textContent).not.toMatch(/klik om in te vullen/)
})
test('filled cells show their value instead of the hint', () => {
    const p = base()
    p.footer = {titel: 'Villa'}
    const {container} = render(<Sheet p={p} page={1} name="N" onFooter={() => {}} />)
    expect(container.textContent).toContain('Villa')
    expect(container.textContent.match(/klik om in te vullen/g)).toHaveLength(5)
})
test('FooterDialog focuses the requested field and closes on Escape / button', () => {
    const close = vi.fn()
    render(<FooterDialog p={base()} setP={() => {}} focus="tekenaar" onClose={close} />)
    const d = screen.getByRole('dialog', {name: 'Kaderinfo'})
    expect(document.activeElement).toBe(d.querySelectorAll('input')[7])
    fireEvent.keyDown(d, {key: 'a'})
    expect(close).not.toHaveBeenCalled()
    fireEvent.keyDown(d, {key: 'Escape'})
    fireEvent.click(screen.getByText('✕'))
    expect(close).toHaveBeenCalledTimes(2)
})
