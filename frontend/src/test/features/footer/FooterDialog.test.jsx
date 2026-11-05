// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
import {fireEvent, render} from '@testing-library/react'
import {FOOTER_FIELDS, FooterDialog, FooterForm} from '../../../features/footer/FooterDialog.jsx'
import Sheet from '../../../components/Sheet.jsx'
import {setLanguage, t} from '../../../i18n/translate.js'
import {baseProject, byId, getById} from '../../utils.jsx'

test('FooterForm renders all fields and reports changes', () => {
    const setProject = vi.fn(),
        project = baseProject()
    render(<FooterForm project={project} setProject={setProject} />)
    FOOTER_FIELDS.forEach((field) => expect(getById('footer-' + field)).toBeInTheDocument())
    fireEvent.change(getById('footer-straat'), {target: {value: 'Kerkstraat'}})
    expect(setProject).toHaveBeenCalledWith({...project, footer: {...project.footer, straat: 'Kerkstraat'}})
})
test('every field has a label in every language', () => {
    for (const language of ['nl', 'fr', 'en']) {
        setLanguage(language)
        FOOTER_FIELDS.forEach((field) => expect(t('footer.fields.' + field)).not.toBe('footer.fields.' + field))
    }
})
test('Sheet draws footer info, page numbers and forwards props', () => {
    const project = baseProject()
    project.footer = {
        ...project.footer,
        straat: 'Dorp',
        nr: '5',
        postcode: '9000',
        gemeente: 'Gent',
        eigenaar: 'Jan',
        ean: '541',
        tekenaar: 'Piet',
        stelsel: '230V TT',
        dossier: 'D1',
        schaal: '1:50',
        // no longer on the sheet (an older project can still hold them)
        keurder: 'Vinçotte',
        titel: 'Oude titel',
    }
    const onClick = vi.fn()
    const {container} = render(
        <Sheet project={project} number={3} total={5} sheetId="s" onClick={onClick}>
            <circle />
        </Sheet>,
    )
    expect(getById('s-number')).toHaveTextContent(t('sheet.pageOf', {number: 3, total: 5}))
    const text = container.textContent
    expect(text).toContain('Dorp 5, 9000 Gent')
    // EAN in the first box, the owner in his own
    expect(text).toContain(t('sheet.cells.ean') + '541')
    expect(text).toContain(t('sheet.cells.owner') + 'Jan')
    expect(text).toContain('230V TT - ' + t('sheet.dossier', {number: 'D1'}))
    expect(text).not.toContain('Vinçotte')
    expect(text).not.toContain('Oude titel')
    // the scale in its own box, in the lower row under the date
    expect(getById('s-scale')).toHaveTextContent(t('sheet.cells.scale') + ' 1:50')
    expect(Number(getById('s-scale').getAttribute('x'))).toBe(236)
    expect(text).toContain('Piet')
    fireEvent.click(container.querySelector('svg'))
    expect(onClick).toHaveBeenCalled()
})
test('Sheet copes with empty footer', () => {
    render(<Sheet project={{footer: {}}} number={1} sheetId="s" />)
    expect(getById('s-number')).toHaveTextContent(t('sheet.pageOf', {number: 1, total: 2}))
})

const CLICKABLE_CELLS = ['ean', 'straat', 'eigenaar', 'tekenaar', 'datum', 'rev', 'dossier', 'schaal']
test('footer cells are clickable when onFooter is given and show hints for empty values', () => {
    const onFooter = vi.fn(),
        project = baseProject()
    project.footer = {}
    const {container} = render(<Sheet project={project} number={1} sheetId="s" onFooter={onFooter} />)
    expect(container.querySelectorAll('.fcell')).toHaveLength(CLICKABLE_CELLS.length)
    CLICKABLE_CELLS.forEach((field) => fireEvent.click(getById('s-footer-' + field)))
    expect(onFooter.mock.calls.map((call) => call[0])).toEqual(CLICKABLE_CELLS)
    expect(container.textContent.split(t('sheet.clickToFill')).length - 1).toBe(6)
})
test('no clickable cells or hints without onFooter (export/print)', () => {
    const project = baseProject()
    project.footer = {}
    const {container} = render(<Sheet project={project} number={1} sheetId="s" />)
    expect(byId('s-footer-ean')).toBeNull()
    expect(byId('s-footer-schaal')).toBeNull()
    expect(container.textContent).not.toContain(t('sheet.clickToFill'))
})
test('filled cells show their value instead of the hint', () => {
    const project = baseProject()
    project.footer = {ean: 'Villa'}
    const {container} = render(<Sheet project={project} number={1} onFooter={() => {}} />)
    expect(container.textContent).toContain('Villa')
    expect(container.textContent.split(t('sheet.clickToFill')).length - 1).toBe(5)
})
test('FooterDialog focuses the requested field and closes on Escape / button', () => {
    const close = vi.fn()
    render(<FooterDialog project={baseProject()} setProject={() => {}} focus="tekenaar" onClose={close} />)
    const dialog = getById('footer-dialog')
    expect(document.activeElement).toBe(getById('footer-tekenaar'))
    fireEvent.keyDown(dialog, {key: 'a'})
    expect(close).not.toHaveBeenCalled()
    fireEvent.keyDown(dialog, {key: 'Escape'})
    fireEvent.click(getById('footer-close'))
    expect(close).toHaveBeenCalledTimes(2)
})
test('the labels of the sheet and the dialog follow the language', () => {
    setLanguage('fr')
    const {container} = render(<Sheet project={{footer: {}}} number={2} total={4} sheetId="s" onFooter={() => {}} />)
    expect(getById('s-number')).toHaveTextContent('Feuille 2/4')
    expect(container.textContent).toContain('cliquez pour compléter')
    render(<FooterDialog project={baseProject()} setProject={() => {}} onClose={() => {}} />)
    expect(getById('footer-dialog').querySelector('label[for="footer-schaal"]')).toHaveTextContent('Échelle')
})
